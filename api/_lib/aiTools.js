// api/_lib/aiTools.js — served by api/ai.js (task=timetable-load | timetable-extract | announcement | quiz)
// ─────────────────────────────────────────────────────────────────────────────
// The smaller AI helpers, each one short Groq call behind a signed-in staff
// check (the key and the per-token bill are the school's, so an anonymous
// caller can't spend them).
//
//   timetable-load  How many periods a week each subject should get, per class.
//                   Only the numbers — placing lessons is done without the AI
//                   in src/services/timetableGenCore.js, which can't clash.
//   timetable-extract  Reads a photo or PDF of a school's printed timetable and
//                   lists its lessons, so the grid can be filled in. The image
//                   goes to the model and nowhere else — nothing is stored.
//                   The lessons are checked against the school's classes,
//                   subjects and teachers in the browser before anything is
//                   saved (src/services/timetableImportCore.js).
//   announcement    Turns a head teacher's rough notes into a clear notice for
//                   families, in English and/or Chichewa.
//   quiz            Syllabus-aligned questions with a marking key, for class
//                   exercises, homework and tests.
//
// Same provider, model settings and tolerant JSON parsing as aiLessonPlan.js.
// ─────────────────────────────────────────────────────────────────────────────
import { requireStaff, readBody } from "./auth.js";
import { parseExtractedLessons } from "../../src/services/timetableImportCore.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.ACALINK_AI_TOOLS_MODEL || process.env.ACALINK_AI_MODEL || "llama-3.3-70b-versatile";
// Reading a timetable needs a model that takes images.
const VISION_MODEL = process.env.ACALINK_AI_VISION_MODEL || "qwen/qwen3.8-27b";
// Copying a timetable out needs no thinking, and thinking tokens would come
// out of the budget the lesson list needs. "none" switches it off on Qwen.
const VISION_REASONING_EFFORT = process.env.ACALINK_AI_VISION_REASONING_EFFORT ?? "none";
const REASONING_EFFORT = process.env.ACALINK_AI_REASONING_EFFORT || "";
const REASONING_FORMAT = process.env.ACALINK_AI_REASONING_FORMAT || "";

const CONTEXT = [
  "You work for a school in Malawi that follows the national curriculum (MANEB/MIE syllabus).",
  "Assume an under-resourced classroom: chalkboard, exercise books and the class textbook.",
  "Where an example helps, use Malawian context (Kwacha, maize, Lake Malawi, common Malawian names).",
].join(" ");

const str = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function stripReasoning(raw) {
  let text = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const unclosed = text.search(/<think>/i);
  if (unclosed !== -1) text = text.slice(0, unclosed);
  return text.trim();
}

function parseJson(text) {
  const fenced = text.replace(/```(?:json)?/gi, " ");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

async function callModel({
  system, user, maxTokens, temperature, model = MODEL, modelEnv = "ACALINK_AI_TOOLS_MODEL",
  reasoningEffort = REASONING_EFFORT,
}) {
  const apiKey = process.env.ACALINK_AI_API;
  if (!apiKey) return { error: "AI service not configured.", status: 500 };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(REASONING_FORMAT ? { reasoning_format: REASONING_FORMAT } : {}),
      // `user` is text, or for a vision model an array of text and image parts.
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`ai-tools: groq ${res.status}: ${detail.slice(0, 200)}`);
    return {
      status: 502,
      error: res.status === 401 || res.status === 403 ? "The AI key was rejected. Check ACALINK_AI_API."
        : res.status === 404 ? `Model "${model}" was not found. Check ${modelEnv}.`
          : res.status === 413 ? "That file is too large for the AI to read. Try a smaller photo or fewer pages."
            : "The AI service is busy right now. Try again in a moment.",
    };
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  return { text: stripReasoning(choice?.message?.content), truncated: choice?.finish_reason === "length" };
}

async function askJson({ system, user, maxTokens, temperature = 0.4 }) {
  const r = await callModel({ system, user, maxTokens, temperature });
  if (r.error) return r;
  const parsed = parseJson(r.text);
  return parsed ? { data: parsed } : { status: 502, error: "Could not read the AI's reply. Try again." };
}

// ── timetable-load ───────────────────────────────────────────────────────────
async function timetableLoad(body) {
  const periodsPerWeek = Math.max(10, Math.min(60, Number(body.periodsPerWeek) || 40));
  const classes = (Array.isArray(body.classes) ? body.classes : []).slice(0, 40).map((c) => ({
    id: str(c.id, 80), name: str(c.name, 40),
    subjects: (Array.isArray(c.subjects) ? c.subjects : []).slice(0, 25).map((s) => str(s, 50)).filter(Boolean),
  })).filter((c) => c.id && c.subjects.length);
  if (!classes.length) return { status: 400, error: "No classes with subjects to plan." };

  const system = [
    CONTEXT,
    "You plan how many teaching periods per week each subject gets in each class, the way an",
    "experienced Malawian head teacher would: core subjects (English, Mathematics, Chichewa) get the",
    "most, sciences next, and every subject gets at least 2. Senior classes preparing for MSCE or",
    "PSLCE lean further toward examined core subjects.",
    `Each class's total must not exceed ${periodsPerWeek} periods.`,
    "Reply with ONLY JSON, no markdown:",
    '{"loads": {"<class id>": {"<subject exactly as given>": <whole number>, ...}, ...}, "note": "<one sentence on the reasoning>"}',
  ].join("\n");
  const user = classes.map((c) => `${c.id} (${c.name}): ${c.subjects.join(", ")}`).join("\n");

  const r = await askJson({ system, user, maxTokens: 400 + classes.length * 160, temperature: 0.2 });
  if (r.error) return r;

  // Keep only the classes and subjects we asked about, as sane whole numbers.
  const loads = {};
  classes.forEach((c) => {
    const got = r.data?.loads?.[c.id] || {};
    loads[c.id] = Object.fromEntries(c.subjects.map((s) => [s, Math.max(1, Math.min(10, Math.round(Number(got[s]) || 0)))]));
  });
  return { data: { loads, note: str(r.data?.note, 300) } };
}

