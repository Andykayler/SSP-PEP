// demo/lib/browser.js
// One Chromium instance per scene run; one fresh context (Playwright's own
// video recorder attached) per role. Headed, per the brief — no
// screen-recording software involved anywhere in this pipeline. Window/
// viewport size follows env.video.record, which depends on RECORD_PROFILE
// (landscape 1920x1080 or CostWorth's vertical 810x1440 — see lib/env.js).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

export async function launchDemoBrowser() {
  const { width, height } = env.video.record;
  // No --start-maximized: for the vertical profile that would maximize the
  // window to the monitor's landscape shape while a portrait viewport
  // renders inside it — fine for the captured video (only the viewport is
  // recorded) but confusing to watch live. Sizing the window to the viewport
  // (plus a little for Chrome's own frame/toolbar) keeps what Andy sees
  // on screen honest about what's being recorded, in both profiles.
  return chromium.launch({
    headless: false,
    args: [`--window-size=${width},${height + 90}`],
  });
}

/**
 * Opens one browser context for one role/segment, video recording on from
 * the first frame. Returns `finish()` which closes the context, waits for
 * Playwright to flush the .webm, and moves it to a deterministic path so the
 * per-scene stitcher can find segments in order without guessing hashes.
 */
export async function openRoleContext(browser, { sceneDir, segmentName }) {
  const viewport = { width: env.video.record.width, height: env.video.record.height };
  fs.mkdirSync(sceneDir, { recursive: true });

  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: sceneDir, size: viewport },
  });
  const page = await context.newPage();

  async function finish() {
    const video = page.video();
    await context.close();
    const finalPath = path.join(sceneDir, `${segmentName}.webm`);
    if (video) {
      const tmpPath = await video.path();
      fs.renameSync(tmpPath, finalPath);
      return finalPath;
    }
    return null;
  }

  return { context, page, finish };
}
