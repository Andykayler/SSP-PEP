// demo/scenes/06-fee-payment.js
// Parent reports a Term 2 fee payment made via TNM Mpamba (the guardian's own
// phone prefix is TNM's), then the bursar's Payments ledger shows the same
// row after a manual refresh — no onSnapshot anywhere in this app (verified),
// so honest manual refresh, same as scene 04.
//
// Deliberately the "I have already paid" path, not "Pay now": the latter
// hands a real phone to PayChangu's live mobile-money prompt — an actual
// transaction, not something to trigger in a recorded demo. Real code path,
// real Firestore write, no money moved. Note in the README: this app's
// bursar ledger does not yet visually distinguish an unverified parent report
// from a bursar-confirmed payment — a real gap worth knowing about, not
// something this demo can or should paper over.
import { openRoleContext } from "../lib/browser.js";
import { signInAs } from "../lib/webAuth.js";
import { goToTab } from "../lib/nav.js";
import { humanClick, humanType, beat, spotlight } from "../lib/humanize.js";
import { buildParentWeb, startParentServer } from "../lib/serveParent.js";
import { openParentApp, loginAsParent, chooseLearner, tapButton } from "../lib/parentApp.js";
import { env } from "../lib/env.js";

const REFERENCE = `MP${Date.now().toString().slice(-8)}`;

export async function run({ browser, sceneDir }) {
  const segments = [];

  // ── Parent app: report the payment ──
  {
    buildParentWeb({});
    const server = await startParentServer(5050);
    const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "a-parent" });

    const frameEl = await openParentApp(page);
    await loginAsParent(page, frameEl);
    await chooseLearner(page, frameEl);
    await tapButton(page, frameEl, "Fees", { pauseAfter: 1500 });

    await tapButton(page, frameEl, "Make a Payment", { pauseAfter: 1000 });
    await tapButton(page, frameEl, "I have already paid", { pauseAfter: 1000 });

    // Pre-filled with the full outstanding balance by default — select all
    // before typing, or the real amount lands appended to it, not replacing it.
    const amountField = frameEl.getByRole("textbox").first();
    await amountField.click();
    await beat(page, 300);
    await page.keyboard.press("Control+A");
    await beat(page, 200);
    await page.keyboard.type("85000", { delay: 70 });
    await beat(page, 500);

    // Method tiles: pick TNM Mpamba — matches this guardian's own 088 number.
    const mpamba = frameEl.getByText("TNM Mpamba", { exact: true });
    await spotlight(mpamba);
    await humanClick(mpamba, { pauseAfter: 500 });

    const phoneField = frameEl.getByRole("textbox", { name: /099X XXX XXX/ });
    if (await phoneField.count()) {
      await phoneField.click();
      await beat(page, 300);
      await page.keyboard.type(env.parent.phone.replace("+265", "0"), { delay: 60 });
      await beat(page, 400);
    }

    const refField = frameEl.getByRole("textbox", { name: /Helps the bursar find/ });
    await refField.click();
    await beat(page, 300);
    await humanType(refField, REFERENCE, { delayMs: [50, 90] });
    await beat(page, 600);

    await tapButton(page, frameEl, "Send to the school", { pauseAfter: 500 });

    const sent = frameEl.getByText("Sent to the school");
    await sent.waitFor({ timeout: 15_000 });
    await beat(page, 2600); // hold on the "reported, not a receipt" confirmation

    segments.push(await finish());
    await new Promise((resolve) => server.close(resolve));
  }

  // ── Bursar: the report lands in the ledger, one manual refresh ──
  {
    const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "b-bursar" });
    await signInAs(page, "bursar");
    await goToTab(page, "Payments");
    await beat(page, 700);

    // Icon-only button (no accessible name) — target the lucide RefreshCw svg.
    const refreshBtn = page.locator("button:has(svg.lucide-refresh-cw)").first();
    await spotlight(refreshBtn);
    await beat(page, 500);
    await humanClick(refreshBtn, { pauseAfter: 600 });

    const search = page.locator('input[placeholder*="Search name"]');
    await humanType(search, env.learnerName);
    await beat(page, 600);

    // The reference number isn't rendered in this table (only student,
    // amount and method are) — the row itself, found by student name, is
    // what's on screen to spotlight.
    const row = page.locator("tr", { hasText: env.learnerName }).first();
    await row.waitFor({ timeout: 15_000 });
    await spotlight(row);
    await beat(page, 2400);

    segments.push(await finish());
  }

  return segments;
}