// ── timetable-extract ────────────────────────────────────────────────────────
const MAX_IMAGES = 3;  // Groq accepts at most 3 images per request
const MAX_IMAGE_CHARS = 4_000_000; // Groq's limit on a base64 image
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
async function timetableExtract(body) {
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, MAX_IMAGES)
    .filter((u) => typeof u === "string" && u.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(u));
  if (!images.length) return { status: 400, error: "Upload a photo or PDF of the timetable." };

  const classes = (Array.isArray(body.classes) ? body.classes : []).slice(0, 80).map((c) => ({
    name: str(c.name, 40),
    subjects: (Array.isArray(c.subjects) ? c.subjects : []).slice(0, 30).map((x) => str(x, 50)).filter(Boolean),
  })).filter((c) => c.name);
  if (!classes.length) return { status: 400, error: "Set up the school's classes first." };
  const days = (Array.isArray(body.days) ? body.days : []).slice(0, 7).map((d) => str(d, 12)).filter(Boolean);
  const periods = (Array.isArray(body.periods) ? body.periods : []).slice(0, 16)
    .map((p) => ({ number: Math.round(Number(p.number)), start: str(p.start, 5), end: str(p.end, 5) }))
    .filter((p) => p.number > 0);
  const teachers = (Array.isArray(body.teachers) ? body.teachers : []).slice(0, 200).map((t) => str(t, 60)).filter(Boolean);

  const system = [
    "You read a school's printed timetable from images and list every lesson on it.",
    "Use the school's own names below. When the timetable abbreviates or spells something",
    'differently but clearly means the same thing ("Maths" for "Mathematics", "F1A" for',
    '"Form 1A", "Mr G. Banda" for "Grace Banda"), write the school\'s name. When nothing',
    "matches, copy what the timetable says exactly — never invent a class, subject or teacher.",
    "Periods: give the school's period number. Match by the times printed on the timetable",
    "when there are any, otherwise by the order of teaching periods in the day. Breaks, lunch,",
    "assembly, games, study and empty cells are not lessons: leave them out.",
    "If one sheet is a single class's timetable, every lesson on it belongs to that class.",
    "Leave teacher or venue as an empty string when the timetable doesn't show them.",
    "Reply with ONLY JSON, no markdown, one array per lesson in this exact order:",
    '{"lessons": [["<class>", "<day>", <period number>, "<subject>", "<teacher>", "<venue>"], ...]}',
  ].join("\n");
  const context = [
    `Days: ${days.join(", ")}`,
    `Periods: ${periods.map((p) => `${p.number} = ${p.start}–${p.end}`).join("; ")}`,
    `Classes and their subjects:\n${classes.map((c) => `- ${c.name}: ${c.subjects.join(", ")}`).join("\n")}`,
    teachers.length ? `Teachers: ${teachers.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const r = await callModel({
    system,
    user: [{ type: "text", text: context }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))],
    maxTokens: 8000,
    temperature: 0,
    model: VISION_MODEL,
    modelEnv: "ACALINK_AI_VISION_MODEL",
    reasoningEffort: VISION_REASONING_EFFORT,
  });
  if (r.error) return r;

  // Parsed lesson by lesson, so a reply cut off at the token limit still
  // yields every lesson before the cut.
  const lessons = parseExtractedLessons(r.text);
  if (!lessons.length) {
    return { status: 422, error: "The AI couldn't find any lessons in that file. Try a clearer photo, taken straight on." };
  }
  return { data: { lessons, truncated: r.truncated } };
}

// ── announcement ─────────────────────────────────────────────────────────────
async function announcement(body) {
  const notes = str(body.notes, 1500);
  if (notes.length < 5) return { status: 400, error: "Write a few words about what the notice should say." };
  const language = ["english", "chichewa", "both"].includes(body.language) ? body.language : "english";
  const audience = str(body.audience, 40) || "parents and guardians";
  const school = str(body.schoolName, 80);

  const system = [
    `You write short, warm, clear school notices for ${audience} on behalf of ${school || "a Malawian school"}.`,
    "Keep every fact, date, amount and time exactly as given. Never invent facts, dates or amounts.",
    "Plain language suitable for WhatsApp or SMS: no markdown, no emoji, under 600 characters per language.",
    "Chichewa must be natural, everyday Malawian Chichewa, not a word-for-word translation.",
    "Reply with ONLY JSON, no markdown:",
    '{"title": "<short title in English>", "english": "<notice or empty>", "chichewa": "<notice or empty>"}',
  ].join("\n");
  const user = `Language: ${language}\nNotes from the school:\n${notes}`;

  const r = await askJson({ system, user, maxTokens: 900, temperature: 0.4 });
  if (r.error) return r;
  return {
    data: {
      title: str(r.data.title, 100),
      english: language === "chichewa" ? "" : String(r.data.english || "").trim().slice(0, 900),
      chichewa: language === "english" ? "" : String(r.data.chichewa || "").trim().slice(0, 900),
    },
  };
}

// ── quiz ─────────────────────────────────────────────────────────────────────
async function quiz(body) {
  const subject = str(body.subject, 60);
  const topic = str(body.topic, 200);
  if (!subject || !topic) return { status: 400, error: "Add a subject and topic first." };
  const className = str(body.className, 40);
  const count = Math.max(3, Math.min(15, Number(body.count) || 5));
  const kind = ["mixed", "multiple-choice", "short-answer"].includes(body.kind) ? body.kind : "mixed";

  const system = [
    CONTEXT,
    "You write classroom questions a teacher can copy onto the chalkboard, pitched at the stated",
    "class and syllabus, going from recall to application. Every question has a correct, concise answer.",
    "Reply with ONLY JSON, no markdown:",
    '{"questions": [{"q": "<question>", "options": ["A ...","B ...","C ...","D ..."] or [], "answer": "<answer>", "marks": <number>}]}',
  ].join("\n");
  const user = `Class: ${className || "not given"}\nSubject: ${subject}\nTopic: ${topic}\nQuestions: ${count}\nType: ${kind}`;

  const r = await askJson({ system, user, maxTokens: 250 + count * 170, temperature: 0.5 });
  if (r.error) return r;
  const questions = (Array.isArray(r.data.questions) ? r.data.questions : []).slice(0, count).map((q) => ({
    q: str(q?.q, 400),
    options: (Array.isArray(q?.options) ? q.options : []).slice(0, 5).map((o) => str(o, 150)).filter(Boolean),
    answer: str(q?.answer, 300),
    marks: Math.max(1, Math.min(20, Math.round(Number(q?.marks) || 1))),
  })).filter((q) => q.q && q.answer);
  if (!questions.length) return { status: 502, error: "The AI returned no usable questions. Try again." };
  return { data: { questions } };
}

const TOOLS = { "timetable-load": timetableLoad, "timetable-extract": timetableExtract, announcement, quiz };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const task = String(req.query?.task);
  // Filling the timetable is the head teacher's job, like the grid itself.
  const who = await requireStaff(req, task === "timetable-extract" ? { roles: ["admin", "head_teacher"] } : {});
  if (!who.ok) return res.status(who.status).json({ error: who.error });

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: "Body is not valid JSON." });

  try {
    const r = await TOOLS[task](body);
    if (r.error) return res.status(r.status || 500).json({ error: r.error });
    return res.status(200).json(r.data);
  } catch (err) {
    console.error("ai-tools failed:", err);
    return res.status(500).json({ error: "The AI request failed. Please try again." });
  }
}
