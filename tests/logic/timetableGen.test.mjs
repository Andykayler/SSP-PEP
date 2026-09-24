// The timetable generator: never a clash, loads respected, gaps reported.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTimetable, fitLoad, defaultLoad } from "../../src/services/timetableGenCore.js";
import { findClashes } from "../../src/services/timetableClash.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PERIODS = Array.from({ length: 8 }, (_, i) => ({ number: i + 1, start: `0${i}:00`, end: `0${i}:50` }));

const classes = [
  { id: "f1", name: "Form 1" },
  { id: "f2", name: "Form 2" },
];
const teachers = [
  { id: "t1", name: "Banda", assignedClasses: ["Form 1", "Form 2"], assignedSubjects: ["Mathematics"] },
  { id: "t2", name: "Phiri", assignedClasses: ["Form 1", "Form 2"], assignedSubjects: ["English", "Chichewa"] },
];
const loads = {
  f1: { Mathematics: 6, English: 6, Chichewa: 4 },
  f2: { Mathematics: 6, English: 6, Chichewa: 4 },
};

describe("generateTimetable", () => {
  it("places every lesson without a teacher or class clash", () => {
    const { slots, unplaced } = generateTimetable({ classes, teachers, loads, days: DAYS, periods: PERIODS });
    assert.equal(unplaced.length, 0);
    assert.equal(slots.length, 32);
    assert.equal(findClashes(slots).length, 0);
    const cells = new Set(slots.map((s) => `${s.classId}|${s.day}|${s.periodNumber}`));
    assert.equal(cells.size, slots.length, "a class is never double-booked");
  });

  it("gives each subject its weekly count and spreads it over the week", () => {
    const { slots } = generateTimetable({ classes, teachers, loads, days: DAYS, periods: PERIODS });
    const maths = slots.filter((s) => s.classId === "f1" && s.subject === "Mathematics");
    assert.equal(maths.length, 6);
    assert.equal(new Set(maths.map((s) => s.day)).size, 5, "one a day before any doubles");
  });

  it("works around lessons that are kept", () => {
    const keep = [{ classId: "f3", day: "Monday", periodNumber: 1, teacherId: "t1" }];
    const { slots } = generateTimetable({ classes, teachers, loads, days: DAYS, periods: PERIODS, keep });
    assert.equal(findClashes([...keep, ...slots]).length, 0);
  });

  it("reports subjects nobody is assigned to teach", () => {
    const { noTeacher } = generateTimetable({
      classes: [{ id: "f1", name: "Form 1" }], teachers, loads: { f1: { Biology: 3 } }, days: DAYS, periods: PERIODS,
    });
    assert.deepEqual(noTeacher, [{ className: "Form 1", subject: "Biology" }]);
  });

  it("reports what can't fit when one teacher is overbooked", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));
    const t = [{ id: "t", name: "Solo", assignedClasses: many.map((c) => c.name), assignedSubjects: ["Mathematics"] }];
    const l = Object.fromEntries(many.map((c) => [c.id, { Mathematics: 8 }]));
    const { slots, unplaced } = generateTimetable({ classes: many, teachers: t, loads: l, days: DAYS, periods: PERIODS });
    assert.equal(slots.length, 40);
    assert.equal(unplaced.reduce((a, u) => a + u.count, 0), 8);
    assert.equal(findClashes(slots).length, 0);
  });
});

describe("fitLoad / defaultLoad", () => {
  it("trims the biggest subjects first to fit the week, never below one", () => {
    assert.deepEqual(fitLoad({ A: 10, B: 2, C: 1 }, 6), { A: 3, B: 2, C: 1 });
    assert.deepEqual(fitLoad({ A: 1, B: 1 }, 1), { A: 1, B: 1 });
  });
  it("weights core subjects heavier", () => {
    assert.ok(defaultLoad("Mathematics") > defaultLoad("Biology"));
    assert.ok(defaultLoad("Biology") > defaultLoad("Bible Knowledge"));
  });
});
