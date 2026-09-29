// src/services/timetableImportCore.js
// ─────────────────────────────────────────────────────────────────────────────
// Turning an uploaded timetable into timetable periods. Pure; the head
// teacher's Timetable screen reads the file and saves what this returns, and
// tests/logic exercises it directly. The rows come from one of two places:
//
//   • a photo or PDF of the printed timetable, read by the AI — see
//     parseExtractedLessons() at the foot of this file;
//   • a spreadsheet (CSV), one row per lesson, with these columns (any order,
//     any capitalisation):
//
//   Class, Day, Period, Subject, Teacher, Venue
//   Form 1A, Monday, 1, Mathematics, Grace Banda, Room 4
//
// Classes, subjects and teachers are matched by name against what the school
// has set up, so a typo is reported against its line instead of creating a
// period nobody can find. Uploading replaces the timetable of every class the
// file mentions; classes it doesn't mention keep theirs.
// ─────────────────────────────────────────────────────────────────────────────
import { findClashes, describeClash } from "./timetableClash.js";

export const TIMETABLE_COLUMNS = ["Class", "Day", "Period", "Subject", "Teacher", "Venue"];

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** "mon", "Monday", "MONDAY" → "Monday", if it is one of the school's days. */
export function matchDay(value, days) {
  const v = norm(value);
  if (!v) return null;
  return days.find((d) => norm(d) === v || norm(d).slice(0, 3) === v.slice(0, 3)) || null;
}

/** "3", "P3", "Period 3" → the period with number 3. */
export function matchPeriod(value, periods) {
  const m = /(\d+)/.exec(String(value ?? ""));
  if (!m) return null;
  return periods.find((p) => p.number === Number(m[1])) || null;
}

function staffNames(t) {
  return [t.name, t.displayName, t.fullName, `${t.firstName || ""} ${t.lastName || ""}`, t.email]
    .map(norm).filter(Boolean);
}

/**
 * @param {{ rows: object[], classes: object[], staff: object[], days: string[],
 *           periods: {number,start,end}[], existingSlots: object[], strict?: boolean }} input
 *   rows are parseCsvRows() output: keys lower-cased, `__line` the file line.
 *   strict (the default, for a spreadsheet the school typed) refuses a lesson
 *   whose teacher can't be matched. Off, for what the AI read off a photo, the
 *   lesson is kept without a teacher and listed in `warnings` — a misread name
 *   is easy to fix in the grid, a missing lesson is not.
 * @returns {{ slots: object[], classIds: string[], errors: {line, message}[],
 *             warnings: {line, message}[], clashes: string[] }}
 */
export function planTimetableImport({ rows = [], classes = [], staff = [], days = [], periods = [], existingSlots = [], strict = true }) {
  const errors = [];
  const warnings = [];
  const slots = [];
  const seen = new Map();

  rows.forEach((row) => {
    const line = row.__line;
    // A row with no lesson in it is a free period — the template has one for
    // every slot, and nobody should have to delete the ones they leave empty.
    if (!row.subject && !row.teacher && !row.venue) return;
    const problems = [];
    const cls = classes.find((c) => norm(c.name) === norm(row.class));
    const day = matchDay(row.day, days);
    const period = matchPeriod(row.period, periods);
    if (!cls) problems.push(row.class ? `no class called "${row.class}"` : "the class is missing");
    if (!day) problems.push(row.day ? `"${row.day}" isn't a school day` : "the day is missing");
    if (!period) problems.push(row.period ? `there is no period "${row.period}"` : "the period is missing");

    let subject = null;
    if (!row.subject) problems.push("the subject is missing");
    else if (cls) {
      subject = (cls.subjects || []).find((s) => norm(s) === norm(row.subject)) || null;
      if (!subject) problems.push(`${cls.name} doesn't take "${row.subject}"`);
    }

    let teacher = null;
    let teacherProblem = "";
    if (row.teacher) {
      const matches = staff.filter((t) => staffNames(t).includes(norm(row.teacher)));
      if (matches.length === 1) [teacher] = matches;
      else if (matches.length > 1) teacherProblem = `more than one staff member is called "${row.teacher}" — use their email`;
      else teacherProblem = `no staff member called "${row.teacher}"`;
    }
    if (teacherProblem && strict) problems.push(teacherProblem);

    if (problems.length) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }

    const cellKey = `${cls.id}|${day}|${period.number}`;
    if (seen.has(cellKey)) {
      errors.push({ line, message: `${cls.name} already has a lesson on ${day} period ${period.number} (line ${seen.get(cellKey)})` });
      return;
    }
    seen.set(cellKey, line);
    if (teacherProblem) warnings.push({ line, message: `${cls.name} ${day} period ${period.number}: ${teacherProblem}, so no teacher was set` });

    slots.push({
      classId: cls.id,
      className: cls.name,
      day,
      periodNumber: period.number,
      startTime: period.start,
      endTime: period.end,
      subject,
      teacherId: teacher?.id || "",
      teacherName: teacher ? (teacher.name || teacher.displayName || teacher.fullName || "") : "",
      venue: String(row.venue || "").trim(),
    });
  });

  // The week as it would be: this file's classes replaced, everyone else kept.
  const classIds = [...new Set(slots.map((s) => s.classId))];
  const kept = existingSlots.filter((s) => !classIds.includes(s.classId));
  const clashes = findClashes([...kept, ...slots])
    .filter((c) => c.slots.some((s) => classIds.includes(s.classId)))
    .map(describeClash);

  return { slots, classIds, errors, warnings, clashes };
}

/** A starter file: every class, every day and period, subject/teacher blank. */
export function timetableTemplateRows(classes, days, periods) {
  return classes.flatMap((c) => days.flatMap((d) => periods.map((p) => [c.name, d, p.number, "", "", ""])));
}

// ─── Reading the AI's reply ──────────────────────────────────────────────────
// api/_lib/aiTools.js (task=timetable-extract) asks a vision model to read a
// photo or PDF of the printed timetable and reply with one array per lesson:
//   ["<class>", "<day>", <period>, "<subject>", "<teacher>", "<venue>"]
// Each is picked out on its own rather than parsing the reply as a whole, so a
// reply cut off at the model's token limit still gives every lesson before it.
const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const LESSON_RE = new RegExp(String.raw`\[\s*${STR}\s*,\s*${STR}\s*,\s*"?(\d+)"?\s*,\s*${STR}\s*,\s*${STR}\s*,\s*${STR}\s*\]`, "g");

const unquote = (s, max) => {
  let v;
  try { v = JSON.parse(`"${s}"`); } catch { v = s; }
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
};

/** The model's reply → rows shaped like parseCsvRows() output, for planTimetableImport. */
export function parseExtractedLessons(text, max = 1500) {
  return [...String(text || "").matchAll(LESSON_RE)].slice(0, max).map((m, i) => ({
    __line: i + 1,
    class: unquote(m[1], 40),
    day: unquote(m[2], 12),
    period: m[3],
    subject: unquote(m[4], 50),
    teacher: unquote(m[5], 60),
    venue: unquote(m[6], 40),
  }));
}
