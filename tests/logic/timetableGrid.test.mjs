// A school's Excel timetable (grid: classes down, periods across) → lessons.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTimetableGrids, resolveSubject } from "../../src/services/timetableGridCore.js";
import { planTimetableImport } from "../../src/services/timetableImportCore.js";

const subjects = ["Mathematics", "English", "Chichewa", "Bible Knowledge", "Life Skills", "Expressive Arts", "Agriculture", "Computer Studies", "Spelling", "Social and Environmental Sciences"];
const classes = ["Year 1", "Year 2A", "Year 2B"].map((name, i) => ({ id: `c${i}`, name, subjects }));
const days = ["Monday", "Tuesday"];
const periods = [1, 2, 3, 4].map((number) => ({ number, start: "07:00", end: "07:40" }));

const grid = [
  ["Day", "Class", 0.3, 0.31, 0.32, 0.33, 0.34, 0.35],
  [null, null, 0.31, 0.32, 0.33, 0.34, 0.35, 0.36],
  ["Monday", "Year 1", "Arithmet", "Englsh", "B", "B/K", "Sports", null, null, "Total", 30],
  [null, "Year 2", "Maths", "English", null, "L/S", "Agricult"],
  [null, "Year 2", "English", "Maths", null, "E/Arts", "SES"],
  ["Tuesday", "Year 1", "Chichewa", "Computer", "R", "Spellings", ""],
  [],
  ["Note: Year 1 and 2 presentation biweekly"],
];

test("resolves shorthand and typos to the class's own subjects", () => {
  assert.equal(resolveSubject("Arithmet", subjects), "Mathematics");
  assert.equal(resolveSubject("Maths", subjects), "Mathematics");
  assert.equal(resolveSubject("B/K", subjects), "Bible Knowledge");
  assert.equal(resolveSubject("L/Skills", subjects), "Life Skills");
  assert.equal(resolveSubject("E/Arts", subjects), "Expressive Arts");
  assert.equal(resolveSubject("SES", subjects), "Social and Environmental Sciences");
  assert.equal(resolveSubject("Englsh", subjects), "English");
  assert.equal(resolveSubject("Spellings", subjects), "Spelling");
  assert.equal(resolveSubject("Routine", subjects), null);
});

test("reads the grid: skips break columns, carries the day, splits repeated classes", () => {
  const r = parseTimetableGrids([{ sheet: "Year 1-2", data: grid }], { classes });
  const lesson = (cls, day, p) => r.rows.find((x) => x.class === cls && x.day === day && x.period === String(p))?.subject;
  assert.equal(lesson("Year 1", "Monday", 1), "Mathematics");
  assert.equal(lesson("Year 1", "Monday", 3), "Bible Knowledge"); // break column "B" skipped
  assert.equal(lesson("Year 2A", "Monday", 1), "Mathematics");
  assert.equal(lesson("Year 2B", "Monday", 1), "English");
  assert.equal(lesson("Year 2B", "Monday", 4), "Social and Environmental Sciences");
  assert.equal(lesson("Year 1", "Tuesday", 3), "Spelling");
  assert.deepEqual(r.unmatched.map((u) => u.label), ["Sports"]);
  assert.equal(r.rows.some((x) => x.subject === "Total"), false); // totals beside the grid ignored
  assert.deepEqual(r.problems, []);
});

test("a chosen subject, or a skip, replaces an unmatched label", () => {
  const mapped = parseTimetableGrids([{ data: grid }], { classes, subjectMap: { sports: "Life Skills" } });
  assert.equal(mapped.unmatched.length, 0);
  assert.equal(mapped.rows.find((x) => x.class === "Year 1" && x.period === "4").subject, "Life Skills");
  const skipped = parseTimetableGrids([{ data: grid }], { classes, subjectMap: { sports: "" } });
  assert.equal(skipped.unmatched.length, 0);
  assert.equal(skipped.rows.some((x) => x.class === "Year 1" && x.day === "Monday" && x.period === "4"), false);
});

test("the rows go through the normal import plan", () => {
  const { rows } = parseTimetableGrids([{ data: grid }], { classes, subjectMap: { sports: "" } });
  const plan = planTimetableImport({ rows, classes, staff: [], days, periods, existingSlots: [], strict: false });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.slots.length, rows.length);
});

test("a repeated class the school has only once is reported, not guessed", () => {
  const r = parseTimetableGrids([{ data: grid }], { classes: classes.filter((c) => c.name !== "Year 2B") });
  assert.ok(r.problems.some((p) => p.includes("Year 2")));
});

test("a sheet with no Class heading is not a timetable", () => {
  assert.equal(parseTimetableGrids([{ data: [["a", "b"], [1, 2]] }], { classes }).sheetsRead, 0);
});
