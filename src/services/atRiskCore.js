// src/services/atRiskCore.js
// ─────────────────────────────────────────────────────────────────────────────
// Which learners is the school about to lose?
//
// A child rarely drops out or fails from one cause. Attendance slips first,
// marks follow, a discipline case or a fee problem lands on top — and each of
// those lives in a different module, read by a different person, so nobody sees
// the pattern until it is a decision the family has already made. This puts the
// signals side by side and ranks the learners by how many are lit and how hard.
//
// It is deliberately transparent: every learner is listed WITH the signals that
// put them there, in plain words, because a score nobody can explain gets
// ignored, and a head teacher acting on "risk 7.5" would be guessing.
//
// Pure — no Firebase — so the thresholds are tested (tests/logic).
// ─────────────────────────────────────────────────────────────────────────────

export const WINDOW_DAYS = 28;          // how far back attendance is read
export const DISCIPLINE_DAYS = 60;      // how far back discipline is read
export const MIN_SESSIONS = 5;          // fewer register days than this says nothing

/** Points per signal. Fees weigh less than the child's own behaviour and results. */
const WEIGHT = {
  attendance: { high: 3, medium: 1.5 },
  marks: { high: 3, medium: 1.5 },
  discipline: { high: 3, medium: 1.5 },
  fees: { high: 2, medium: 1 },
};

export const HIGH_AT = 4;     // score at or above: high risk
export const WATCH_AT = 2;    // score at or above: worth watching

const DAY = 86_400_000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const cutoff = (today, days) => isoDay(Date.parse(`${today}T00:00:00Z`) - days * DAY);

// ─── The four signals ────────────────────────────────────────────────────────
function attendanceSignal(studentId, attendance, today) {
  const since = cutoff(today, WINDOW_DAYS);
  const days = attendance
    .filter((a) => a.date >= since && a.date <= today && a.records?.[studentId])
    .sort((a, b) => b.date.localeCompare(a.date));           // newest first
  if (days.length < MIN_SESSIONS) return null;

  const absent = days.filter((d) => d.records[studentId].status === "Absent").length;
  const rate = absent / days.length;

  let run = 0;
  for (const d of days) {
    if (d.records[studentId].status === "Absent") run += 1; else break;
  }

  if (run >= 3) return { kind: "attendance", level: "high", text: `Absent ${run} days in a row`, share: true };
  if (rate >= 0.3) return { kind: "attendance", level: "high", text: `Absent ${absent} of the last ${days.length} school days`, share: true };
  if (rate >= 0.15) return { kind: "attendance", level: "medium", text: `Absent ${absent} of the last ${days.length} school days`, share: true };
  return null;
}

function marksSignal(subjects) {
  const entries = Object.entries(subjects || {});
  if (entries.length < 3) return null;                       // too little to judge
  const scores = entries.map(([, v]) => v.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const failing = entries.filter(([, v]) => v.score < 40).sort((a, b) => a[1].score - b[1].score);

  if (mean < 40) return { kind: "marks", level: "high", text: `Average ${Math.round(mean)}% across ${entries.length} subjects`, share: true };
  if (failing.length >= 3) return { kind: "marks", level: "high", text: `Failing ${failing.length} subjects (${failing.slice(0, 3).map(([s, v]) => `${s} ${Math.round(v.score)}`).join(", ")})`, share: true };
  if (mean < 50) return { kind: "marks", level: "medium", text: `Average ${Math.round(mean)}% across ${entries.length} subjects`, share: true };
  if (failing.length === 2) return { kind: "marks", level: "medium", text: `Failing 2 subjects (${failing.map(([s, v]) => `${s} ${Math.round(v.score)}`).join(", ")})`, share: true };
  return null;
}

function disciplineSignal(studentId, cases, today) {
  const since = cutoff(today, DISCIPLINE_DAYS);
  const mine = cases.filter((c) => c.studentId === studentId && (c.date || "") >= since);
  if (mine.length === 0) return null;
  if (mine.some((c) => c.severity === "High")) return { kind: "discipline", level: "high", text: `A high-severity discipline case in the last ${DISCIPLINE_DAYS} days`, share: true };
  if (mine.length >= 3) return { kind: "discipline", level: "high", text: `${mine.length} discipline cases in the last ${DISCIPLINE_DAYS} days`, share: true };
  if (mine.length === 2) return { kind: "discipline", level: "medium", text: "2 discipline cases in the last 60 days", share: true };
  return null;
}

/** Never shown to guardians in the message: how much a family owes is not a "we'd like to talk" topic. */
function feesSignal(row) {
  if (!row || !(row.totalCharged > 0) || !(row.balance > 0)) return null;
  const owed = row.balance / row.totalCharged;
  if (row.termsOld >= 2) return { kind: "fees", level: "high", text: `Fees owed since ${row.termsOld} terms back`, share: false };
  if (owed >= 0.9) return { kind: "fees", level: "medium", text: "Almost nothing paid this term", share: false };
  return null;
}

// ─── Ranking ─────────────────────────────────────────────────────────────────
/**
 * @param {object} p
 * @param {object[]} p.students
 * @param {object[]} p.attendance      register docs: { date, records: { [studentId]: { status } } }
 * @param {Map<string, object>} p.marks  studentId → { subject: { score } }   (mergeMarks output)
 * @param {object[]} p.arrears         buildArrears() rows
 * @param {object[]} p.discipline      { studentId, severity, date }
 * @param {string} p.today             yyyy-mm-dd
 * @returns {object[]} learners with at least one signal, worst first
 */
export function rankAtRisk({ students, attendance = [], marks = new Map(), arrears = [], discipline = [], today }) {
  const fees = new Map(arrears.map((r) => [r.id, r]));

  return students
    .filter((s) => s.status !== "withdrawn")
    .map((student) => {
      const signals = [
        attendanceSignal(student.id, attendance, today),
        marksSignal(marks.get(student.id)),
        disciplineSignal(student.id, discipline, today),
        feesSignal(fees.get(student.id)),
      ].filter(Boolean);

      let score = signals.reduce((n, s) => n + WEIGHT[s.kind][s.level], 0);
      // Three different kinds of trouble at once is a pattern, not bad luck.
      if (new Set(signals.map((s) => s.kind)).size >= 3) score += 1;

      const level = score >= HIGH_AT ? "high" : score >= WATCH_AT ? "watch" : "low";
      const shareable = signals.filter((s) => s.share).map((s) => s.text);
      return { student, signals, score, level, guardianReasons: shareable.length ? `${shareable.join(". ")}.` : "" };
    })
    .filter((r) => r.level !== "low")
    .sort((a, b) => b.score - a.score || (a.student.fullName || "").localeCompare(b.student.fullName || ""));
}

export const LEVELS = {
  high: { label: "High risk", tone: "danger" },
  watch: { label: "Watch", tone: "warning" },
};

export const SIGNAL_LABEL = { attendance: "Attendance", marks: "Results", discipline: "Discipline", fees: "Fees" };
