// Term-driven billing, the fee gate on results, and one child's results from
// the class mark sheets.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planEnrolInTerm, enrolableTerms, planUnbillTerm, planTermFees, planOptionalFees, structuresForTerm, termFeeId, yearOfTerm } from "../../src/services/termFeesCore.js";
import { resultsAccess, releaseActive, withheldMessage } from "../../src/services/resultsAccessCore.js";
import { childResults } from "../../src/services/resultsCore.js";
import { termPosition } from "../../src/services/feeAllocationCore.js";

const TERM = "Term 2 2026";
const S = "SCH";

describe("structuresForTerm", () => {
  const lines = [
    { id: "new", term: "Term 2 2026", classId: "c1" },
    { id: "old-short", term: "Term 2", academicYear: "2025/2026", classId: "c1" },
    { id: "other-year", term: "Term 2", academicYear: "2024/2025", classId: "c1" },
    { id: "next-term", term: "Term 3 2026", classId: "c1" },
    { id: "full-year", term: "Full Year", academicYear: "2025/2026", classId: "c1" },
  ];
  it("keeps this term's lines, new and old spelling, and nothing else", () => {
    assert.deepEqual(structuresForTerm(lines, TERM).map((l) => l.id), ["new", "old-short"]);
  });
  it("bills Full Year lines in Term 1", () => {
    assert.deepEqual(structuresForTerm(lines, "Term 1 2026").map((l) => l.id), ["full-year"]);
  });
  it("derives the academic year the way the rest of the product does", () => {
    assert.equal(yearOfTerm(TERM), "2025/2026");
  });
});

describe("planTermFees", () => {
  const structures = [
    { id: "tuition1", term: TERM, classId: "c1", name: "Tuition", amount: 100 },
    { id: "exam1", term: TERM, classId: "c1", name: "Exam", amount: 20 },
    { id: "tuition2", term: TERM, classId: "c2", name: "Tuition", amount: 120 },
  ];
  const students = [
    { id: "a", classId: "c1", fullName: "A" },
    { id: "b", classId: "c2", fullName: "B" },
    { id: "left", classId: "c1", status: "withdrawn" },
    { id: "noclass" },
  ];

  it("bills every active student from their own class, and only them", () => {
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments: [] });
    assert.deepEqual(plan.create.map((c) => c.id).sort(), [
      termFeeId(S, "a", "exam1", TERM), termFeeId(S, "a", "tuition1", TERM), termFeeId(S, "b", "tuition2", TERM),
    ].sort());
    const one = plan.create.find((c) => c.data.studentId === "b").data;
    assert.equal(one.amount, 120);
    assert.equal(one.term, TERM);
    assert.equal(one.academicYear, "2025/2026");
    assert.equal(one.auto, true);
  });

  it("is idempotent — already billed means nothing to do", () => {
    const first = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments: [] });
    const assignments = first.create.map((c) => ({ id: c.id, ...c.data }));
    const again = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments });
    assert.deepEqual(again, { create: [], update: [], remove: [] });
  });

  it("does not double-bill a fee the bursar assigned by hand", () => {
    const manual = [{ id: "m1", studentId: "a", feeStructureId: "tuition1", term: "Term 2", amount: 100 }];
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments: manual });
    assert.equal(plan.create.some((c) => c.data.studentId === "a" && c.data.feeStructureId === "tuition1"), false);
  });

  it("follows a corrected fee on automatic charges", () => {
    const assignments = [{ id: "x", studentId: "a", feeStructureId: "tuition1", term: TERM, amount: 90, feeName: "Tuition", auto: true }];
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments });
    assert.deepEqual(plan.update, [{ id: "x", data: { amount: 100, feeName: "Tuition", category: "" } }]);
  });

  it("removes automatic charges for a deleted fee or a class the student left", () => {
    const assignments = [
      { id: "gone-line", studentId: "a", feeStructureId: "deleted", term: TERM, amount: 5, auto: true },
      { id: "old-class", studentId: "b", feeStructureId: "tuition1", term: TERM, amount: 100, auto: true },
      { id: "hand", studentId: "b", feeStructureId: "deleted", term: TERM, amount: 5 },
    ];
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments });
    assert.deepEqual(plan.remove.sort(), ["gone-line", "old-class"]);
  });

  it("keeps what a student who has left was already billed", () => {
    const assignments = [{ id: "kept", studentId: "left", feeStructureId: "tuition1", term: TERM, amount: 100, auto: true }];
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments });
    assert.deepEqual(plan.remove, []);
  });

  it("does nothing without a real term", () => {
    assert.deepEqual(planTermFees({ schoolCode: S, term: "", students, structures }), { create: [], update: [], remove: [] });
  });
});

