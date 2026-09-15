// demo/lib/ffmpeg.js
// Thin wrapper around the system ffmpeg/ffprobe (never bundled, never shipped
// with the app) used to (a) glue one scene's per-role .webm segments into one
// clip, and (b) glue title cards + scene clips into the final mp4. Uses the
// concat FILTER (decodes and re-encodes) rather than the concat demuxer,
// because segments come from different sources (Playwright video vs a
// rendered title card) and can't be assumed to share codec parameters.
import { spawnSync } from "node:child_process";

function run(args) {
  const res = spawnSync("ffmpeg", ["-y", ...args], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed (${res.status}):\n${res.stderr?.slice(-4000)}`);
  }
  return res;
}

/** Concatenates video-only clips (webm or mp4, any matching codec) into one
 * H.264 mp4 at a fixed size/fps, video-only (no audio track — silent by
 * design; add a voiceover track separately). */
export function concatToMp4(inputPaths, outputPath, { width = 1920, height = 1080, fps = 30 } = {}) {
  if (inputPaths.length === 0) throw new Error("concatToMp4: no inputs");

  const inputArgs = inputPaths.flatMap((p) => ["-i", p]);
  const scaled = inputPaths
    .map((_, i) => `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`)
    .join(";");
  const concatInputs = inputPaths.map((_, i) => `[v${i}]`).join("");
  const filter = `${scaled};${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`;

  run([
    ...inputArgs,
    "-filter_complex", filter,
    "-map", "[outv]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium",
    outputPath,
  ]);
  return outputPath;
}

/** Duration in seconds via ffprobe, for the per-scene/total runtime report. */
export function getDuration(filePath) {
  const res = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`ffprobe failed (${res.status}):\n${res.stderr}`);
  }
  return parseFloat(res.stdout.trim());
}

export function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
