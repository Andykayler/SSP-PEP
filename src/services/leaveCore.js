// src/services/leaveCore.js
// The pure half of leave and cover: dates, which lessons an absence affects, and
// who could take them. No Firebase, so it can be tested directly. Reading and
// writing lives in leave.js.
// ─────────────────────────────────────────────────────────────────────────────
// Staff leave, and the cover that keeps lessons going while someone is away.
//
// The two are one workflow: a leave request is approved, the timetable says
// which lessons that teacher was going to take on those dates, and each of
// those lessons needs someone. Doing the second half by hand — scanning the
// whole timetable for a free teacher, class by class — is what makes leave
// hard for a head teacher to approve. So this works it out: the lessons
// affected, and for each, the teachers who are actually free, best fit first.
// ─────────────────────────────────────────────────────────────────────────────

export const LEAVE_TYPES = [
  "Annual leave", "Sick leave", "Maternity / paternity", "Compassionate leave",
  "Study leave", "Official duty", "Unpaid leave", "Other",
];

export const STATUS_LABEL = {
  pending: "Awaiting decision", approved: "Approved", rejected: "Not approved", cancelled: "Withdrawn",
};
export const STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MS = 86_400_000;
const dateOf = (iso) => new Date(`${iso}T00:00:00`);
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dayName = (iso) => DAY_NAMES[dateOf(iso).getDay()];

/** Every school day (Mon–Fri) from `start` to `end`, inclusive, as yyyy-mm-dd. */
export function schoolDaysBetween(start, end) {
  if (!start || !end || end < start) return [];
  const out = [];
  for (let t = dateOf(start).getTime(); t <= dateOf(end).getTime(); t += MS) {
    const d = new Date(t);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(isoOf(d));
  }
  return out;
}

export const workingDays = (start, end) => schoolDaysBetween(start, end).length;

// ─── Lessons that need cover ─────────────────────────────────────────────────
/**
 * The lessons a teacher would have taken on the dates of an (approved) leave.
 * One entry per lesson per date, so a five-day leave with three lessons a day
 * is fifteen.
 */
export function lessonsAffected(leave, timetable) {
  const mine = timetable.filter((s) => s.teacherId === leave.staffId);
  const out = [];
  schoolDaysBetween(leave.startDate, leave.endDate).forEach((date) => {
    const day = dayName(date);
    mine.filter((s) => s.day === day).forEach((s) => {
      out.push({
        key: `${date}_${s.classId}_${s.periodNumber}`,
        date, day,
        classId: s.classId, className: s.className,
        periodNumber: s.periodNumber, startTime: s.startTime, endTime: s.endTime,
        subject: s.subject, venue: s.venue || "",
        originalTeacherId: leave.staffId, originalTeacherName: leave.staffName,
        leaveId: leave.id,
      });
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.periodNumber - b.periodNumber);
}

/** Doc id for a cover assignment: one per lesson per date, so assigning twice replaces. */
export const subId = (schoolCode, lesson) => `${schoolCode}_${lesson.date}_${lesson.classId}_${lesson.periodNumber}`;

/**
 * Who could take this lesson, best fit first. A teacher is ruled out if they
 * are teaching another class then, are on approved leave that day, or already
 * have cover at that time. Among the rest: someone who teaches the subject
 * comes first, then someone who teaches that class, then whoever has covered
 * the least this week (so the load is shared, not dumped on one person).
 */
export function suggestCover({ lesson, teachers, timetable, substitutions, leaves }) {
  const busy = new Set();

  timetable
    .filter((s) => s.day === lesson.day && s.periodNumber === lesson.periodNumber && s.teacherId)
    .forEach((s) => busy.add(s.teacherId));

  substitutions
    .filter((s) => s.date === lesson.date && s.periodNumber === lesson.periodNumber && s.status !== "declined" && s.substituteId)
    .forEach((s) => busy.add(s.substituteId));

  leaves
    .filter((l) => l.status === "approved" && l.startDate <= lesson.date && l.endDate >= lesson.date)
    .forEach((l) => busy.add(l.staffId));

  const weekStart = (() => {
    const d = dateOf(lesson.date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return isoOf(d);
  })();
  const dutyCount = (id) => substitutions.filter((s) => s.substituteId === id && s.date >= weekStart && s.status !== "declined").length;

  return teachers
    .filter((t) => t.id !== lesson.originalTeacherId && !busy.has(t.id) && t.status !== "disabled")
    .map((t) => {
      const teachesSubject = (t.assignedSubjects || []).includes(lesson.subject);
      const teachesClass = (t.assignedClasses || []).includes(lesson.className);
      return { ...t, teachesSubject, teachesClass, duties: dutyCount(t.id), score: (teachesSubject ? 2 : 0) + (teachesClass ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score || a.duties - b.duties || (a.name || "").localeCompare(b.name || ""));
}