describe("resultsAccess", () => {
  it("shows results when nothing is owed", () => {
    assert.deepEqual(resultsAccess({ balance: 0, term: TERM }), { visible: true, reason: null });
  });
  it("hides them while a balance is owed", () => {
    assert.deepEqual(resultsAccess({ balance: 5000, term: TERM }), { visible: false, reason: "balance" });
  });
  it("shows them when the bursar released them for this term", () => {
    const release = { status: "approved", term: TERM };
    assert.equal(resultsAccess({ balance: 5000, release, term: TERM }).visible, true);
  });
  it("a release for another term, or a revoked one, doesn't count", () => {
    assert.equal(releaseActive({ status: "approved", term: "Term 1 2026" }, TERM), false);
    assert.equal(releaseActive({ status: "revoked", term: TERM }, TERM), false);
  });
  it("a head teacher's withholding wins even when fees are paid", () => {
    assert.deepEqual(resultsAccess({ balance: 0, clearance: { status: "blocked" } }), { visible: false, reason: "clearance" });
    assert.equal(resultsAccess({ balance: 0, clearance: { status: "cleared" } }).visible, true);
  });
  it("tells the family what is owed", () => {
    assert.match(withheldMessage({ reason: "balance", balance: 45000, term: TERM }), /MK 45,000/);
  });
});

describe("childResults", () => {
  const docs = [
    { assessmentType: "EndTerm", publishedAt: 1, marks: { a: { Maths: 80, English: 60 }, b: { Maths: 50, English: 50 } } },
    { assessmentType: "CA1", publishedAt: 1, marks: { a: { Maths: 60 } } },
    { assessmentType: "MidTerm", marks: { a: { Maths: 0 } } }, // draft — ignored
  ];
  const r = childResults(docs, "a");

  it("returns only this child's subjects, weighted", () => {
    assert.deepEqual(r.subjects.map((s) => s.subject), ["English", "Maths"]);
    // Maths: (80*.6 + 60*.1) / .7 = 77.14… → 77.1
    assert.equal(r.subjects.find((s) => s.subject === "Maths").weighted, 77.1);
  });
  it("ignores unpublished sheets", () => {
    assert.equal(r.subjects.find((s) => s.subject === "Maths").components.MidTerm, undefined);
  });
  it("ranks against the class", () => {
    assert.equal(r.rank, 1);
    assert.equal(childResults(docs, "b").rank, 2);
  });
  it("has nothing for a child with no marks", () => {
    assert.deepEqual(childResults(docs, "zzz"), { subjects: [], overallAverage: null, rank: null });
  });
});

// One term at a time: a student is in the current term only; anything unpaid
// from earlier terms is carried forward, not shown as a second enrolment.

describe("termPosition", () => {
  const T3 = "Term 3 2026";
  it("shows only this term's fees as the term, with older debt brought forward", () => {
    // The real case that prompted this: manual "Term 1" and "Term 2" charges,
    // current term Term 3 2026.
    const charges = [
      { term: "Term 1", academicYear: "2025/2026", amount: 800000 },
      { term: "Term 2", academicYear: "2025/2026", amount: 666666 },
    ];
    const p = termPosition(charges, [], T3);
    assert.equal(p.charged, 0);
    assert.equal(p.broughtForward, 1466666);
    assert.equal(p.balance, 1466666);
  });
  it("a payment clears the oldest term first", () => {
    const charges = [
      { term: "Term 1 2026", amount: 600000 },
      { term: T3, amount: 600000, auto: true },
    ];
    const p = termPosition(charges, [{ amount: 700000 }], T3);
    assert.equal(p.broughtForward, 0);
    assert.equal(p.charged, 600000);
    assert.equal(p.paid, 100000);
    assert.equal(p.owed, 500000);
    assert.equal(p.percentage, 17);
    assert.equal(p.balance, 500000);
  });
  it("fully paid means nothing owed anywhere", () => {
    const p = termPosition([{ term: T3, amount: 100 }], [{ amount: 100 }], T3);
    assert.deepEqual([p.owed, p.broughtForward, p.balance, p.percentage], [0, 0, 0, 100]);
  });
});

