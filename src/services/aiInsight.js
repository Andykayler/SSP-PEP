// src/services/aiInsight.js
// ─────────────────────────────────────────────────────────────────────────────
// Client side of the AI term insight. Talks to `api/ai-insight.js`, which
// holds the Groq key.
//
// The whole surface is one function, and it is written so the caller can
// ignore failure: a pupil with no insight simply has none, and the report card
// goes out exactly as it would have before this module existed. Nothing here
// throws.
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = "/api/ai-insight";

/** Must not exceed MAX_BATCH in the route, which rejects anything larger. */
const BATCH_SIZE = 8;

/**
 * Fetches an insight for each pupil.
 *
 * `students` are the shapes `describe()` in the route expects: id, name,
 * className, average, classAverage, position, classSize, subjects,
 * attendance, discipline.
 *
 * Returns `{ insights, error }`. `insights` maps student id to insight text;
 * pupils the model could not summarise are simply absent, and a miss means
 * "send the report without a note", never a failure worth stopping for.
 *
 * `error` is different, and is the reason this does not just return the Map. A
 * rejected key or a retired model name fails every pupil identically, so the
 * school would otherwise issue a whole term of reports, get no insights, and
 * be told nothing. That one sentence is worth surfacing; a single pupil's
 * failed completion is not.
 *
 * Batches run one after another rather than in parallel: each request already
 * runs several completions concurrently inside the function, and firing every
 * batch at once would open a serverless instance per batch for a large school.
 */
export async function fetchInsights(students, { onProgress } = {}) {
  const insights = new Map();
  let error = null;
  const list = (students || []).filter((s) => s?.id);
  if (list.length === 0) return { insights, error };

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: batch }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        (data.results || []).forEach((r) => {
          if (r?.id && r.insight) insights.set(r.id, r.insight);
        });
        if (data.configError && !error) error = data.configError;
      } else {
        // One failed batch costs those pupils their insight and nothing else,
        // so the loop continues rather than abandoning the rest of the school.
        const detail = await res.json().catch(() => ({}));
        console.error("AI insight batch failed:", res.status, detail?.error);
        if (!error) error = detail?.error || `Insight service returned ${res.status}.`;
      }
    } catch (err) {
      console.error("AI insight batch error:", err);
      if (!error) error = "Could not reach the insight service.";
    }

    onProgress?.(Math.min(i + BATCH_SIZE, list.length), list.length);

    // A configuration fault will fail every remaining batch in exactly the same
    // way. Stopping saves a large school a few hundred pointless model calls.
    if (error && insights.size === 0) break;
  }

  return { insights, error };
}
