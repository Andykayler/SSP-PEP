#!/usr/bin/env node
// demo/scenes/run-scene.js
// CLI: `npm run scene 03` (or `node scenes/run-scene.js 03`), `npm run scene all`.
// Runs one scene's Playwright script (one context per role, video on),
// concatenates its segments into a single clip, and reports exact runtime.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchDemoBrowser } from "../lib/browser.js";
import { concatToMp4, getDuration, fmtDuration } from "../lib/ffmpeg.js";
import { DEMO_ROOT, env } from "../lib/env.js";
import { assertGuardianAccountSafe } from "../lib/preflight.js";
import { SCENES, VERTICAL_SCENES, findScene } from "./manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(DEMO_ROOT, "output", "scenes");
const RAW_DIR = path.join(DEMO_ROOT, "output", "clips");

async function runOne(scene) {
  if (scene.profile !== env.video.profile) {
    throw new Error(
      `Scene ${scene.id} (${scene.slug}) needs RECORD_PROFILE=${scene.profile} in demo/.env ` +
      `(currently "${env.video.profile}") — vertical is a reshoot, not a landscape recording ` +
      `cropped after the fact, so the two profiles are not interchangeable at record time.`,
    );
  }
  const targetSeconds = scene.targetSeconds ?? env.video.clipSeconds;
  console.log(`\n=== Scene ${scene.id} — ${scene.slug} (target ~${targetSeconds}s) ===`);
  const mod = await import(pathToFileURL(path.join(__dirname, scene.file)).href);
  const sceneDir = path.join(RAW_DIR, `${scene.id}-${scene.slug}`);
  fs.rmSync(sceneDir, { recursive: true, force: true });
  fs.mkdirSync(sceneDir, { recursive: true });

  const browser = await launchDemoBrowser();
  let segments;
  const startedAt = Date.now();
  try {
    segments = await mod.run({ browser, sceneDir, env });
  } finally {
    await browser.close();
  }
  const wallSeconds = (Date.now() - startedAt) / 1000;

  if (!segments || segments.length === 0) {
    throw new Error(`Scene ${scene.id} produced no video segments`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, `${scene.id}-${scene.slug}.mp4`);
  // Deliver at the profile's platform-standard size (1080x1920 for vertical),
  // independent of the recording viewport (810x1440) that got the app into
  // its mobile layout — see lib/env.js.
  concatToMp4(segments, outPath, { width: env.video.deliver.width, height: env.video.deliver.height });

  const duration = getDuration(outPath);
  console.log(`Scene ${scene.id} done: ${fmtDuration(duration)} (recorded in ${fmtDuration(wallSeconds)} wall time)`);
  console.log(`  -> ${outPath}`);
  return { scene, duration, outPath };
}

async function main() {
  const arg = process.argv[2];
  const ALL_SCENES = [...SCENES, ...VERTICAL_SCENES];
  if (!arg) {
    console.error("Usage: node scenes/run-scene.js <scene-id|slug|all>");
    console.error(`Landscape: ${SCENES.map((s) => `${s.id} (${s.slug})`).join(", ")}`);
    console.error(`Vertical (needs RECORD_PROFILE=vertical): ${VERTICAL_SCENES.map((s) => `${s.id} (${s.slug})`).join(", ")}`);
    process.exit(1);
  }

  // "all" stays landscape-only (the original competition reel) — vertical
  // scenes are run by id, one at a time, per CostWorth SPEC.md Phase 1A
  // ("don't build the batch runner yet").
  const targets = arg === "all" ? SCENES : [findScene(arg)];
  if (targets.some((t) => !t)) {
    console.error(`Unknown scene "${arg}". Options: ${ALL_SCENES.map((s) => s.id).join(", ")}, all`);
    process.exit(1);
  }

  assertGuardianAccountSafe();

  const results = [];
  for (const scene of targets) {
    results.push(await runOne(scene));
  }

  console.log("\n=== Summary ===");
  let total = 0;
  results.forEach(({ scene, duration }) => {
    total += duration;
    console.log(`  ${scene.id} ${scene.slug.padEnd(16)} ${fmtDuration(duration)}`);
  });
  console.log(`  TOTAL (scenes only, no titles) ${fmtDuration(total)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
