// api/ai-lesson-plan.js
// ─────────────────────────────────────────────────────────────────────────────
// Drafts the free-text parts of a lesson plan — objectives, activities,
// resources, assessment — from just class, subject and topic, using Groq.
// Same provider and shape of trade-off as api/ai-insight.js: server-side
// because the key must not ship to the browser, and cheap because this runs
// once per button click, not once per pupil.
//
// ── Locally relevant, not generic ───────────────────────────────────────────
// A lesson plan drafted by a model with no context reaches for a projector,
// printed handouts and an internet connection — none of which a Malawian
// classroom can assume. The system prompt pins the model to the MANEB/MIE
// syllabus and to materials that are actually there: chalkboard, exercise
// books, the class textbook. Examples inside the plan use Malawian context
// (Kwacha, local crops, local geography) rather than whatever the model's
// training data defaults to.
//
// ── Minimising tokens ────────────────────────────────────────────────────────
// One call, one small non-reasoning model, a short system prompt, a tight
// max_tokens, and a hard character cap enforced after the fact — the same
// belt-and-braces the insight route uses, because "be brief" alone is not a
// budget a model reliably keeps to.
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 30;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** A small, fast, non-reasoning model — this is one short draft, not an essay. */
const MODEL =
  process.env.ACALINK_AI_LESSON_MODEL || process.env.ACALINK_AI_MODEL || "llama-3.1-8b-instant";

/** See api/ai-insight.js for why these exist and when a deployment needs them. */
const REASONING_EFFORT = process.env.ACALINK_AI_REASONING_EFFORT || "";
const REASONING_FORMAT = process.env.ACALINK_AI_REASONING_FORMAT || "";

/** Room for reasoning tokens (if any) plus a genuinely short answer. */
const MAX_TOKENS = Number(process.env.ACALINK_AI_LESSON_MAX_TOKENS) || 700;

/** Ceiling per field, enforced after generation so a verbose model can't inflate the form. */
const MAX_FIELD_CHARS = 350;

const SYSTEM_PROMPT = [
  "You are an experienced Malawian schoolteacher drafting a lesson plan for a colleague,",
  "following the Malawian national curriculum (MANEB/MIE syllabus) for the stated class and",
  "subject.",
  "",
  "Assume an under-resourced classroom: a chalkboard, exercise books and the class textbook.",
  "Never assume a projector, printer, photocopier or internet access. Where an example helps,",
  "use Malawian context — Malawian Kwacha for money, local crops such as maize, tobacco,",
  "groundnuts or tea, local geography such as Lake Malawi or the Shire River, and names common",
  "in Malawi.",
  "",
  "Reply with ONLY a JSON object, no markdown fences, in exactly this shape:",
  '{"objectives": "...", "activities": "...", "resources": "...", "assessment": "..."}',
  "",
  '"objectives": 2 to 4 short outcome statements, each starting "Learners will be able to...",',
  'joined with "; ".',
  '"activities": the lesson flow as 3 to 5 short numbered steps covering introduction,',
  'development and conclusion, joined with "; ". One sentence per step.',
  '"resources": a short comma-separated list of materials realistically available in a',
  "Malawian classroom for this specific lesson.",
  '"assessment": one sentence on how understanding will be checked before the lesson ends.',
  "",
  "Rules: be concrete about this specific topic, not generic teaching advice. Do not restate",
  "the topic as a sentence. No headings, no markdown, no emoji. Keep the whole reply under",
  "900 characters in total.",
].join("\n");

function describe({ className, subject, topic, week, term }) {
  return [
    `Class: ${className || "not given"}`,
    `Subject: ${subject || "not given"}`,
    `Topic: ${topic || "not given"}`,
    week ? `Week: ${week}` : null,
    term ? `Term: ${term}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Same tolerant extraction as api/ai-insight.js — models don't reliably honour "only JSON". */
function parsePlan(text) {
  const fenced = text.replace(/```(?:json)?/gi, " ");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const obj = JSON.parse(fenced.slice(start, end + 1));
    const pick = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
    const plan = {
      objectives: pick(obj.objectives),
      activities: pick(obj.activities),
      resources: pick(obj.resources),
      assessment: pick(obj.assessment),
    };
    return Object.values(plan).some(Boolean) ? plan : null;
  } catch {
    return null;
  }
}

/** See api/ai-insight.js — strips a reasoning model's <think> block, if present. */
function stripReasoning(raw) {
  let text = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const unclosed = text.search(/<think>/i);
  if (unclosed !== -1) text = text.slice(0, unclosed);
  return text.replace(/\s+/g, " ").trim();
}

function cap(text) {
  if (!text || text.length <= MAX_FIELD_CHARS) return text;
  return text.slice(0, MAX_FIELD_CHARS - 1).replace(/[\s,;:]+\S*$/, "") + ".";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ACALINK_AI_API;
  if (!apiKey) {
    console.error("AI lesson plan requested but ACALINK_AI_API is not set");
    return res.status(500).json({ error: "AI service not configured." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Body is not valid JSON." });
    }
  }

  const className = String(body?.className || "").slice(0, 60);
  const subject = String(body?.subject || "").slice(0, 60);
  const topic = String(body?.topic || "").slice(0, 200);
  const week = String(body?.week || "").slice(0, 20);
  const term = String(body?.term || "").slice(0, 20);

  if (!subject || !topic) {
    return res.status(400).json({ error: "Expected at least 'subject' and 'topic'." });
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        // Some room for phrasing variety between classes covering the same
        // topic, without drifting from the syllabus.
        temperature: 0.5,
        max_tokens: MAX_TOKENS,
        ...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
        ...(REASONING_FORMAT ? { reasoning_format: REASONING_FORMAT } : {}),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: describe({ className, subject, topic, week, term }) },
        ],
      }),
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => "");
      console.error(`ai-lesson-plan: groq ${groqRes.status}: ${detail.slice(0, 200)}`);
      const configError =
        groqRes.status === 401 || groqRes.status === 403
          ? "The AI key was rejected. Check ACALINK_AI_API."
          : groqRes.status === 404
          ? `Model "${MODEL}" was not found. Check ACALINK_AI_LESSON_MODEL.`
          : "The AI service could not draft a plan right now.";
      return res.status(502).json({ error: configError });
    }

    const data = await groqRes.json();
    const message = data?.choices?.[0]?.message;
    const flat = stripReasoning(message?.content);

    if (!flat) {
      return res.status(502).json({
        error: message?.reasoning
          ? `The model "${MODEL}" reasoned without answering. Set ACALINK_AI_REASONING_EFFORT=none ` +
            "or raise ACALINK_AI_LESSON_MAX_TOKENS."
          : "The AI returned an empty draft. Try again.",
      });
    }

    const parsed = parsePlan(flat);
    if (!parsed) {
      return res.status(502).json({ error: "Could not read the AI's draft. Try again." });
    }

    return res.status(200).json({
      plan: {
        objectives: cap(parsed.objectives),
        activities: cap(parsed.activities),
        resources: cap(parsed.resources),
        assessment: cap(parsed.assessment),
      },
    });
  } catch (err) {
    console.error("ai-lesson-plan failed:", err);
    return res.status(500).json({ error: "Could not reach the AI service." });
  }
}
