// api/ai-insight.js
// ─────────────────────────────────────────────────────────────────────────────
// Turns one pupil's term — marks, attendance, conduct — into two sentences a
// parent can act on, using Groq.
//
// Server-side because the key must not ship to the browser: `ACALINK_AI_API`
// is read here from process.env and nothing about it is bundled. The portal
// posts a small batch of pupils and gets a line back for each.
//
// ── Why batches, and why small ones ─────────────────────────────────────────
// Each pupil needs their own completion — the whole point is that the advice
// names their weakest subject — so a class of forty is forty model calls. Sent
// one HTTP request at a time from the browser that is forty round trips; sent
// all at once it is forty parallel functions. Batching a handful per request
// and running them concurrently inside the function is the middle ground.
//
// The ceiling is the function timeout: Vercel caps duration, so a batch is
// deliberately small enough that even slow completions finish inside it. If
// this starts timing out, lower MAX_BATCH rather than raising maxDuration.
//
// ── Failure is not an error ─────────────────────────────────────────────────
// An insight is an enhancement to a report card, never the report card. Any
// pupil whose completion fails comes back with `insight: null` and the caller
// sends their SMS without it. A model outage must not stop a school issuing
// results.
// ─────────────────────────────────────────────────────────────────────────────

/** Vercel: allow the function longer than the default for model latency. */
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Overridable, because hosted model names are retired on someone else's schedule. */
const MODEL = process.env.ACALINK_AI_MODEL || "llama-3.3-70b-versatile";

/** Pupils per request. Kept low so the whole batch clears the function timeout. */
const MAX_BATCH = 8;

/** How many model calls run at once inside one batch. */
const CONCURRENCY = 4;

/**
 * Hard ceiling on what the model may contribute to an SMS. Two sentences of
 * advice is worth one extra message part; a paragraph is not, and a model told
 * only to "be brief" will eventually write one.
 */
const MAX_INSIGHT_CHARS = 200;

const SYSTEM_PROMPT = [
  "You write one short note to a parent about their child's school term in Malawi.",
  "",
  "Rules:",
  "- Plain English. No jargon, no markdown, no bullet points, no emoji.",
  "- At most two sentences and 200 characters total.",
  "- Address the parent about their child by first name.",
  "- Say one specific thing that went well and one specific thing to work on.",
  "- If a subject is clearly weakest, name that subject.",
  "- If attendance is poor, say attendance is the thing to fix first.",
  "- Never invent marks, subjects or facts that are not given to you.",
  "- Never promise outcomes. Never mention fees. Do not sign off or greet.",
].join("\n");

/** The pupil, described to the model as plainly as it will be read back. */
function describe(s) {
  const lines = [
    `Child: ${s.name || "the pupil"}`,
    s.className ? `Class: ${s.className}` : null,
    s.average !== null && s.average !== undefined ? `Term average: ${s.average}%` : null,
    s.classAverage !== null && s.classAverage !== undefined
      ? `Class average: ${s.classAverage}%` : null,
    s.position && s.classSize ? `Position: ${s.position} of ${s.classSize}` : null,
  ].filter(Boolean);

  if (Array.isArray(s.subjects) && s.subjects.length > 0) {
    lines.push(`Subject marks: ${s.subjects.map((r) => `${r.subject} ${r.score}`).join(", ")}`);
  }
  if (s.attendance) {
    lines.push(
      `Attendance: present ${s.attendance.present} of ${s.attendance.daysRecorded} days` +
      (s.attendance.late ? `, late ${s.attendance.late} times` : ""),
    );
  }
  if (s.discipline?.cases) {
    lines.push(
      `Conduct: ${s.discipline.cases} recorded incident(s)` +
      (s.discipline.offenses?.length ? ` (${s.discipline.offenses.join("; ")})` : ""),
    );
  } else {
    lines.push("Conduct: no incidents recorded");
  }

  return lines.join("\n");
}

async function insightFor(student, apiKey) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      // Low but not zero: the same phrasing repeated across every child in a
      // class reads like a form letter and parents compare notes.
      temperature: 0.4,
      max_tokens: 120,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: describe(student) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty completion");

  // Collapse any newlines the model adds — an SMS is one run of text — and
  // enforce the length ceiling the prompt only asks for.
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= MAX_INSIGHT_CHARS
    ? flat
    : flat.slice(0, MAX_INSIGHT_CHARS - 1).replace(/[\s,;:]+\S*$/, "") + ".";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ACALINK_AI_API;
  if (!apiKey) {
    console.error("AI insight requested but ACALINK_AI_API is not set");
    return res.status(500).json({ error: "AI service not configured." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Body is not valid JSON." }); }
  }

  const students = Array.isArray(body?.students) ? body.students : null;
  if (!students || students.length === 0) {
    return res.status(400).json({ error: "Expected a non-empty 'students' array." });
  }
  if (students.length > MAX_BATCH) {
    return res.status(400).json({ error: `At most ${MAX_BATCH} students per request.` });
  }

  const results = new Array(students.length);
  let cursor = 0;

  async function worker() {
    while (cursor < students.length) {
      const i = cursor++;
      const s = students[i];
      try {
        results[i] = { id: s?.id ?? null, insight: await insightFor(s, apiKey) };
      } catch (err) {
        // Logged, not surfaced: the caller only needs to know it has no
        // insight for this pupil, and a model error is not a school's problem.
        console.error(`insight failed for ${s?.id}: ${err.message}`);
        results[i] = { id: s?.id ?? null, insight: null };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, students.length) }, worker),
  );

  return res.status(200).json({ results });
}
