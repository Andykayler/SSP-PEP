// tests/logic/logic.test.mjs
// ─────────────────────────────────────────────────────────────────────────────
// The rules of the new features, pinned. These are the pure modules — no
// Firebase, no network — so they run in milliseconds:
//
//     npm run test:logic
//
// What is tested is the thing most likely to be quietly wrong: who gets locked
// out and when, whether a clash is caught, whether a teacher can be put in two
// places, whether seating fits everyone and mixes classes.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { schoolAccess, trialEndFrom, paidThroughAfter, TRIAL_DAYS } from "../../src/services/subscriptionState.js";
import { findClashes, conflictsFor } from "../../src/services/timetableClash.js";
import { schoolDaysBetween, workingDays, lessonsAffected, suggestCover, subId } from "../../src/services/leaveCore.js";
import {
  generateSeating, generateDuty, roomLists, paperProblems, dutyConflict, analyseSubjects,
} from "../../src/services/examsCore.js";
import { tpl } from "../../src/services/messageTemplates.js";
import { cleanPhone } from "../../functions/whatsapp.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-21T09:00:00Z");

// ═════════════════════════════════════════════════════════════════════════════
describe("subscription state — who may use the platform", () => {
  it("a school with no status is legacy: full access, no expiry", () => {
    const a = schoolAccess({ name: "Old School" }, NOW);
    assert.equal(a.state, "legacy");
    assert.equal(a.blocked, false);
    assert.equal(a.restricted, false);
  });

  it("an unloaded school never locks anyone out", () => {
    assert.equal(schoolAccess(null, NOW).blocked, false);
    assert.equal(schoolAccess(undefined, NOW).restricted, false);
  });

  it("pending, rejected and suspended schools are blocked, with the reason shown", () => {
    assert.equal(schoolAccess({ status: "pending" }, NOW).blocked, true);
    const rejected = schoolAccess({ status: "rejected", rejectedReason: "Duplicate registration" }, NOW);
    assert.equal(rejected.blocked, true);
    assert.match(rejected.message, /Duplicate registration/);
    assert.equal(schoolAccess({ status: "suspended", suspendedReason: "Unpaid" }, NOW).blocked, true);
  });

  it("a trial runs, warns in its last week, gets a grace period, then restricts", () => {
    const trial = (endsInDays) => schoolAccess(
      { status: "active", subscription_status: "trial", trialEndsAt: NOW + endsInDays * DAY }, NOW);

    assert.equal(trial(20).state, "trial");
    assert.equal(trial(20).warn, false);

    assert.equal(trial(5).state, "trial");
    assert.equal(trial(5).warn, true);

    const grace = trial(-3);
    assert.equal(grace.state, "trial_grace");
    assert.equal(grace.blocked, false);       // still working during grace
    assert.equal(grace.warn, true);

    const expired = trial(-10);
    assert.equal(expired.state, "trial_expired");
    assert.equal(expired.restricted, true);
    assert.equal(expired.blocked, false);     // billing stays reachable
  });

  it("a paid school lapses only after paidThrough plus the grace period", () => {
    const paid = (paidThroughInDays) => schoolAccess(
      { status: "active", subscription_status: "active", paidThrough: NOW + paidThroughInDays * DAY }, NOW);

    assert.equal(paid(60).state, "active");
    assert.equal(paid(60).warn, false);
    assert.equal(paid(10).warn, true);                       // renewing soon
    assert.equal(paid(-5).state, "past_due_grace");
    assert.equal(paid(-30).state, "past_due");
    assert.equal(paid(-30).restricted, true);
  });

  it("a school paid before dates were tracked is simply active", () => {
    assert.equal(schoolAccess({ status: "active", subscription_status: "active" }, NOW).state, "active");
  });

  it("approval starts a trial of the stated length", () => {
    assert.equal(trialEndFrom(NOW), NOW + TRIAL_DAYS * DAY);
    assert.equal(trialEndFrom(NOW, 45), NOW + 45 * DAY);
  });

  it("paying early extends from the current end rather than restarting the clock", () => {
    const early = paidThroughAfter("termly", NOW + 30 * DAY, NOW);
    assert.equal(early, NOW + 30 * DAY + 120 * DAY);
    const lapsed = paidThroughAfter("termly", NOW - 40 * DAY, NOW);
    assert.equal(lapsed, NOW + 120 * DAY);               // starts from now, not the past
    assert.equal(paidThroughAfter("annual", null, NOW), NOW + 365 * DAY);
  });

  it("reads Firestore-style timestamps", () => {
    const ts = { toMillis: () => NOW + 3 * DAY };
    assert.equal(schoolAccess({ status: "active", subscription_status: "trial", trialEndsAt: ts }, NOW).daysLeft, 3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("timetable clashes", () => {
  const slot = (o) => ({ day: "Monday", periodNumber: 3, ...o });

  it("finds a teacher booked in two classes at once", () => {
    const clashes = findClashes([
      slot({ classId: "a", className: "Form 2A", teacherId: "t1", teacherName: "Mr Banda", subject: "Maths" }),
      slot({ classId: "b", className: "Form 3B", teacherId: "t1", teacherName: "Mr Banda", subject: "Maths" }),
      slot({ classId: "c", className: "Form 1A", teacherId: "t2", teacherName: "Ms Phiri", subject: "English" }),
    ]);
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0].type, "teacher");
    assert.equal(clashes[0].who, "Mr Banda");
  });

  it("finds two classes in one venue, but not the same class twice", () => {
    const venue = findClashes([
      slot({ classId: "a", className: "Form 2A", teacherId: "t1", venue: "Lab" }),
      slot({ classId: "b", className: "Form 3B", teacherId: "t2", venue: "lab " }),
    ]);
    assert.equal(venue.length, 1);
    assert.equal(venue[0].type, "venue");
  });

  it("different periods or days are not clashes", () => {
    assert.equal(findClashes([
      slot({ classId: "a", teacherId: "t1" }),
      slot({ classId: "b", teacherId: "t1", periodNumber: 4 }),
      slot({ classId: "c", teacherId: "t1", day: "Tuesday" }),
    ]).length, 0);
  });

  it("refuses a booking that collides, but lets a slot be replaced in place", () => {
    const existing = [
      slot({ classId: "a", className: "Form 2A", teacherId: "t1", teacherName: "Mr Banda", subject: "Maths" }),
    ];
    // Another class, same teacher, same time: conflict.
    assert.equal(conflictsFor(existing, { classId: "b", day: "Monday", periodNumber: 3, teacherId: "t1" }).length, 1);
    // Re-saving the same class's own slot is not a conflict with itself.
    assert.equal(conflictsFor(existing, { classId: "a", day: "Monday", periodNumber: 3, teacherId: "t1" }).length, 0);
    // Different teacher: fine.
    assert.equal(conflictsFor(existing, { classId: "b", day: "Monday", periodNumber: 3, teacherId: "t9" }).length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("leave and cover", () => {
  it("counts school days only, inclusive, skipping weekends", () => {
    // Mon 21 Sep 2026 .. Sun 27 Sep 2026
    assert.equal(workingDays("2026-09-21", "2026-09-27"), 5);
    assert.equal(workingDays("2026-09-21", "2026-09-21"), 1);
    assert.equal(workingDays("2026-09-26", "2026-09-27"), 0);     // a weekend
    assert.equal(workingDays("2026-09-25", "2026-09-22"), 0);     // backwards
    assert.deepEqual(schoolDaysBetween("2026-09-25", "2026-09-28"), ["2026-09-25", "2026-09-28"]);
  });

  const timetable = [
    { day: "Monday", periodNumber: 1, classId: "a", className: "Form 2A", subject: "Maths", teacherId: "t1", startTime: "07:30" },
    { day: "Monday", periodNumber: 2, classId: "b", className: "Form 3B", subject: "Maths", teacherId: "t1", startTime: "08:30" },
    { day: "Tuesday", periodNumber: 1, classId: "a", className: "Form 2A", subject: "Maths", teacherId: "t1", startTime: "07:30" },
    // Others teaching at the same time as t1's Monday P1:
    { day: "Monday", periodNumber: 1, classId: "c", className: "Form 1A", subject: "English", teacherId: "t2" },
  ];
  const leave = { id: "L1", staffId: "t1", staffName: "Mr Banda", startDate: "2026-09-21", endDate: "2026-09-22", status: "approved" };

  it("lists exactly the lessons the absent teacher would have taken", () => {
    const lessons = lessonsAffected(leave, timetable);
    assert.equal(lessons.length, 3);                        // Mon P1, Mon P2, Tue P1
    assert.deepEqual(lessons.map((l) => `${l.date} P${l.periodNumber}`),
      ["2026-09-21 P1", "2026-09-21 P2", "2026-09-22 P1"]);
  });

  const teachers = [
    { id: "t1", name: "Mr Banda", assignedSubjects: ["Maths"], assignedClasses: ["Form 2A", "Form 3B"] },
    { id: "t2", name: "Ms Phiri", assignedSubjects: ["English"], assignedClasses: ["Form 1A"] },
    { id: "t3", name: "Mr Chirwa", assignedSubjects: ["Maths"], assignedClasses: ["Form 1A"] },
    { id: "t4", name: "Ms Kachale", assignedSubjects: ["Biology"], assignedClasses: [] },
  ];

  it("never suggests someone who is busy, absent, or the person being covered", () => {
    const lesson = lessonsAffected(leave, timetable)[0];       // Monday P1
    const ids = suggestCover({ lesson, teachers, timetable, substitutions: [], leaves: [] }).map((t) => t.id);
    assert.ok(!ids.includes("t1"), "not the absent teacher");
    assert.ok(!ids.includes("t2"), "t2 is teaching Form 1A in that period");
    assert.deepEqual(ids, ["t3", "t4"]);

    const withLeave = suggestCover({
      lesson, teachers, timetable, substitutions: [],
      leaves: [{ status: "approved", staffId: "t3", startDate: "2026-09-21", endDate: "2026-09-21" }],
    }).map((t) => t.id);
    assert.deepEqual(withLeave, ["t4"], "t3 is on leave that day");
  });

  it("ranks a teacher of the subject first, and spreads the load", () => {
    const lesson = lessonsAffected(leave, timetable)[1];       // Monday P2 (t2 is free now)
    const order = suggestCover({ lesson, teachers, timetable, substitutions: [], leaves: [] }).map((t) => t.id);
    assert.equal(order[0], "t3", "the other Maths teacher comes first");

    // If t3 already covered twice this week, a same-score alternative would win; here subject still wins.
    const busyT3 = [
      { substituteId: "t3", date: "2026-09-21", periodNumber: 5, status: "confirmed" },
      { substituteId: "t3", date: "2026-09-22", periodNumber: 5, status: "confirmed" },
    ];
    const order2 = suggestCover({ lesson, teachers, timetable, substitutions: busyT3, leaves: [] }).map((t) => t.id);
    assert.equal(order2[0], "t3");
  });

  it("does not offer someone already covering another class at that time", () => {
    const lesson = lessonsAffected(leave, timetable)[0];
    const subs = [{ substituteId: "t3", date: lesson.date, periodNumber: lesson.periodNumber, status: "assigned" }];
    const ids = suggestCover({ lesson, teachers, timetable, substitutions: subs, leaves: [] }).map((t) => t.id);
    assert.ok(!ids.includes("t3"));
  });

  it("gives one stable id per lesson per date, so assigning twice replaces", () => {
    const l = lessonsAffected(leave, timetable)[0];
    assert.equal(subId("SCH", l), subId("SCH", l));
    assert.notEqual(subId("SCH", l), subId("SCH", lessonsAffected(leave, timetable)[1]));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("exam seating", () => {
  const mk = (cls, n) => Array.from({ length: n }, (_, i) => ({ id: `${cls}-${i}`, fullName: `${cls} Learner ${String(i).padStart(2, "0")}`, className: cls }));
  const students = [...mk("Form 3A", 6), ...mk("Form 3B", 6), ...mk("Form 4A", 4)];

  it("seats every candidate exactly once, within room capacity", () => {
    const rooms = [{ id: "r1", name: "Hall", capacity: 10 }, { id: "r2", name: "Room 2", capacity: 10 }];
    const { seating, unplaced, candidates } = generateSeating({ students, classNames: ["Form 3A", "Form 3B", "Form 4A"], rooms });
    assert.equal(candidates, 16);
    assert.equal(unplaced.length, 0);
    assert.equal(Object.keys(seating).length, 16);

    const perRoom = {};
    Object.values(seating).forEach((s) => { perRoom[s.roomId] = (perRoom[s.roomId] || 0) + 1; });
    assert.ok(perRoom.r1 <= 10 && perRoom.r2 <= 10);

    // No two candidates share a room and seat.
    const spots = Object.values(seating).map((s) => `${s.roomId}#${s.seat}`);
    assert.equal(new Set(spots).size, spots.length);
  });

  it("reports the candidates who do not fit, instead of dropping them silently", () => {
    const { unplaced, seating } = generateSeating({
      students, classNames: ["Form 3A", "Form 3B", "Form 4A"], rooms: [{ id: "r1", name: "Small", capacity: 5 }],
    });
    assert.equal(Object.keys(seating).length, 5);
    assert.equal(unplaced.length, 11);
  });

  it("mixes classes so a candidate's neighbour is usually from another class", () => {
    const { seating } = generateSeating({ students, classNames: ["Form 3A", "Form 3B"], rooms: [{ id: "r1", name: "Hall", capacity: 20 }] });
    const bySeat = Object.entries(seating).sort((a, b) => a[1].seat - b[1].seat).map(([id]) => students.find((s) => s.id === id).className);
    let sameNeighbours = 0;
    for (let i = 1; i < bySeat.length; i += 1) if (bySeat[i] === bySeat[i - 1]) sameNeighbours += 1;
    assert.equal(sameNeighbours, 0, "alternating classes");
  });

  it("gives stable, unique, alphabetical candidate numbers", () => {
    const rooms = [{ id: "r1", name: "Hall", capacity: 40 }];
    const a = generateSeating({ students, classNames: ["Form 3A", "Form 3B", "Form 4A"], rooms, prefix: "ABC" });
    const b = generateSeating({ students, classNames: ["Form 3A", "Form 3B", "Form 4A"], rooms: [{ id: "x", name: "Other", capacity: 3 }, ...rooms], prefix: "ABC" });
    const nums = Object.values(a.seating).map((s) => s.candidateNo);
    assert.equal(new Set(nums).size, nums.length);
    assert.match(nums[0], /^ABC\d{4}$/);
    // Regenerating with different rooms must not renumber anyone.
    for (const [id, v] of Object.entries(b.seating)) assert.equal(v.candidateNo, a.seating[id].candidateNo);
  });

  it("leaves out withdrawn learners", () => {
    const withdrawn = [{ id: "w", fullName: "Gone", className: "Form 3A", status: "withdrawn" }, ...students];
    const { candidates } = generateSeating({ students: withdrawn, classNames: ["Form 3A"], rooms: [{ id: "r", name: "R", capacity: 50 }] });
    assert.equal(candidates, 6);
  });

  it("lists each room's candidates in seat order", () => {
    const rooms = [{ id: "r1", name: "Hall", capacity: 8 }, { id: "r2", name: "Room 2", capacity: 8 }];
    const { seating } = generateSeating({ students, classNames: ["Form 3A", "Form 3B"], rooms });
    const lists = roomLists({ rooms, seating }, students);
    assert.equal(lists.length, 2);
    lists.forEach(({ learners }) => {
      const seats = learners.map((l) => l.seat);
      assert.deepEqual(seats, [...seats].sort((a, b) => a - b));
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("exam papers and invigilation", () => {
  it("flags a class sitting two papers at once, and three in a day", () => {
    const probs = paperProblems([
      { id: "1", className: "Form 4A", subject: "Maths", date: "2026-10-05", start: "08:00", end: "10:00" },
      { id: "2", className: "Form 4A", subject: "English", date: "2026-10-05", start: "09:30", end: "11:00" },
    ]);
    assert.ok(probs.some((p) => p.level === "error" && /same time/.test(p.message)));

    const heavy = paperProblems(["08:00", "10:30", "13:00"].map((s, i) => ({ id: String(i), className: "Form 4A", subject: `S${i}`, date: "2026-10-06", start: s, end: `${String(Number(s.slice(0, 2)) + 2).padStart(2, "0")}:00` })));
    assert.ok(heavy.some((p) => p.level === "warning"));

    assert.equal(paperProblems([
      { id: "1", className: "Form 4A", subject: "Maths", date: "2026-10-05", start: "08:00", end: "10:00" },
      { id: "2", className: "Form 4B", subject: "Maths", date: "2026-10-05", start: "08:00", end: "10:00" },
    ]).length, 0, "different classes may sit together");
  });

  const students = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, fullName: `A ${i}`, className: "Form 4A" })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, fullName: `B ${i}`, className: "Form 4B" })),
  ];
  const rooms = [{ id: "r1", name: "Hall", capacity: 6 }, { id: "r2", name: "Room 2", capacity: 6 }];
  const { seating } = generateSeating({ students, classNames: ["Form 4A", "Form 4B"], rooms });
  const teachers = [
    { id: "m", name: "Maths Teacher", assignedSubjects: ["Mathematics"] },
    { id: "e", name: "English Teacher", assignedSubjects: ["English"] },
    { id: "b", name: "Bio Teacher", assignedSubjects: ["Biology"] },
    { id: "g", name: "Geo Teacher", assignedSubjects: ["Geography"] },
  ];
  const exam = {
    rooms, seating,
    papers: [
      { id: "p1", className: "Form 4A", subject: "Mathematics", date: "2026-10-05", start: "08:00", end: "10:00" },
      { id: "p2", className: "Form 4B", subject: "English", date: "2026-10-05", start: "08:00", end: "10:00" },
    ],
  };

  it("puts an invigilator in every room with candidates, never in two places, never on their own subject", () => {
    const { duty, gaps } = generateDuty({ exam, teachers, students, perRoom: 1 });
    assert.equal(gaps.length, 0);
    assert.ok(duty.length >= 2);

    duty.forEach((d) => {
      const t = teachers.find((x) => x.id === d.staffId);
      assert.ok(!(t.assignedSubjects || []).includes(d.subject), `${t.name} would invigilate their own subject`);
      assert.equal(dutyConflict(duty, d, d.staffId), null, `${t.name} is double-booked`);
    });
  });

  it("skips a teacher who is on approved leave that day", () => {
    const { duty } = generateDuty({
      exam, teachers, students, perRoom: 1,
      leaves: [{ status: "approved", staffId: "b", startDate: "2026-10-05", endDate: "2026-10-05" }],
    });
    assert.ok(!duty.some((d) => d.staffId === "b"));
  });

  it("names the duties it could not fill instead of hiding them", () => {
    const { gaps } = generateDuty({ exam, teachers: [teachers[0]], students, perRoom: 2 });
    assert.ok(gaps.length > 0);
  });

  it("shares the load rather than piling onto one teacher", () => {
    const many = { ...exam, papers: [
      { id: "p1", className: "Form 4A", subject: "Mathematics", date: "2026-10-05", start: "08:00", end: "10:00" },
      { id: "p2", className: "Form 4A", subject: "Mathematics", date: "2026-10-06", start: "08:00", end: "10:00" },
      { id: "p3", className: "Form 4A", subject: "Mathematics", date: "2026-10-07", start: "08:00", end: "10:00" },
    ] };
    const { duty } = generateDuty({ exam: many, teachers: teachers.slice(1), students, perRoom: 1 });
    const counts = {};
    duty.forEach((d) => { counts[d.staffId] = (counts[d.staffId] || 0) + 1; });
    const max = Math.max(...Object.values(counts));
    const min = Math.min(...teachers.slice(1).map((t) => counts[t.id] || 0));
    assert.ok(max - min <= 2, `uneven load: ${JSON.stringify(counts)}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("exam analysis", () => {
  const rows = [
    { id: "1", fullName: "One", className: "Form 4A", subjects: { English: { score: 82 }, Maths: { score: 38 } } },
    { id: "2", fullName: "Two", className: "Form 4A", subjects: { English: { score: 55 }, Maths: { score: 71 } } },
    { id: "3", fullName: "Three", className: "Form 4A", subjects: { English: { score: 42 }, Maths: { score: 66 } } },
  ];
  it("works out mean, credit and pass rates and the grade spread", () => {
    const a = analyseSubjects(rows);
    const english = a.find((s) => s.subject === "English");
    assert.equal(english.entered, 3);
    assert.equal(english.mean, 59.7);
    assert.equal(english.creditRate, 67);          // 82 and 55 are credits (G1..G6), 42 is a pass
    assert.equal(english.passRate, 100);
    assert.equal(english.dist[1], 1);              // 82 -> G1
    assert.equal(english.dist[8], 1);              // 42 -> G8 (the 40-44 band)
    assert.equal(english.top[0].score, 82);
    const maths = a.find((s) => s.subject === "Maths");
    assert.equal(maths.passRate, 67);               // 38 fails
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("guardian message templates", () => {
  const child = { id: "s1", fullName: "Chikondi Mwale" };

  it("writes an absence alert in both languages, naming the child", () => {
    const m = tpl.attendance(child, "Absent", "Form 3A", "Mon 21 Sep");
    assert.match(m.title, /Chikondi Mwale was marked absent/);
    assert.match(m.titleNy, /Chikondi Mwale sanabwere/);
    assert.ok(m.bodyNy.length > 0);
  });

  it("distinguishes late from absent in Chichewa", () => {
    assert.match(tpl.attendance(child, "Late", "Form 3A", "Mon").titleNy, /anachedwa/);
  });

  it("includes the amount and balance in a payment receipt", () => {
    const m = tpl.payment(child, { amount: 50000, method: "Cash", receiptNumber: "R-1", balance: 25000 });
    assert.match(m.title, /50,000/);
    assert.match(m.body, /Balance MK 25,000/);
    assert.match(m.bodyNy, /25,000/);
  });

  it("produces every language for every event a school sends", () => {
    const out = [
      tpl.marks({ subject: "Biology", assessment: "CA1", className: "Form 3A", term: "Term 1" }),
      tpl.homework({ subject: "Maths", title: "Ex 4", dueLabel: "Thu" }),
      tpl.discipline(child, { offense: "Late", action: "Warning" }),
      tpl.report(child, { term: "Term 2" }),
      tpl.examTimetable(child, { examName: "Mock", firstDate: "5 Oct", papers: "Maths 5 Oct" }),
      tpl.transportDelay(child, { route: "Route 1", minutes: 20 }),
      tpl.sickbay(child, { complaint: "Headache", sentHome: true }),
      tpl.libraryOverdue(child, { title: "Biology Form 3", days: 3 }),
      tpl.atRisk(child, { reasons: "Absent often." }),
      tpl.payPrompt(child, { balance: 45000 }),
    ];
    out.forEach((m) => {
      assert.ok(m.title && m.body && m.titleNy && m.bodyNy, JSON.stringify(m));
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("WhatsApp phone numbers", () => {
  it("normalises the ways Malawians write a number", () => {
    assert.equal(cleanPhone("0991234567"), "+265991234567");
    assert.equal(cleanPhone("991234567"), "+265991234567");
    assert.equal(cleanPhone("+265 991 234 567"), "+265991234567");
    assert.equal(cleanPhone("265-99-123-4567"), "+265991234567");
    assert.equal(cleanPhone("(0881) 234 567"), "+265881234567");
  });
  it("keeps foreign numbers and rejects rubbish", () => {
    assert.equal(cleanPhone("+260971234567"), "+260971234567");
    assert.equal(cleanPhone(""), "");
    assert.equal(cleanPhone("abc"), "");
    assert.equal(cleanPhone("123"), "");
    assert.equal(cleanPhone(null), "");
  });
});
