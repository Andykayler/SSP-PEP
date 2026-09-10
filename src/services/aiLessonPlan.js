// src/services/aiLessonPlan.js
// ─────────────────────────────────────────────────────────────────────────────
// Client side of the AI lesson-plan draft. Talks to `api/ai-lesson-plan.js`,
// which holds the Groq key. See src/services/aiInsight.js for the sibling
// feature this mirrors.
//
// One call per click — a teacher fills in class, subject and topic, then asks
// for a draft of the objectives/activities/resources/assessment fields, which
// they can edit before saving. Nothing here throws; a failure just means the
// teacher keeps typing the form by hand, exactly as before this existed.
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = "/api/ai-lesson-plan";

/**
 * Drafts the free-text fields of a lesson plan.
 *
 * `input`: { className, subject, topic, week, term }. `subject` and `topic`
 * are the only fields the route requires.
 *
 * Returns `{ plan, error }`. `plan` is `{ objectives, activities, resources,
 * assessment }` or `null` on failure; `error` is a short message worth
 * showing the teacher.
 */
export async function draftLessonPlan({ className, subject, topic, week, term }) {
  if (!subject?.trim() || !topic?.trim()) {
    return { plan: null, error: "Add a subject and topic first." };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className, subject, topic, week, term }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("AI lesson plan failed:", res.status, data?.error);
      return { plan: null, error: data?.error || `AI service returned ${res.status}.` };
    }

    return { plan: data?.plan || null, error: data?.plan ? null : "The AI returned no draft." };
  } catch (err) {
    console.error("AI lesson plan error:", err);
    return { plan: null, error: "Could not reach the AI service." };
  }
}
