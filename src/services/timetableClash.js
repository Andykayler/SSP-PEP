// src/services/timetableClash.js
// ─────────────────────────────────────────────────────────────────────────────
// Can this timetable actually happen?
//
// The timetable is built one class at a time, so nothing stops the same
// teacher being given Form 2A and Form 3B in the same period — the mistake only
// surfaces on Monday morning when two classes are waiting for one person. This
// looks across every class at once.
//
// Two kinds of clash matter: a teacher in two places, and a venue holding two
// classes (a laboratory cannot host two practicals). Pure and synchronous, so
// it can run on every save and on the whole week at once.
// ─────────────────────────────────────────────────────────────────────────────

const key = (s) => `${s.day}|${s.periodNumber}`;
const norm = (v) => String(v || "").trim().toLowerCase();

/**
 * Every clash in a set of slots.
 * @returns {{ type: "teacher"|"venue", day: string, periodNumber: number, who: string, slots: object[] }[]}
 */
export function findClashes(slots) {
  const byCell = new Map();
  slots.forEach((s) => {
    if (!byCell.has(key(s))) byCell.set(key(s), []);
    byCell.get(key(s)).push(s);
  });

  const out = [];
  byCell.forEach((cell) => {
    if (cell.length < 2) return;

    const teachers = new Map();
    const venues = new Map();
    cell.forEach((s) => {
      if (s.teacherId) teachers.set(s.teacherId, [...(teachers.get(s.teacherId) || []), s]);
      if (norm(s.venue)) venues.set(norm(s.venue), [...(venues.get(norm(s.venue)) || []), s]);
    });

    teachers.forEach((list) => {
      if (list.length > 1) {
        out.push({ type: "teacher", day: list[0].day, periodNumber: list[0].periodNumber, who: list[0].teacherName || "A teacher", slots: list });
      }
    });
    venues.forEach((list) => {
      // Two classes in one venue is only a clash if they are different classes.
      if (new Set(list.map((s) => s.classId)).size > 1) {
        out.push({ type: "venue", day: list[0].day, periodNumber: list[0].periodNumber, who: list[0].venue, slots: list });
      }
    });
  });

  return out.sort((a, b) => a.day.localeCompare(b.day) || a.periodNumber - b.periodNumber);
}

/**
 * What would placing `candidate` collide with? Ignores the candidate's own cell
 * (same class, day and period), which is the slot being replaced.
 */
export function conflictsFor(slots, candidate) {
  const others = slots.filter((s) => !(s.classId === candidate.classId && key(s) === key(candidate)) && key(s) === key(candidate));
  const found = [];

  if (candidate.teacherId) {
    others.filter((s) => s.teacherId === candidate.teacherId).forEach((s) => {
      found.push({ type: "teacher", slot: s, message: `${s.teacherName || "This teacher"} is already teaching ${s.className} (${s.subject || "a lesson"}) at this time.` });
    });
  }
  if (norm(candidate.venue)) {
    others.filter((s) => norm(s.venue) === norm(candidate.venue)).forEach((s) => {
      found.push({ type: "venue", slot: s, message: `${s.venue} is already in use by ${s.className} at this time.` });
    });
  }
  return found;
}

/** A human sentence for a clash from findClashes(). */
export function describeClash(c) {
  const classes = [...new Set(c.slots.map((s) => s.className).filter(Boolean))].join(" and ");
  return c.type === "teacher"
    ? `${c.who} is booked for ${classes} on ${c.day}, period ${c.periodNumber}`
    : `${c.who} is booked for ${classes} on ${c.day}, period ${c.periodNumber}`;
}
