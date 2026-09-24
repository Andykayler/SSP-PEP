// api/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// The AI features, behind one serverless function. POST /api/ai?task=…
//
//   task=insight       AI term insight on report cards  (api/_lib/aiInsight.js)
//   task=lesson-plan   AI lesson-plan draft             (api/_lib/aiLessonPlan.js)
//
// WHY ONE FUNCTION: Vercel's Hobby plan deploys at most 12 serverless
// functions, and a deployment with a 13th fails outright — every endpoint,
// not just the new one, stays on the previous build. Everything under
// api/_lib is shared code rather than a function, so the two AI handlers live
// there and this file routes to them. The old URLs (/api/ai-insight,
// /api/ai-lesson-plan) are rewritten here in vercel.json, so nothing that
// calls them has to change.
// ─────────────────────────────────────────────────────────────────────────────
import insight from "./_lib/aiInsight.js";
import lessonPlan from "./_lib/aiLessonPlan.js";

// The longer of the two: a batch of report-card insights can take a while.
export const maxDuration = 60;

const TASKS = { insight, "lesson-plan": lessonPlan };

export default async function handler(req, res) {
  const task = String(req.query?.task || "");
  const run = TASKS[task];
  if (!run) return res.status(404).json({ error: "Unknown AI task." });
  return run(req, res);
}
