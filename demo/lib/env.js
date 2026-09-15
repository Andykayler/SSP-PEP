// demo/lib/env.js
// Loads demo/.env once and exposes it as a plain object with fail-fast checks
// for the values every scene needs. Never import this from src/ or acalink/ —
// this workspace is not part of the app build.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_ROOT = path.resolve(__dirname, "..");

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name} in demo/.env. Copy demo/.env.example to demo/.env and fill it in ` +
      `(passwords included — the seed script creates the accounts with whatever is there).`,
    );
  }
  return v;
}

// ── Recording profile ────────────────────────────────────────────────────────
// "landscape" is the original 1920x1080 competition pipeline — untouched,
// still the default so existing `npm run scene <01..07>` calls behave exactly
// as before.
//
// "vertical" is CostWorth's 9:16 reshoot (CostWorth SPEC.md, Phase 1A). It is
// deliberately NOT "record landscape, crop to 9:16 in post" — the recording
// viewport (810x1440) sits below the app's own 1024px responsive breakpoint
// (src/styles/dashboard-layout.css), so Playwright drives the app's real
// mobile layout: off-canvas hamburger sidebar instead of the always-open
// desktop one. That's what makes it a reshoot rather than a crop. 810x1440
// keeps an exact 9:16 ratio while staying under the breakpoint; `deliver` is
// the platform-standard 1080x1920 the final ffmpeg concat scales up to (see
// lib/ffmpeg.js concatToMp4) — a clean 4:3 upscale, no letterboxing.
const PROFILES = {
  landscape: {
    record: { width: 1920, height: 1080 },
    deliver: { width: 1920, height: 1080 },
  },
  vertical: {
    record: { width: 810, height: 1440 },
    deliver: { width: 1080, height: 1920 },
  },
};

function resolveProfile() {
  const name = (process.env.RECORD_PROFILE || "landscape").toLowerCase();
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(
      `Unknown RECORD_PROFILE "${process.env.RECORD_PROFILE}" in demo/.env. ` +
      `Use one of: ${Object.keys(PROFILES).join(", ")}.`,
    );
  }
  return { name, ...profile };
}

// ── Clip length ───────────────────────────────────────────────────────────────
// Per-scene target duration for the vertical scene library (a config flag per
// scene, not a rewrite of the recording mechanics — SPEC.md). Landscape
// scenes ignore this entirely; they keep their own fixed, competition-length
// pacing from lib/humanize.js beat() calls.
const ALLOWED_CLIP_SECONDS = [15, 30, 45, 60];

function resolveClipSeconds() {
  if (!process.env.CLIP_SECONDS) return 30;
  const n = Number(process.env.CLIP_SECONDS);
  if (!ALLOWED_CLIP_SECONDS.includes(n)) {
    throw new Error(
      `CLIP_SECONDS must be one of ${ALLOWED_CLIP_SECONDS.join("/")} in demo/.env, ` +
      `got "${process.env.CLIP_SECONDS}".`,
    );
  }
  return n;
}

const profile = resolveProfile();

export const env = {
  baseUrl: process.env.BASE_URL || "https://ssp-pep.vercel.app",
  parentAppUrl: process.env.PARENT_APP_URL || "http://localhost:5050",

  serviceAccountPath: path.resolve(
    DEMO_ROOT,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "../ssp-pep-firebase-adminsdk-fbsvc-a71809ca23.json",
  ),

  schoolCode: process.env.DEMO_SCHOOL_CODE || "CHIKHO-DEMO",
  schoolName: process.env.DEMO_SCHOOL_NAME || "Chikho Community Day Secondary School",

  admin: { email: required("ADMIN_EMAIL"), password: required("ADMIN_PASSWORD") },
  headteacher: { email: required("HEADTEACHER_EMAIL"), password: required("HEADTEACHER_PASSWORD") },
  teacher: { email: required("TEACHER_EMAIL"), password: required("TEACHER_PASSWORD") },
  bursar: { email: required("BURSAR_EMAIL"), password: required("BURSAR_PASSWORD") },
  // The parent app logs in with phone + portal password, not email — see
  // acalink/lib/services/auth_service.dart.
  //
  // BLOCKING (CostWorth SPEC.md, "Demo Recorder" prerequisite): as of this
  // writing PARENT_PHONE/PARENT_PASSWORD point at a real, existing guardian
  // account on the live Firebase project, not a fictional one. No CostWorth
  // recording may run against this pipeline until that's fixed AND
  // GUARDIAN_ACCOUNT_CONFIRMED_FICTIONAL=true is set below — see
  // lib/preflight.js, which every seed/record entry point calls.
  parent: { phone: required("PARENT_PHONE"), password: required("PARENT_PASSWORD") },
  guardianAccountConfirmedFictional: process.env.GUARDIAN_ACCOUNT_CONFIRMED_FICTIONAL === "true",

  learnerName: process.env.DEMO_LEARNER_NAME || "Chisomo Banda",
  learnerClass: process.env.DEMO_LEARNER_CLASS || "Form 3A",

  // A point in Lilongwe. Shared by seed.js (writes school_geofences) and
  // scene 04 (sets the recording browser's mocked geolocation to the same
  // point) so the real clock-in geofence check genuinely passes.
  geofence: { latitude: -13.9833, longitude: 33.7833, radiusMeters: 500 },

  // Malawian academic calendar (src/services/academicTerm.js): Term 2 runs
  // Jan-Apr. Chosen deliberately in the past relative to any recording date
  // so a full CA1-EndTerm progression and a full term of attendance can be
  // seeded — report-card release needs a *finished* term, not a just-started
  // one. Clock-in (scene 04) is dateless/term-less and uses the real today.
  currentTerm: "Term 2 2026",
  priorTerm: "Term 1 2026",

  video: {
    profile: profile.name,
    record: profile.record,
    deliver: profile.deliver,
    clipSeconds: resolveClipSeconds(),
    // Back-compat for any code still reading env.video.width/height directly —
    // always the recording viewport, same as before this file supported more
    // than one profile.
    width: profile.record.width,
    height: profile.record.height,
  },
};
