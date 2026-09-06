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

/**
 * Reasoning-model controls, all optional and all off unless set.
 *
 * A reasoning model such as qwen3 thinks before it answers, and for a task
 * this small the thinking is pure cost — it can consume the whole token
 * budget and leave nothing for the two sentences actually wanted. Groq exposes
 * switches for this, but they are not accepted by every model, so nothing is
 * sent unless the deployment asks for it:
 *
 *   ACALINK_AI_REASONING_EFFORT=none     stop the model thinking at all
 *   ACALINK_AI_REASONING_FORMAT=hidden   keep thinking out of `content`
 *   ACALINK_AI_MAX_TOKENS=2048           room for thinking AND an answer
 *
 * The simpler fix is a non-reasoning model, which needs none of these.
 */
const REASONING_EFFORT = process.env.ACALINK_AI_REASONING_EFFORT || "";
const REASONING_FORMAT = process.env.ACALINK_AI_REASONING_FORMAT || "";
const MAX_TOKENS = Number(process.env.ACALINK_AI_MAX_TOKENS) || 2048;

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

/**
 * Removes a reasoning model's thinking from its answer.
 *
 * Qwen3 and similar models emit `<think>…</think>` inside `message.content`
 * before the real reply. Left in, a parent receives the model's internal
 * monologue truncated at 200 characters instead of a sentence about their
 * child — so this runs before anything else touches the text.
 *
 * An UNCLOSED `<think>` means the model ran out of tokens mid-thought and
 * never produced an answer at all. Everything from that tag on is discarded,
 * which usually leaves nothing — and nothing is the correct result, because
 * there genuinely is no insight in that response.
 */
function stripReasoning(raw) {
  let text = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const unclosed = text.search(/<think>/i);
  if (unclosed !== -1) text = text.slice(0, unclosed);
  return text.replace(/\s+/g, " ").trim();
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
      // Generous for two sentences, because a reasoning model spends most of
      // this budget thinking before it writes anything. The 200-character
      // ceiling is enforced after the reasoning is stripped, so a large budget
      // costs tokens, not message length.
      max_tokens: MAX_TOKENS,
      // Only sent when configured — an unrecognised parameter is a 400 from
      // models that do not reason, and most of them do not.
      ...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
      ...(REASONING_FORMAT ? { reasoning_format: REASONING_FORMAT } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: describe(student) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`groq ${res.status}: ${detail.slice(0, 200)}`);

    // A bad key or a retired model name fails identically for every pupil, and
    // silently: without this flag the school issues a whole term's reports,
    // sees no insights, and is given nothing to act on. Configuration faults
    // are separated from per-pupil ones so the caller can say what is wrong.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      err.configError = res.status === 404
        ? `Model "${MODEL}" was not found. Check ACALINK_AI_MODEL against Groq's model list.`
        : "The AI key was rejected. Check ACALINK_AI_API.";
    } else if (res.status === 400 && /model/i.test(detail)) {
      err.configError = `Groq rejected the model "${MODEL}". Check ACALINK_AI_MODEL.`;
    }
    throw err;
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const raw = message?.content;

  // With reasoning_format set, Groq moves the thinking into its own field and
  // leaves `content` clean — but an empty `content` alongside a populated
  // `reasoning` means the model thought and never concluded, which is the same
  // failure as an unclosed <think> and is reported the same way below.
  if (!raw) {
    if (message?.reasoning) {
      const err = new Error("model produced reasoning but no answer");
      err.configError =
        `The model "${MODEL}" reasoned without answering. Set ACALINK_AI_REASONING_EFFORT=none, ` +
        "raise ACALINK_AI_MAX_TOKENS, or use a non-reasoning model.";
      throw err;
    }
    throw new Error("empty completion");
  }

  // Reasoning first, then whitespace — an SMS is one run of text.
  const flat = stripReasoning(raw);

  if (!flat) {
    // Nothing survived, meaning the response was entirely thinking. That fails
    // identically for every pupil, so it is raised as a configuration fault
    // with the fix in it rather than as one pupil's bad luck.
    const err = new Error("model returned only reasoning, no answer");
    err.configError =
      `The model "${MODEL}" used its whole ${MAX_TOKENS}-token budget on reasoning without ` +
      "answering. Set ACALINK_AI_REASONING_EFFORT=none, raise ACALINK_AI_MAX_TOKENS, " +
      "or use a non-reasoning model such as llama-3.3-70b-versatile.";
    throw err;
  }

  // Enforce the length ceiling the prompt only asks for, trimming back to a
  // word boundary so a parent is not left mid-word.
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
  let configError = null;
  let cursor = 0;

  async function worker() {
    while (cursor < students.length) {
      const i = cursor++;
      const s = students[i];
      try {
        results[i] = { id: s?.id ?? null, insight: await insightFor(s, apiKey) };
      } catch (err) {
        console.error(`insight failed for ${s?.id}: ${err.message}`);
        results[i] = { id: s?.id ?? null, insight: null };
        // First one wins: they are all the same fault, and repeating it per
        // pupil would bury the one sentence the school needs to read.
        if (err.configError && !configError) configError = err.configError;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, students.length) }, worker),
  );

  // Still a 200 with results: the report cards themselves are fine, and this
  // is advisory. `configError` is what turns a silent absence into a message.
  return res.status(200).json({ results, configError });
}
