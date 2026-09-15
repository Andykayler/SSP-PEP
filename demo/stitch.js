#!/usr/bin/env node
// demo/stitch.js
// Assembles the final acalink-demo.mp4 from already-recorded scene clips and
// already-rendered title cards, in story order. Re-running this never
// re-records anything — it only needs demo/output/scenes/*.mp4 (from
// `npm run scene <id>`) and demo/output/clips/titles/*.webm (from
// `npm run titles`) to already exist.
import path from "node:path";
import fs from "node:fs";
import { DEMO_ROOT, env } from "./lib/env.js";
import { concatToMp4, getDuration, fmtDuration } from "./lib/ffmpeg.js";
import { SCENES } from "./scenes/manifest.js";
import { TITLE_CARDS } from "./titles/cards.js";

const SCENES_DIR = path.join(DEMO_ROOT, "output", "scenes");
const TITLES_DIR = path.join(DEMO_ROOT, "output", "clips", "titles");
const OUT = path.join(DEMO_ROOT, "output", "acalink-demo.mp4");

function scenePath(scene) {
  return path.join(SCENES_DIR, `${scene.id}-${scene.slug}.mp4`);
}
function titleBefore(sceneId) {
  return TITLE_CARDS.find((c) => c.beforeScene === sceneId);
}

function main() {
  const timeline = [];
  for (const scene of SCENES) {
    const p = scenePath(scene);
    if (!fs.existsSync(p)) {
      throw new Error(`Missing ${p} — run \`npm run scene ${scene.id}\` first.`);
    }
    const card = titleBefore(scene.id);
    if (card) {
      const cardPath = path.join(TITLES_DIR, `${card.id}.webm`);
      if (!fs.existsSync(cardPath)) {
        throw new Error(`Missing ${cardPath} — run \`npm run titles\` first.`);
      }
      timeline.push({ label: `title: ${card.id}`, path: cardPath });
    }
    timeline.push({ label: `scene ${scene.id} (${scene.slug})`, path: p });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  concatToMp4(timeline.map((t) => t.path), OUT, { width: env.video.width, height: env.video.height });

  console.log("=== acalink-demo.mp4 ===");
  let total = 0;
  timeline.forEach((t) => {
    const d = getDuration(t.path);
    total += d;
    console.log(`  ${t.label.padEnd(28)} ${fmtDuration(d)}`);
  });
  console.log(`  ${"TOTAL".padEnd(28)} ${fmtDuration(total)}`);
  console.log(`\n-> ${OUT}`);
  if (total > 300) {
    console.log(`\n!! Over the 5:00 cap by ${fmtDuration(total - 300)}. Trim scene 04 and/or 06 first ` +
      `(per the brief), then re-run \`npm run scene 04\` / \`06\` and \`npm run stitch\`.`);
  }
}

main();
