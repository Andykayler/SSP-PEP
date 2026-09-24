// src/services/aiTools.js
// ─────────────────────────────────────────────────────────────────────────────
// Client side of the smaller AI helpers in api/_lib/aiTools.js (served by
// api/ai.js). Each returns `{ data, error }` and never throws: when the AI is
// unavailable the screen carries on by hand, exactly as before it existed.
// ─────────────────────────────────────────────────────────────────────────────
import { apiPost } from "./api";

async function run(task, body) {
  try {
    return { data: await apiPost(`/api/ai?task=${task}`, body), error: null };
  } catch (err) {
    console.error(`AI ${task} failed:`, err);
    return { data: null, error: err.message || "Could not reach the AI service." };
  }
}

/** classes: [{ id, name, subjects }] → { loads: { classId: { subject: n } }, note } */
export const suggestTimetableLoad = ({ classes, periodsPerWeek }) =>
  run("timetable-load", { classes, periodsPerWeek });

/** → { title, english, chichewa } */
export const draftAnnouncement = ({ notes, language, audience, schoolName }) =>
  run("announcement", { notes, language, audience, schoolName });

/** → { questions: [{ q, options, answer, marks }] } */
export const generateQuiz = ({ className, subject, topic, count, kind }) =>
  run("quiz", { className, subject, topic, count, kind });

/** Questions as chalkboard-ready text, without the answers. */
export function formatQuestions(questions) {
  return questions.map((q, i) => {
    const opts = q.options.length ? `\n${q.options.map((o) => `   ${o}`).join("\n")}` : "";
    return `${i + 1}. ${q.q} (${q.marks} mark${q.marks === 1 ? "" : "s"})${opts}`;
  }).join("\n");
}
