// demo/lib/parentApp.js
// Drives the Flutter parent app inside the phone-frame wrapper (lib/serveParent.js).
// Flutter web renders to a single <canvas> (CanvasKit) — no DOM to query —
// so this enables Flutter's own accessibility bridge first, which turns real
// widgets into real, queryable ARIA elements Playwright can use exactly like
// any web page. See lib/serveParent.js's /frame route for the visual chrome.
import { env } from "./env.js";
import { beat } from "./humanize.js";

/** The Flutter engine's accessibility placeholder is a 1x1px element parked
 * off-screen — real mouse coordinates can't land on it, so this calls its
 * native `.click()` directly, exactly what a screen reader's first touch
 * would trigger. Runs inside the iframe's own document. */
async function enableSemantics(frameEl) {
  await frameEl.locator("body").evaluate(() => {
    document.querySelector("flt-semantics-placeholder")?.click();
  });
}

export async function openParentApp(page) {
  await page.goto(`${env.parentAppUrl}/frame`, { waitUntil: "domcontentloaded" });
  const frameEl = page.frameLocator("iframe");
  // Give the Flutter engine time to boot (CanvasKit + Firebase init) before
  // touching it — this is the one wait in the whole pipeline sized for a
  // cold start rather than a UI transition.
  await page.waitForTimeout(4500);
  await enableSemantics(frameEl);
  await page.waitForTimeout(800);
  return frameEl;
}

export async function loginAsParent(page, frameEl) {
  const phoneField = frameEl.getByRole("textbox", { name: /099 xxx xxxx/ });
  const pwField = frameEl.getByRole("textbox", { name: /Sent to you via SMS/ });

  await phoneField.click();
  await beat(page, 400);
  await page.keyboard.type(env.parent.phone, { delay: 65 });
  await beat(page, 300);
  await pwField.click();
  await beat(page, 400);
  await page.keyboard.type(env.parent.password, { delay: 65 });
  await beat(page, 400);
  await tapButton(page, frameEl, "Log In", { pauseAfter: 3500 });
}

/**
 * Flutter's semantics tree gets torn down and rebuilt whenever the widget
 * tree under it changes shape (a shimmer placeholder resolving into real
 * content, for instance) — a previously-found node can go stale between
 * being located and being acted on. A plain retry-on-detach beats guessing
 * how long any given screen's rebuild takes.
 */
export async function tapButton(page, frameEl, name, { pauseAfter = 700 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // click()'s own actionability wait (visible/stable/enabled, ~30s) is
      // more forgiving of an in-progress rebuild than a separate waitFor —
      // a fresh locator each attempt is what actually avoids the stale node.
      await frameEl.getByRole("button", { name }).first().click({ timeout: 15_000 });
      await beat(page, pauseAfter);
      return;
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(1000);
    }
  }
  throw lastErr;
}

/**
 * Flutter's scrollables are virtualized: content below the fold has no
 * semantics node — and therefore doesn't exist for Playwright — until it has
 * actually been scrolled into the built/rendered range. `scrollIntoViewIfNeeded`
 * can't find what isn't there yet, so this drives a real wheel gesture over
 * the iframe instead, the same input a person would give it.
 */
export async function scrollAppDown(page, amount = 600) {
  const box = await page.locator("iframe").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, amount);
  await page.waitForTimeout(500);
}

/** Picks the named learner from the "Choose a child" list. Types the search
 * filter immediately — this account's phone number has other guardians'
 * children linked to other schools, and this demo must never linger on their
 * names on screen. */
export async function chooseLearner(page, frameEl) {
  const search = frameEl.getByRole("textbox", { name: /Search by name/ });
  if (await search.count()) {
    await search.click();
    await page.keyboard.type(env.learnerName, { delay: 55 });
    await beat(page, 600);
  }
  await tapButton(page, frameEl, new RegExp(env.learnerName), { pauseAfter: 2500 });
}
