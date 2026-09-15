// demo/scenes/03-report-comment.js
// The head teacher releases Term 2 report cards for one learner — a real Groq
// call happens live (server-side, ~10-15s including the Firestore reads it's
// grounded in) — then cuts to the parent app, where the same generated
// analysis is what a guardian actually sees under "TERM INSIGHT".
//
// Why the head teacher, not the teacher, and why no on-camera edit: verified
// in the codebase that AI report-card insight generation is a head-teacher-only
// bulk "release" action with no per-student edit step anywhere in the app —
// see README "Feature verification". Building a fake edit box for this would
// be exactly the fabricated-AI-feature risk the brief warns against, so the
// edit beat lives in scene 02 instead, where the app genuinely has one.
import { openRoleContext } from "../lib/browser.js";
import { signInAs } from "../lib/webAuth.js";
import { goToTab } from "../lib/nav.js";
import { humanClick, humanType, beat, spotlight } from "../lib/humanize.js";
import { buildParentWeb, startParentServer } from "../lib/serveParent.js";
import { openParentApp, loginAsParent, chooseLearner, tapButton, scrollAppDown } from "../lib/parentApp.js";
import { env } from "../lib/env.js";

export async function run({ browser, sceneDir }) {
  const segments = [];

  // ── Head teacher: release Chisomo's report card ──
  {
    const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "a-headteacher" });
    page.on("dialog", (d) => d.accept()); // the native "Issue report cards for N student(s)?" confirm

    await signInAs(page, "headteacher");
    await goToTab(page, "Reports & Exports");
    await beat(page, 600);

    await page.locator('label:has-text("CLASS") + div select').selectOption({ label: env.learnerClass });
    await beat(page, 500);

    const search = page.locator(".search-input");
    await humanType(search, env.learnerName);
    await beat(page, 700);

    const releaseBtn = page.getByRole("button", { name: /Issue to parents/ });
    await spotlight(releaseBtn);
    await beat(page, 500);
    await humanClick(releaseBtn, { pauseAfter: 300 });

    // Real latency: Firestore write, then a live Groq call grounded in this
    // learner's actual marks/attendance/history. Held on screen, not cut —
    // the brief is explicit that this is the footage that answers "is it
    // actually generating?".
    await page.getByText(/Preparing insights/i).waitFor({ timeout: 15_000 });
    await beat(page, 500);
    await page.getByText(/Issued \d+ report card/i).waitFor({ timeout: 30_000 });
    await beat(page, 2200);

    segments.push(await finish());
  }

  // ── Parent app: the same analysis, on the learner's own report card ──
  {
    buildParentWeb({});
    const server = await startParentServer(5050);
    const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "b-parent" });

    const frameEl = await openParentApp(page);
    await loginAsParent(page, frameEl);
    await chooseLearner(page, frameEl);
    await tapButton(page, frameEl, "Grades", { pauseAfter: 1500 });

    // Below the iframe's own fold, and virtualized — it has no semantics
    // node (doesn't exist for Playwright) until actually scrolled into
    // Flutter's built range. A real wheel gesture, not scrollIntoViewIfNeeded.
    const insightHeading = frameEl.getByText("TERM INSIGHT");
    for (let i = 0; i < 6 && !(await insightHeading.count()); i++) {
      await scrollAppDown(page, 500);
    }
    try {
      await insightHeading.waitFor({ state: "visible", timeout: 8000 });
    } catch (err) {
      await page.screenshot({ path: `${sceneDir}/debug-insight-missing.png` }).catch(() => {});
      throw err;
    }
    await beat(page, 600);
    await spotlight(insightHeading);
    await scrollAppDown(page, 250); // nudge the analysis paragraph fully into view too
    await beat(page, 3400); // hold on the AI-written analysis, long enough to read

    segments.push(await finish());
    await new Promise((resolve) => server.close(resolve));
  }

  return segments;
}
