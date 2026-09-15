// demo/scenes/vertical/v04-clock-in.js
// CostWorth's vertical (9:16) reshoot of the clock-in workflow — SPEC.md
// Phase 1A: "a single clock-in... a config flag per scene, not a rewrite of
// the recording mechanics." Same underlying feature as scenes/04-clock-in.js
// (verified real — see demo/README.md "Feature verification" #3/#4: real
// geolocated clock-in, Firestore write, headteacher's Class Monitor reading
// it back via a manual refresh, honestly — no onSnapshot in this app), but
// reshot, not cropped:
//   - runs at the vertical recording viewport (810x1440 — below the app's
//     1024px responsive breakpoint), so it drives the app's real mobile
//     layout: hamburger + off-canvas sidebar, not the desktop one squeezed
//     into a tall frame (see lib/nav.js goToTabMobile).
//   - pacing is a single short beat, not two intercut segments held for a
//     competition judge — CLIP_SECONDS controls how much story fits: 15s is
//     teacher-only, 30/45/60s add the headteacher's confirmation.
// No guardian/parent-app data anywhere in this scene — teacher and
// headteacher are both staff accounts (see lib/env.js), not the guardian
// account demo/README.md flags as still-real. That said, run-scene.js's
// preflight guard still blocks this scene along with every other one, per
// SPEC.md's blanket "no recording happens... until" wording — see
// lib/preflight.js.
import { openRoleContext } from "../../lib/browser.js";
import { signInAs } from "../../lib/webAuth.js";
import { goToTabMobile } from "../../lib/nav.js";
import { humanClick, beat, spotlight } from "../../lib/humanize.js";
import { env } from "../../lib/env.js";

// CostWorth Primary Navy (CLAUDE.md) — see humanize.js spotlight().
const COSTWORTH_NAVY = "#1F3352";

// One pacing table per allowed CLIP_SECONDS value (lib/env.js
// ALLOWED_CLIP_SECONDS), each hand-tuned rather than linearly scaled from a
// base — a 15s clip needs to cut a whole beat, not just shorten every hold
// proportionally into something too fast to read.
const PACING = {
  15: {
    includeHeadteacher: false,
    openingHold: 0,
    preClickHold: 400,
    confirmHold: 2200,
  },
  30: {
    includeHeadteacher: true,
    openingHold: 900,
    preClickHold: 600,
    confirmHold: 1800,
    refreshHold: 500,
    resultHold: 1800,
  },
  45: {
    includeHeadteacher: true,
    openingHold: 1600,
    preClickHold: 900,
    confirmHold: 2600,
    refreshHold: 800,
    resultHold: 2800,
  },
  60: {
    includeHeadteacher: true,
    openingHold: 2400,
    preClickHold: 1200,
    confirmHold: 3400,
    refreshHold: 1100,
    resultHold: 3600,
  },
};

export async function run({ browser, sceneDir }) {
  const pacing = PACING[env.video.clipSeconds];
  const segments = [];

  // ── Teacher: clock in (mobile layout) ──
  {
    const { context, page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "a-teacher" });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: env.geofence.latitude,
      longitude: env.geofence.longitude,
    });

    await signInAs(page, "teacher", { mobile: true });
    await goToTabMobile(page, "Timetable");
    if (pacing.openingHold > 0) await beat(page, pacing.openingHold); // a moment on the timetable before acting

    const clockInBtn = page.getByRole("button", { name: "Clock In" }).first();
    await clockInBtn.waitFor({ state: "visible", timeout: 15_000 });
    await spotlight(clockInBtn, COSTWORTH_NAVY);
    await beat(page, pacing.preClickHold);
    await humanClick(clockInBtn, { pauseAfter: 400 });

    // Real network round-trip: geolocation -> geofence check -> Firestore write.
    await page.getByText(/Clocked in/i).first().waitFor({ timeout: 15_000 });
    await beat(page, pacing.confirmHold); // hold on the confirmed "Clocked in HH:MM" state

    segments.push(await finish());
  }

  if (!pacing.includeHeadteacher) return segments;

  // ── Head teacher: Class Monitor, one manual refresh (mobile layout) ──
  {
    const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "b-headteacher" });
    await signInAs(page, "headteacher", { mobile: true });
    await goToTabMobile(page, "Class Monitor");

    const refreshBtn = page.getByTitle("Refresh");
    await spotlight(refreshBtn, COSTWORTH_NAVY);
    await beat(page, 400);
    await humanClick(refreshBtn, { pauseAfter: pacing.refreshHold });

    const row = page.getByText("In progress").first();
    await row.waitFor({ timeout: 15_000 });
    await spotlight(row, COSTWORTH_NAVY);
    await beat(page, pacing.resultHold); // hold so "In progress" + the clock-in time reads clearly

    segments.push(await finish());
  }

  return segments;
}
