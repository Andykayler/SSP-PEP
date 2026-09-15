#!/usr/bin/env node
// demo/titles/render-titles.js
// Renders every title card in cards.js to its own short clip via Playwright
// (not a screenshot tool) — same recorder the scenes use, so the whole film
// is produced one way. Run with `npm run titles`, independent of the scenes.
import path from "node:path";
import fs from "node:fs";
import { launchDemoBrowser, openRoleContext } from "../lib/browser.js";
import { DEMO_ROOT } from "../lib/env.js";
import { TITLE_CARDS } from "./cards.js";

const OUTPUT_DIR = path.join(DEMO_ROOT, "output", "clips", "titles");

async function main() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await launchDemoBrowser();
  try {
    for (const card of TITLE_CARDS) {
      const { page, finish } = await openRoleContext(browser, {
        sceneDir: OUTPUT_DIR,
        segmentName: card.id,
      });
      await page.setContent(card.html, { waitUntil: "networkidle" });
      await page.waitForTimeout(300); // let webfonts settle before the hold starts
      await page.waitForTimeout(card.holdMs);
      const p = await finish();
      console.log(`title: ${card.id} -> ${p}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