describe("optional fees", () => {
  const students = [
    { id: "s1", classId: "c1", fullName: "A", status: "active" },
    { id: "s2", classId: "c1", fullName: "B", status: "active" },
  ];
  const tuition = { id: "f1", classId: "c1", name: "Tuition", amount: 1000, term: TERM, mandatory: true };
  const bus = { id: "f2", classId: "c1", name: "Bus", amount: 300, term: TERM, mandatory: false };
  const structures = [tuition, bus];

  it("is not billed to the whole class automatically", () => {
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments: [] });
    assert.deepEqual(plan.create.map((c) => c.data.feeStructureId), ["f1", "f1"]);
  });
  it("adds the fee only to the chosen students, once", () => {
    const first = planOptionalFees({ schoolCode: S, term: TERM, line: bus, students: [students[0]], assignments: [] });
    assert.equal(first.create.length, 1);
    assert.equal(first.create[0].data.studentId, "s1");
    assert.equal(first.create[0].data.optional, true);
    const again = planOptionalFees({
      schoolCode: S, term: TERM, line: bus, students,
      assignments: first.create.map((c) => ({ id: c.id, ...c.data })),
    });
    assert.deepEqual(again.create.map((c) => c.data.studentId), ["s2"]);
  });
  it("removes it again, and a later billing run leaves it alone", () => {
    const assignments = planOptionalFees({ schoolCode: S, term: TERM, line: bus, students, assignments: [] })
      .create.map((c) => ({ id: c.id, ...c.data }));
    const sync = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments });
    assert.deepEqual(sync.remove, []);
    const off = planOptionalFees({ schoolCode: S, term: TERM, line: bus, students: [students[1]], assignments, action: "remove" });
    assert.deepEqual(off.remove, [assignments[1].id]);
  });
  it("flags charges billed before the line became optional, in any term", () => {
    const old = [
      { id: "a1", studentId: "s1", feeStructureId: "f2", term: TERM, auto: true, amount: 300 },
      { id: "a2", studentId: "s1", feeStructureId: "f1", term: TERM, auto: true, amount: 1000 },
      { id: "a3", studentId: "s2", feeStructureId: "f2", term: TERM, optional: true, amount: 300 },
    ];
    const sync = planTermFees({ schoolCode: S, term: TERM, students, structures, assignments: old });
    assert.deepEqual(sync.update.filter((u) => u.data.optional).map((u) => u.id), ["a1"]);
    assert.deepEqual(sync.remove, []);
  });
  it("follows the fee line when its amount changes", () => {
    const assignments = planOptionalFees({ schoolCode: S, term: TERM, line: bus, students: [students[0]], assignments: [] })
      .create.map((c) => ({ id: c.id, ...c.data }));
    const plan = planTermFees({ schoolCode: S, term: TERM, students, structures: [tuition, { ...bus, amount: 400 }], assignments });
    assert.equal(plan.update.length, 1);
    assert.equal(plan.update[0].data.amount, 400);
  });
  it("ignores mandatory lines", () => {
    assert.deepEqual(planOptionalFees({ schoolCode: S, term: TERM, line: tuition, students, assignments: [] }).create, []);
  });
});

describe("unbilling a term", () => {
  const rows = [
    { id: "a", term: TERM },
    { id: "b", term: TERM, optional: true },
    { id: "c", term: "Term 1 2025" },
    { id: "d", term: "Term 1" , academicYear: "2025/2026" },
  ];
  it("picks every charge on the term, optional and hand-entered included", () => {
    const ids = planUnbillTerm({ term: TERM, assignments: rows });
    assert.ok(ids.includes("a") && ids.includes("b"));
    assert.ok(!ids.includes("c"));
  });
  it("does nothing without a valid term", () => {
    assert.deepEqual(planUnbillTerm({ term: "", assignments: rows }), []);
  });
});

describe("enrolling students in a term", () => {
  const structures = [
    { id: "f1", classId: "c1", name: "Tuition", amount: 1000, term: TERM, mandatory: true },
    { id: "f2", classId: "c1", name: "Bus", amount: 300, term: TERM, mandatory: false },
    { id: "f3", classId: "c1", name: "Tuition", amount: 900, term: "Term 1 2026", mandatory: true },
  ];
  const students = [
    { id: "s1", classId: "c1", fullName: "A", status: "active" },
    { id: "s2", classId: "c1", fullName: "B", status: "active" },
    { id: "s3", classId: "", fullName: "C", status: "active" },
    { id: "s4", classId: "c9", fullName: "D", status: "active" },
  ];
  const already = [{ id: "x", studentId: "s2", feeStructureId: "f1", term: TERM, auto: true, amount: 1000 }];

  it("bills only the unbilled, and says who was skipped and why", () => {
    const r = planEnrolInTerm({ schoolCode: S, term: TERM, students, structures, assignments: already });
    assert.deepEqual(r.billed, ["s1"]);
    assert.deepEqual(r.already, ["s2"]);
    assert.deepEqual(r.noClass, ["s3"]);
    assert.deepEqual(r.noFees, ["s4"]);
    assert.deepEqual(r.create.map((c) => c.data.feeStructureId), ["f1"]);
  });
  it("can enrol in a term other than the open one", () => {
    const r = planEnrolInTerm({ schoolCode: S, term: "Term 1 2026", students: [students[0]], structures, assignments: [] });
    assert.equal(r.create[0].data.term, "Term 1 2026");
    assert.equal(r.create[0].data.amount, 900);
  });
  it("lists the terms that have fees, plus the open one", () => {
    assert.deepEqual(enrolableTerms(structures, TERM), ["Term 1 2026", TERM]);
  });
});
