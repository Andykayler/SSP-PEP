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
const MAX_TOKENS = Number(process.env.ACALINK_AI_MAX_TOKENS) || 3072;

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

/**
 * Ceiling on the app-facing analysis. Generous, because the app has room and
 * a paragraph is the point — but bounded, so one runaway completion cannot
 * bloat a report card document.
 */
const MAX_ANALYSIS_CHARS = 900;

const SYSTEM_PROMPT = [
  "You are an experienced Malawian head teacher writing to a parent about their child's term.",
  "You are given the child's full record: this term's subject marks, how those marks compare",
  "to the class, previous terms' averages and positions, how the child moved through the",
  "assessments within the term, attendance, and conduct.",
  "",
  "Analyse, do not describe. The parent can already see the marks — your job is to say what",
  "they mean. Work out:",
  "- The direction of travel. Compare this term's average and position to previous terms.",
  "  A mark is good or bad only relative to the class and to where the child was before.",
  "- Which subject most needs attention. Prefer a subject that is both below the class",
  "  average and falling, over one that is merely the lowest number.",
  "- Whether the child faded or built through the term, from the assessment sequence.",
  "- Whether attendance or conduct explains the marks. If a child is missing many days,",
  "  that is the cause and everything else is a symptom — say so plainly.",
  "",
  "Reply with ONLY a JSON object, no markdown fences, in exactly this shape:",
  '{"sms": "...", "analysis": "..."}',
  "",
  '"sms": at most 200 characters. One or two sentences. The single most useful thing this',
  "parent could know, and one specific action for next term. This is read on a basic phone",
  "by a parent who may have no other contact with the school.",
  "",
  '"analysis": 3 to 5 sentences. The fuller picture, read in the app. Reference actual',
  "numbers and name actual subjects. Say what changed since last term and why it matters.",
  "End with one concrete, affordable thing the family can do at home.",
  "",
  "Rules for both:",
  "- Plain English a parent with limited schooling can act on. No jargon, no markdown,",
  "  no bullet points, no emoji, no headings.",
  "- Refer to the child by first name.",
  "- Use only the facts given. Never invent a mark, a subject, or a trend.",
  "- If there is no previous term, say this is the first record and do not imply a trend.",
  "- Be honest about poor performance but never disparaging. Address the parent, never the",
  "  child. Never predict exam results, never mention fees, never greet or sign off.",
].join("\n");

/**
 * The pupil's whole record, laid out for the model.
 *
 * Every line here is something the model cannot work out on its own and would
 * otherwise guess at. Subject marks are paired with that subject's class
 * average, because 62 in a class averaging 41 and 62 in a class averaging 78
 * call for opposite advice — and the single overall class average that used to
 * be sent could not distinguish them.
 */
function describe(s) {
  const lines = [
    `Child: ${s.name || "the pupil"}`,
    s.className ? `Class: ${s.className}` : null,
    s.term ? `Term being reported: ${s.term}` : null,
    s.average !== null && s.average !== undefined ? `Term average: ${s.average}%` : null,
    s.classAverage !== null && s.classAverage !== undefined
      ? `Class average this term: ${s.classAverage}%` : null,
    s.position && s.classSize ? `Position: ${s.position} of ${s.classSize}` : null,
  ].filter(Boolean);

  if (Array.isArray(s.subjects) && s.subjects.length > 0) {
    lines.push("");
    lines.push("Subject marks this term (child vs class average for that subject):");
    s.subjects.forEach((r) => {
      const cls = r.classAverage !== null && r.classAverage !== undefined
        ? ` (class ${r.classAverage})` : "";
      lines.push(`  ${r.subject}: ${r.score}${cls}`);
    });
  }

  // Within the term: CA1 → CA2 → Mid-term → End of term. Whether a child
  // faded or built is invisible in the average and obvious in this sequence.
  if (Array.isArray(s.progression) && s.progression.length > 1) {
    lines.push("");
    lines.push("Assessment sequence within this term (in order):");
    lines.push(`  ${s.progression.map((p) => `${p.label} ${p.score}`).join(" -> ")}`);
  }

  if (Array.isArray(s.history) && s.history.length > 0) {
    lines.push("");
    lines.push("Previous terms, oldest first:");
    s.history.forEach((h) => {
      const pos = h.position && h.classSize ? `, position ${h.position} of ${h.classSize}` : "";
      const subs = h.subjects?.length
        ? ` [${h.subjects.map((r) => `${r.subject} ${r.score}`).join(", ")}]` : "";
      lines.push(`  ${h.term}: average ${h.average ?? "n/a"}%${pos}${subs}`);
    });
  } else {
    lines.push("");
    lines.push("Previous terms: none on record. This is the first report for this child.");
  }

  lines.push("");
  if (s.attendance?.daysRecorded) {
    const rate = Math.round((s.attendance.present / s.attendance.daysRecorded) * 100);
    lines.push(
      `Attendance: present ${s.attendance.present} of ${s.attendance.daysRecorded} days (${rate}%)` +
      (s.attendance.absent ? `, absent ${s.attendance.absent}` : "") +
      (s.attendance.late ? `, late ${s.attendance.late} times` : ""),
    );
  } else {
    lines.push("Attendance: no register recorded this term.");
  }

  if (s.discipline?.cases) {
    lines.push(
      `Conduct: ${s.discipline.cases} recorded incident(s)` +
      (s.discipline.serious ? `, ${s.discipline.serious} serious` : "") +
      (s.discipline.offenses?.length ? ` (${s.discipline.offenses.join("; ")})` : ""),
    );
  } else {
    lines.push("Conduct: no incidents recorded.");
  }

  return lines.join("\n");
}

/**
 * Pulls `{sms, analysis}` out of the model's reply.
 *
 * Models wrap JSON in markdown fences, prepend a sentence, or ignore the
 * format entirely. Rather than fail on any of that, the object is located
 * inside the text; if there is no usable JSON at all the whole reply becomes
 * the analysis and the SMS is cut from it, which is still a working result.
 */
function parseInsight(text) {
  const fenced = text.replace(/```(?:json)?/gi, " ");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(fenced.slice(start, end + 1));
      const sms = typeof obj.sms === "string" ? obj.sms.trim() : "";
      const analysis = typeof obj.analysis === "string" ? obj.analysis.trim() : "";
      if (sms || analysis) {
        return { sms: sms || analysis, analysis: analysis || sms };
      }
    } catch {
      // Falls through to the plain-text path below.
    }
  }

  const flat = text.replace(/\s+/g, " ").trim();
  return flat ? { sms: flat, analysis: flat } : null;
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

  if (flat) {
    const parsed = parseInsight(flat);
    if (parsed) {
      const sms = parsed.sms.replace(/\s+/g, " ").trim();
      return {
        // The SMS is billed by the character; the analysis is read in the app,
        // where length costs nothing, so only the SMS is capped.
        sms: sms.length <= MAX_INSIGHT_CHARS
          ? sms
          : sms.slice(0, MAX_INSIGHT_CHARS - 1).replace(/[\s,;:]+\S*$/, "") + ".",
        analysis: parsed.analysis.replace(/\s+/g, " ").trim().slice(0, MAX_ANALYSIS_CHARS),
      };
    }
  }

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
        const out = await insightFor(s, apiKey);
        results[i] = { id: s?.id ?? null, insight: out.sms, analysis: out.analysis };
      } catch (err) {
        console.error(`insight failed for ${s?.id}: ${err.message}`);
        results[i] = { id: s?.id ?? null, insight: null, analysis: null };
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
