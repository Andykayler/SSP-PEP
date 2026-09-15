// demo/scenes/04-clock-in.js
// Teacher clocks in to today's seeded lesson (real geolocation check against
// the real school_geofences doc — Playwright mocks only the GPS reading
// itself, which is the one thing a browser can't get from a script; the
// app's distance check, Firestore write and read-back are all real).
// Cut to the head teacher's Class Monitor, one manual refresh, and the same
// record is there. No onSnapshot in this app (verified app-wide — see
// README) — the refresh is shown honestly rather than faked as live-push.
import { openRoleContext } from "../lib/browser.js";
import { signInAs } from "../lib/webAuth.js";
import { goToTab } from "../lib/nav.js";
import { humanClick, beat, spotlight } from "../lib/humanize.js";
import { env } from "../lib/env.js";

export async function run({ browser, sceneDir }) {
  const segments = [];

  // ── Teacher: clock in ──
  {
    const { context, page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "a-teacher" });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({
      latitude: env.geofence.latitude,
      longitude: env.geofence.longitude,
    });

    await signInAs(page, "teacher");
    await goToTab(page, "Timetable");

    const clockInBtn = page.getByRole("button", { name: "Clock In" }).first();
    await clockInBtn.waitFor({ state: "visible", timeout: 15_000 });
    await spotlight(clockInBtn);
    await beat(page, 700);
    await humanClick(clockInBtn, { pauseAfter: 400 });

    // Real network round-trip: geolocation -> geofence check -> Firestore write.
    await page.getByText(/Clocked in/i).first().waitFor({ timeout: 15_000 });
    await beat(page, 1800); // hold on the confirmed "Clocked in HH:MM" state

    segments.push(await finish());
  }

  // ── Head teacher: Class Monitor, one manual refresh ──
  {
    const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "b-headteacher" });
    await signInAs(page, "headteacher");
    await goToTab(page, "Class Monitor");
    await beat(page, 800);

    const refreshBtn = page.getByTitle("Refresh");
    await spotlight(refreshBtn);
    await beat(page, 600);
    await humanClick(refreshBtn, { pauseAfter: 300 });

    const row = page.getByText("In progress").first();
    await row.waitFor({ timeout: 15_000 });
    await spotlight(row);
    await beat(page, 2200); // hold so the "In progress" + clock-in time reads clearly

    segments.push(await finish());
  }

  return segments;
}
