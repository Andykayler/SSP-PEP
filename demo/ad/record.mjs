// Renders ad.html frame by frame (1080x1920, 30 fps) and muxes build/voiceover.wav into
// output/acalink-ad.mp4 (H.264 + AAC). Every frame is captured at an exact timestamp via
// window.seek(ms), so video and voiceover cannot drift apart. Takes several minutes.
// Needs: playwright, a full ffmpeg on PATH (or FFMPEG=...), and build/ from `python3 synth.py`.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "output");
await mkdir(out, { recursive: true });
const FPS = 30;
const only = process.env.ONLY_SECONDS ? Number(process.env.ONLY_SECONDS) : null; // quick test renders

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on("pageerror", (e) => { throw e; });
await page.goto("file://" + join(here, "ad.html"));
await page.evaluate(() => document.fonts.ready);
const end = await page.evaluate(() => window.END);
const seconds = only ?? end;
const frames = Math.round(seconds * FPS);

const target = join(out, only ? "test.mp4" : "acalink-ad.mp4");
const ff = spawn(process.env.FFMPEG || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-i", join(here, "build", "voiceover.wav"), "-t", String(seconds),
  "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", target], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((res, rej) => { ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c)))); });

for (let f = 0; f < frames; f++) {
  await page.evaluate((ms) => window.seek(ms), (f / FPS) * 1000);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 300 === 0) console.log(`frame ${f}/${frames}`);
}
ff.stdin.end();
await done;
await browser.close();
console.log("wrote", target, `(${seconds}s)`);
