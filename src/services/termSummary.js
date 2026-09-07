// src/services/termSummary.js
// ─────────────────────────────────────────────────────────────────────────────
// How a pupil's term actually went, in the three things a parent asks about:
// marks, attendance and conduct.
//
// The report card already carries the marks. This adds the other two, because
// an average on its own does not explain itself — a pupil who dropped ten
// points and missed fourteen days has a different problem from one who dropped
// ten points with a full register, and the advice a parent needs differs.
//
// Read once, for a whole class at a time. Attendance lives in one document per
// class per day, so a term is roughly sixty documents however many pupils are
// in the class — fetching per pupil would be sixty reads each.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { termWindow, isPastTerm } from "./academicTerm";

/** Register marks. `Late` counts as present for attendance rate, separately for punctuality. */
const PRESENT = new Set(["Present", "Late"]);

/**
 * Attendance and discipline for every pupil in a school, within one term.
 *
 * Returns a Map keyed by student id. A pupil with no records at all still gets
 * an entry with zeroes — the absence of a register is not the same as perfect
 * attendance, and `daysRecorded: 0` lets the caller say so rather than quietly
 * reporting 100%.
 */
export async function fetchTermSummaries({ schoolCode, term }) {
  const summaries = new Map();
  if (!schoolCode) return summaries;

  const window = termWindow(term);

  const touch = (id) => {
    if (!summaries.has(id)) {
      summaries.set(id, {
        daysRecorded: 0,
        present: 0,
        absent: 0,
        late: 0,
        disciplineCases: 0,
        seriousCases: 0,
        offenses: [],
      });
    }
    return summaries.get(id);
  };

  const inWindow = (date) =>
    !window || !date || (date >= window.start && date <= window.end);

  // ── Attendance ──
  // Firestore cannot range-filter on `date` and equality-filter on schoolCode
  // without a composite index that has to be created by hand, so the term
  // window is applied in memory. A school's term is a few dozen documents.
  try {
    const snap = await getDocs(query(
      collection(db, "attendance"),
      where("schoolCode", "==", schoolCode),
    ));

    snap.docs.forEach((d) => {
      const data = d.data();
      if (!inWindow(data.date)) return;

      Object.entries(data.records || {}).forEach(([studentId, entry]) => {
        // Registers have been written both as a bare status string and as an
        // object carrying a time, so accept either rather than trusting one.
        const status = typeof entry === "string" ? entry : entry?.status;
        if (!status) return;

        const row = touch(studentId);
        row.daysRecorded += 1;
        if (PRESENT.has(status)) row.present += 1;
        if (status === "Absent") row.absent += 1;
        if (status === "Late") row.late += 1;
      });
    });
  } catch (err) {
    console.error("[termSummary] attendance read failed:", err);
  }

  // ── Discipline ──
  try {
    const snap = await getDocs(query(
      collection(db, "discipline_cases"),
      where("schoolCode", "==", schoolCode),
    ));

    snap.docs.forEach((d) => {
      const data = d.data();
      if (!inWindow(data.date)) return;

      const row = touch(data.studentId);
      row.disciplineCases += 1;
      if (data.severity === "High") row.seriousCases += 1;
      // Kept for the AI prompt, which reads better given the actual offence
      // than a bare count. Capped: three is plenty of context for a summary.
      if (data.offense && row.offenses.length < 3) row.offenses.push(data.offense);
    });
  } catch (err) {
    console.error("[termSummary] discipline read failed:", err);
  }

  return summaries;
}

/**
 * Every report card already issued, per pupil, oldest first.
 *
 * This is the difference between a remark and an analysis. "65% this term" is
 * not a finding — it is 65% after 48% last term, or after 79%, and those are
 * opposite stories needing opposite advice. Each issued card already stores
 * the average, the position and the per-subject marks for its term, so the
 * history is sitting there; nothing was reading it.
 *
 * Terms at or after `upToTerm` are excluded, so re-issuing a card does not
 * feed the term its own previous attempt back to the model as history.
 */
export async function fetchReportCardHistory({ schoolCode, upToTerm }) {
  const history = new Map();
  if (!schoolCode) return history;

  try {
    const snap = await getDocs(query(
      collection(db, "report_cards"),
      where("schoolCode", "==", schoolCode),
    ));

    snap.docs.forEach((d) => {
      const c = d.data();
      if (!c?.studentId || !c.term) return;
      if (upToTerm && !isPastTerm(c.term, upToTerm)) return;

      if (!history.has(c.studentId)) history.set(c.studentId, []);
      history.get(c.studentId).push({
        term: c.term,
        average: typeof c.overallAverage === "number" ? Math.round(c.overallAverage) : null,
        position: c.position ?? null,
        classSize: c.classSize ?? null,
        subjects: (c.subjects || [])
          .filter((r) => typeof r?.score === "number")
          .map((r) => ({ subject: r.subject, score: Math.round(r.score) })),
      });
    });

    // Oldest first, so a reader — human or model — sees the direction of travel
    // rather than having to sort it out.
    history.forEach((rows) => rows.sort((a, b) => (isPastTerm(a.term, b.term) ? -1 : 1)));
  } catch (err) {
    console.error("[termSummary] report card history read failed:", err);
  }

  return history;
}

/** Attendance as a percentage, or null when no register was ever taken. */
export function attendanceRate(summary) {
  if (!summary?.daysRecorded) return null;
  return Math.round((summary.present / summary.daysRecorded) * 100);
}

/**
 * A one-line, human reading of attendance — what a parent would actually be
 * told, rather than a number they have to interpret.
 */
export function attendanceLabel(summary) {
  const rate = attendanceRate(summary);
  if (rate === null) return "no register recorded";
  if (rate >= 95) return "excellent attendance";
  if (rate >= 90) return "good attendance";
  if (rate >= 80) return "some absence";
  return "frequent absence";
}
