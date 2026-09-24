// src/services/timetableGenCore.js
// ─────────────────────────────────────────────────────────────────────────────
// Builds a whole-school timetable from "which subjects each class takes, how
// many periods a week each gets, and who teaches it".
//
// The AI (api/_lib/aiTools.js, task=timetable-load) only suggests the weekly
// load — how many periods of Mathematics Form 3 should get. Placing lessons is
// done here, deterministically, because a language model left to lay out a
// grid will happily put one teacher in two rooms at once. This never does:
// every placement is checked against every other class, including the slots
// the head teacher already has and chose to keep.
//
// Pure and synchronous; tested in tests/logic/timetableGen.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

/** Rough MIE-style weighting, used when the AI isn't available or is off. */
const HEAVY = /^(english|mathematics|maths|chichewa)/i;
const MEDIUM = /(science|biology|chemistry|physics|agriculture|geography|history|social|life skills|expressive)/i;

export function defaultLoad(subject) {
  if (HEAVY.test(subject)) return 6;
  if (MEDIUM.test(subject)) return 4;
  return 3;
}

/**
 * Scales a class's requested periods down to fit the week, keeping every
 * subject at least one period and trimming the largest first.
 * @param {Record<string, number>} load  subject → periods per week
 * @param {number} capacity  free periods in the week
 */
export function fitLoad(load, capacity) {
  const out = Object.fromEntries(
    Object.entries(load).map(([s, n]) => [s, Math.max(0, Math.round(Number(n) || 0))]).filter(([, n]) => n > 0),
  );
  let total = Object.values(out).reduce((a, b) => a + b, 0);
  while (total > capacity) {
    const [subject, n] = Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    if (!subject || n <= 1) break;
    out[subject] = n - 1;
    total -= 1;
  }
  return out;
}

/**
 * The teacher for a class and subject: someone assigned to both. Ties go to
 * whoever has the fewest lessons so far, so work spreads across a department.
 */
function pickTeacher(teachers, className, subject, lessonsByTeacher) {
  const able = teachers.filter(
    (t) => (t.assignedClasses || []).includes(className) && (t.assignedSubjects || []).includes(subject),
  );
  if (!able.length) return null;
  return [...able].sort((a, b) => (lessonsByTeacher.get(a.id) || 0) - (lessonsByTeacher.get(b.id) || 0) || a.id.localeCompare(b.id))[0];
}

/**
 * @param {object} input
 * @param {{id:string,name:string,subjects?:string[]}[]} input.classes  classes to (re)build
 * @param {{id:string,name:string,assignedClasses?:string[],assignedSubjects?:string[]}[]} input.teachers
 * @param {Record<string, Record<string, number>>} input.loads  classId → subject → periods/week
 * @param {string[]} input.days
 * @param {{number:number,start:string,end:string}[]} input.periods
 * @param {object[]} [input.keep]  slots already in the school that stay (other classes, or kept lessons)
 * @returns {{ slots: object[], unplaced: {classId:string,className:string,subject:string,count:number,reason:string}[], noTeacher: {className:string,subject:string}[] }}
 */
export function generateTimetable({ classes, teachers, loads, days, periods, keep = [] }) {
  const cell = (day, p) => `${day}|${p}`;
  const busyTeacher = new Map(); // cell → Set(teacherId)
  const busyClass = new Map(); // cell → Set(classId)
  const lessonsByTeacher = new Map();
  const mark = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };

  keep.forEach((s) => {
    const k = cell(s.day, s.periodNumber);
    if (s.teacherId) {
      mark(busyTeacher, k, s.teacherId);
      lessonsByTeacher.set(s.teacherId, (lessonsByTeacher.get(s.teacherId) || 0) + 1);
    }
    if (s.classId) mark(busyClass, k, s.classId);
  });

  // Every lesson that has to happen, with its teacher decided up front.
  const lessons = [];
  const noTeacher = [];
  classes.forEach((c) => {
    const free = days.length * periods.length
      - days.reduce((n, d) => n + periods.filter((p) => busyClass.get(cell(d, p.number))?.has(c.id)).length, 0);
    const load = fitLoad(loads[c.id] || {}, free);
    Object.entries(load).forEach(([subject, count]) => {
      const teacher = pickTeacher(teachers, c.name, subject, lessonsByTeacher);
      if (!teacher) { noTeacher.push({ className: c.name, subject }); return; }
      lessonsByTeacher.set(teacher.id, (lessonsByTeacher.get(teacher.id) || 0) + count);
      lessons.push({ cls: c, subject, teacher, count });
    });
  });

  // Hardest first: teachers carrying the most lessons have the fewest free
  // cells, so they're placed while there's still room.
  const load = (t) => lessons.filter((l) => l.teacher.id === t.id).reduce((a, l) => a + l.count, 0);
  lessons.sort((a, b) => load(b.teacher) - load(a.teacher) || b.count - a.count
    || a.cls.name.localeCompare(b.cls.name) || a.subject.localeCompare(b.subject));

  const slots = [];
  const unplaced = [];
  const perDay = new Map(); // classId|subject|day → count

  lessons.forEach(({ cls, subject, teacher, count }) => {
    let left = count;
    const dayCount = (d) => perDay.get(`${cls.id}|${subject}|${d}`) || 0;
    // Pass 1 spreads the subject across the week (one a day); pass 2 allows a
    // second period on a day only when the week is too full to avoid it.
    for (const maxPerDay of [1, 2, 3]) {
      if (!left) break;
      // Rotate the starting period per class and subject so Mathematics isn't
      // always first thing for every class.
      const offset = (cls.name.length + subject.length) % periods.length;
      const orderedDays = [...days].sort((a, b) => dayCount(a) - dayCount(b) || days.indexOf(a) - days.indexOf(b));
      for (const day of orderedDays) {
        if (!left) break;
        if (dayCount(day) >= maxPerDay) continue;
        for (let i = 0; i < periods.length && left && dayCount(day) < maxPerDay; i++) {
          const p = periods[(i + offset) % periods.length];
          const k = cell(day, p.number);
          if (busyClass.get(k)?.has(cls.id) || busyTeacher.get(k)?.has(teacher.id)) continue;
          mark(busyClass, k, cls.id);
          mark(busyTeacher, k, teacher.id);
          perDay.set(`${cls.id}|${subject}|${day}`, dayCount(day) + 1);
          slots.push({
            classId: cls.id, className: cls.name, day, periodNumber: p.number,
            startTime: p.start, endTime: p.end, subject,
            teacherId: teacher.id, teacherName: teacher.name || "", venue: "",
          });
          left -= 1;
        }
      }
    }
    if (left) unplaced.push({ classId: cls.id, className: cls.name, subject, count: left, reason: `${teacher.name || "The teacher"} has no free period left that the class also has free.` });
  });

  return { slots, unplaced, noTeacher };
}
