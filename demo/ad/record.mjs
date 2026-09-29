// Records ad.html to a 1080x1920 webm using Playwright's built-in video recorder.
// Usage: node record.mjs   (needs @playwright/test or playwright installed)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { rename, mkdir, readdir } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "output");
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  recordVideo: { dir: out, size: { width: 1080, height: 1920 } },
});
const t0 = Date.now();
const page = await ctx.newPage();
await page.goto("file://" + join(here, "ad.html"));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const t1 = Date.now();
const end = await page.evaluate(() => { window.startAd(); return window.END; });
await page.waitForTimeout(end * 1000);
await ctx.close();
await browser.close();

const files = (await readdir(out)).filter((f) => f.endsWith(".webm") && f !== "acalink-ad.webm");
if (files.length) await rename(join(out, files[files.length - 1]), join(out, "acalink-ad.webm"));

// Playwright's recorder starts at page creation; cut the load/font wait so the
// clip opens on the first frame of scene 1. Its bundled ffmpeg only does VP8/webm.
const ffmpeg = process.env.FFMPEG || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux";
const lead = ((t1 - t0) / 1000).toFixed(2);
const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", lead,
  "-i", join(out, "acalink-ad.webm"), "-t", String(end), "-c:v", "libvpx", "-b:v", "2M", "-crf", "10", "-an",
  join(out, "acalink-ad-final.webm")], { encoding: "utf8" });
if (r.status !== 0) throw new Error(r.stderr);
console.log("wrote", join(out, "acalink-ad-final.webm"), "(trimmed", lead, "s of lead-in)");
