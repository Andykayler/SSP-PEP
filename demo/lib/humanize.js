// demo/lib/humanize.js
// Human-speed helpers shared by every scene. The brief is explicit: slow
// typing, a beat after each action lands, pauses on anything a judge must
// read. These exist so no scene script has to reinvent that pacing.

/** A visible beat after an action lands — long enough to register on camera. */
export async function beat(page, ms = 900) {
  await page.waitForTimeout(ms);
}

/**
 * Reading pause sized to the text a judge would actually read on screen —
 * ~230 words/min plus a fixed floor so short labels still get a moment.
 */
export async function readingPause(page, text, { min = 1200, extra = 0 } = {}) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  const ms = Math.max(min, Math.round((words / 230) * 60_000)) + extra;
  await page.waitForTimeout(ms);
}

/**
 * Types like a person, not a script: per-character delay with small random
 * jitter. Clicks the field first so it's visibly focused before text appears.
 */
export async function humanType(locator, text, { delayMs = [55, 130] } = {}) {
  await locator.click();
  for (const ch of String(text)) {
    const d = delayMs[0] + Math.random() * (delayMs[1] - delayMs[0]);
    await locator.page().keyboard.type(ch, { delay: 0 });
    await locator.page().waitForTimeout(d);
  }
}

/** Moves the mouse to an element before acting on it — a click that just
 * teleports reads as a bot; this reads as someone reaching for the button. */
export async function humanClick(locator, { pauseBefore = 250, pauseAfter = 700 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  }
  await locator.page().waitForTimeout(pauseBefore);
  await locator.click();
  await locator.page().waitForTimeout(pauseAfter);
}

/** Highlights an element for camera (a soft outline) without changing layout.
 * `color` defaults to the original competition-reel blue; vertical
 * (CostWorth) scenes pass the brand's Primary Navy (#1F3352, CLAUDE.md)
 * instead so the highlight itself matches CostWorth's visual identity rather
 * than an arbitrary accent. */
export async function spotlight(locator, color = "#4f6ef7") {
  await locator.evaluate((el, c) => {
    el.style.outline = `3px solid ${c}`;
    el.style.outlineOffset = "3px";
    el.style.borderRadius = el.style.borderRadius || "8px";
    el.style.transition = "outline-color 200ms ease";
  }, color);
}

export async function clearSpotlight(locator) {
  await locator.evaluate((el) => { el.style.outline = ""; el.style.outlineOffset = ""; });
}
