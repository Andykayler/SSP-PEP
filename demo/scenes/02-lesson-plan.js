// demo/scenes/02-lesson-plan.js
// Teacher drafts a lesson plan with AI (a real Groq call — ~4-5s measured
// live against the deployed app, held on screen rather than cut), then edits
// the AI's own suggestion before saving. That edit is the money shot the
// brief calls out: the two seconds that answer "what if the AI is wrong"
// before a judge asks it. It lives here, not in scene 03, because this is the
// one AI surface in the app that actually has an edit-before-save step —
// see README "Feature verification" for why.
import { openRoleContext } from "../lib/browser.js";
import { signInAs } from "../lib/webAuth.js";
import { goToTab } from "../lib/nav.js";
import { humanClick, humanType, beat, spotlight, clearSpotlight } from "../lib/humanize.js";
import { env } from "../lib/env.js";

const TOPIC = "Photosynthesis in Green Plants"; // real Form 3 Biology / MANEB syllabus topic

export async function run({ browser, sceneDir }) {
  const { page, finish } = await openRoleContext(browser, { sceneDir, segmentName: "02-teacher" });

  await signInAs(page, "teacher");
  await goToTab(page, "My Classes");

  const newPlanBtn = page.getByRole("button", { name: /New plan/ });
  await humanClick(newPlanBtn, { pauseAfter: 800 });

  // Class defaults to Form 3A (this teacher's only assignment). Subject
  // defaults to the first assigned subject — pick Biology explicitly so the
  // topic below matches it.
  const subjectSelect = page.locator('label:has-text("Subject") + select');
  await subjectSelect.selectOption({ label: "Biology" });
  await beat(page, 500);

  const topicField = page.locator('label:has-text("Topic / Chapter") + div input');
  await humanType(topicField, TOPIC);
  await beat(page, 500);

  const generateBtn = page.getByRole("button", { name: /Generate with AI/ });
  await spotlight(generateBtn);
  await beat(page, 500);
  await humanClick(generateBtn, { pauseAfter: 200 });

  // Real latency, held rather than cut — this is the footage that answers
  // "is it actually generating?".
  await page.getByText(/Drafting…/i).waitFor({ timeout: 5000 }).catch(() => {});
  const objectivesField = page.locator('label:has-text("Learning objectives") + textarea');
  await objectivesField.locator("xpath=.").waitFor({ state: "visible" });
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value?.trim().length > 0,
    'label:has-text("Learning objectives") + textarea',
    { timeout: 20_000 },
  ).catch(async () => {
    // Fallback: just wait for the button to stop saying "Drafting…"
    await generateBtn.getByText(/Generate with AI/i).waitFor({ timeout: 15_000 });
  });
  await clearSpotlight(generateBtn);
  await beat(page, 1200); // let the filled-in fields register on camera

  // ── The edit: swap the last item of the AI's Resources list for something
  // more specific to this class. Operates on structure (after the last
  // comma), not fixed wording, since the exact AI phrasing varies per run.
  const resourcesField = page.locator('label:has-text("Resources") + input');
  await spotlight(resourcesField);
  await beat(page, 900);

  const value = await resourcesField.inputValue();
  const lastComma = value.lastIndexOf(",");
  const start = lastComma === -1 ? 0 : lastComma + 1;
  const selStart = start + (value[start] === " " ? 1 : 0);

  await resourcesField.evaluate((el, [s, e]) => {
    el.focus();
    el.setSelectionRange(s, e);
  }, [selStart, value.length]);
  await beat(page, 700); // hold on the selection so the edit reads as deliberate

  await page.keyboard.type("locally available maize stalks for a demonstration", { delay: 55 });
  await beat(page, 1200);
  await clearSpotlight(resourcesField);

  const saveBtn = page.getByRole("button", { name: /Save plan/ });
  await humanClick(saveBtn, { pauseAfter: 1200 });

  return [await finish()];
}
