// src/services/examsCore.js
// ─────────────────────────────────────────────────────────────────────────────
// Running an examination: the timetable, where each candidate sits, who
// invigilates, and — afterwards — how each subject did.
//
// One exam is one document holding its papers, rooms, seating and duty roster
// (see the `exams` rules for why).
//
// This file is the pure half — no Firebase — so it can be tested directly; the
// reading and writing lives in exams.js. Almost everything here is a pure function
// over that document, so the seating and invigilation logic can be exercised
// without a database — and re-run, which matters: the first draft of a seating
// plan is never the last.
// ─────────────────────────────────────────────────────────────────────────────
import { gradeFor, isCredit, MANEB } from "./maneb.js";

export const EXAM_TYPES = ["Continuous assessment", "Mid-term", "End of term", "Mock", "MSCE / national"];

export const newId = () => Math.random().toString(36).slice(2, 10);

// ─── Time helpers ────────────────────────────────────────────────────────────
const toMin = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const overlap = (a, b) => a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

export const fmtDate = (iso) =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—");

// ─── Papers ──────────────────────────────────────────────────────────────────
/**
 * Problems with the paper timetable. A candidate cannot sit two papers at once,
 * and a class sitting three in a day is worth a second look.
 * @returns {{ level: "error"|"warning", message: string }[]}
 */
export function paperProblems(papers) {
  const out = [];
  papers.forEach((a, i) => {
    papers.slice(i + 1).forEach((b) => {
      if (a.className === b.className && overlap(a, b)) {
        out.push({ level: "error", message: `${a.className} has ${a.subject} and ${b.subject} at the same time on ${fmtDate(a.date)}.` });
      }
    });
    if (toMin(a.end) <= toMin(a.start)) {
      out.push({ level: "error", message: `${a.className} ${a.subject} ends before it starts.` });
    }
  });

  const perDay = new Map();
  papers.forEach((p) => {
    const k = `${p.className}|${p.date}`;
    perDay.set(k, (perDay.get(k) || 0) + 1);
  });
  perDay.forEach((n, k) => {
    if (n >= 3) { const [c, d] = k.split("|"); out.push({ level: "warning", message: `${c} sits ${n} papers on ${fmtDate(d)}.` }); }
  });
  return out;
}

export const sortPapers = (papers) =>
  [...papers].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`) || (a.className || "").localeCompare(b.className || ""));

// ─── Seating ─────────────────────────────────────────────────────────────────
const nameOf = (s) => s.fullName || `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Unnamed";

/**
 * Places every candidate in a room and a numbered seat.
 *
 * Classes are interleaved rather than filled one after another, so the person
 * beside a candidate is usually from a different class — and therefore usually
 * sitting a different paper, or at least a different teacher's syllabus.
 * Candidate numbers are assigned alphabetically across the whole exam, so a
 * number is stable if the seating is regenerated.
 *
 * @returns {{ seating: object, unplaced: object[], capacity: number, candidates: number }}
 */
export function generateSeating({ students, classNames, rooms, prefix = "" }) {
  const wanted = new Set(classNames);
  const pool = students.filter((s) => wanted.has(s.className) && s.status !== "withdrawn");

  // Candidate numbers first, alphabetically, so they do not depend on the room plan.
  const numbered = [...pool].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const candidateNo = new Map(numbered.map((s, i) => [s.id, `${prefix}${String(i + 1).padStart(4, "0")}`]));

  // Round-robin across classes.
  const queues = classNames
    .map((c) => pool.filter((s) => s.className === c).sort((a, b) => nameOf(a).localeCompare(nameOf(b))))
    .filter((q) => q.length);
  const order = [];
  while (queues.some((q) => q.length)) queues.forEach((q) => { if (q.length) order.push(q.shift()); });

  const seating = {};
  const unplaced = [];
  let r = 0;
  let seat = 1;
  order.forEach((s) => {
    while (r < rooms.length && seat > Number(rooms[r].capacity)) { r += 1; seat = 1; }
    if (r >= rooms.length) { unplaced.push(s); return; }
    seating[s.id] = { roomId: rooms[r].id, seat, candidateNo: candidateNo.get(s.id) };
    seat += 1;
  });

  return {
    seating, unplaced,
    capacity: rooms.reduce((n, x) => n + (Number(x.capacity) || 0), 0),
    candidates: pool.length,
  };
}

/** Each room's candidates in seat order. */
export function roomLists(exam, students) {
  const byId = new Map(students.map((s) => [s.id, s]));
  return (exam.rooms || []).map((room) => {
    const learners = Object.entries(exam.seating || {})
      .filter(([, v]) => v.roomId === room.id)
      .map(([id, v]) => ({ ...v, id, student: byId.get(id) }))
      .filter((x) => x.student)
      .sort((a, b) => a.seat - b.seat);
    return { room, learners };
  });
}

// ─── Invigilation ────────────────────────────────────────────────────────────
/** Which rooms hold at least one candidate from a paper's class. */
export function roomsForPaper(exam, paper, students) {
  const inClass = new Set(students.filter((s) => s.className === paper.className).map((s) => s.id));
  const rooms = new Set();
  Object.entries(exam.seating || {}).forEach(([id, v]) => { if (inClass.has(id)) rooms.add(v.roomId); });
  return (exam.rooms || []).filter((r) => rooms.has(r.id));
}

/**
 * Builds an invigilation roster: for every paper, every room that has candidates
 * for it gets `perRoom` invigilators.
 *
 * A teacher is not put in a room for a paper in their own subject when anyone
 * else is available (they would be marking their own exam), is never put in two
 * places at once, and is left out entirely if they are on approved leave that
 * day. Among those who remain the least-loaded goes first, so the burden is
 * shared rather than landing on whoever comes first alphabetically.
 *
 * @returns {{ duty: object[], gaps: string[] }}  `gaps` names duties nobody could fill.
 */
export function generateDuty({ exam, teachers, students, leaves = [], perRoom = 1 }) {
  const duty = [];
  const load = new Map(teachers.map((t) => [t.id, 0]));
  const busyAt = (t, paper) => duty.some((d) => d.staffId === t.id && overlap(d, paper));
  const onLeave = (t, date) => leaves.some((l) => l.status === "approved" && l.staffId === t.id && l.startDate <= date && l.endDate >= date);
  const gaps = [];

  sortPapers(exam.papers || []).forEach((paper) => {
    roomsForPaper(exam, paper, students).forEach((room) => {
      for (let n = 0; n < perRoom; n += 1) {
        const free = teachers.filter((t) => t.status !== "disabled" && !onLeave(t, paper.date) && !busyAt(t, paper));
        const neutral = free.filter((t) => !(t.assignedSubjects || []).includes(paper.subject));
        const pool = neutral.length ? neutral : free;
        const pick = [...pool].sort((a, b) => load.get(a.id) - load.get(b.id) || (a.name || "").localeCompare(b.name || ""))[0];
        if (!pick) { gaps.push(`${paper.className} ${paper.subject}, ${room.name}, ${fmtDate(paper.date)}`); continue; }
        load.set(pick.id, load.get(pick.id) + 1);
        duty.push({
          id: newId(), paperId: paper.id, roomId: room.id, roomName: room.name,
          date: paper.date, start: paper.start, end: paper.end,
          subject: paper.subject, className: paper.className,
          staffId: pick.id, staffName: pick.name || "",
        });
      }
    });
  });

  return { duty, gaps };
}

/** Would giving this duty to `staffId` put them in two places at once? */
export function dutyConflict(duty, candidate, staffId) {
  return duty.find((d) => d.id !== candidate.id && d.staffId === staffId && overlap(d, candidate)) || null;
}

/** One line per duty, for the message that tells a teacher what they are doing. */
export function dutyLines(exam, staffId) {
  return (exam.duty || [])
    .filter((d) => d.staffId === staffId)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
    .map((d) => `${fmtDate(d.date)} ${d.start}-${d.end}: ${d.className} ${d.subject}, ${d.roomName}`)
    .join("\n");
}

// ─── Results analysis ────────────────────────────────────────────────────────
/**
 * How each subject did, from students' merged scores (see mergeMarks).
 * `rows` is buildReadiness()'s output: each carries `subjects: { name: { score } }`.
 */
export function analyseSubjects(rows) {
  const by = new Map();
  rows.forEach((row) => {
    Object.entries(row.subjects || {}).forEach(([subject, v]) => {
      if (!by.has(subject)) by.set(subject, []);
      by.get(subject).push({ id: row.id, name: nameOf(row), className: row.className, score: v.score });
    });
  });

  return [...by.entries()].map(([subject, list]) => {
    const scores = list.map((x) => x.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const dist = Object.fromEntries(MANEB.map((g) => [g.grade, 0]));
    list.forEach((x) => { dist[gradeFor(x.score).grade] += 1; });
    const sorted = [...list].sort((a, b) => b.score - a.score);
    return {
      subject,
      entered: list.length,
      mean: Math.round(mean * 10) / 10,
      high: Math.max(...scores),
      low: Math.min(...scores),
      creditRate: Math.round((list.filter((x) => isCredit(x.score)).length / list.length) * 100),
      passRate: Math.round((list.filter((x) => gradeFor(x.score).grade <= 8).length / list.length) * 100),
      dist,
      top: sorted.slice(0, 3),
      bottom: sorted.slice(-3).reverse(),
    };
  }).sort((a, b) => b.mean - a.mean);
}

/** Per class: candidates with marks, mean of their subject scores, credit-rate. */
export function analyseClasses(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const scores = Object.values(r.subjects || {}).map((v) => v.score);
    if (!scores.length) return;
    if (!by.has(r.className)) by.set(r.className, []);
    by.get(r.className).push({ mean: scores.reduce((a, b) => a + b, 0) / scores.length, onTrack: r.band === "onTrack" });
  });
  return [...by.entries()].map(([className, list]) => ({
    className,
    learners: list.length,
    mean: Math.round((list.reduce((a, b) => a + b.mean, 0) / list.length) * 10) / 10,
    onTrack: list.filter((x) => x.onTrack).length,
  })).sort((a, b) => b.mean - a.mean);
}
