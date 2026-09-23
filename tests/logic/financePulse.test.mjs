// The bursar's overview numbers. Money in is verified money only, and what is
// outstanding is owed per student — an overpayment doesn't cancel a debt.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeFinancePulse } from "../../src/services/financePulseCore.js";

const TODAY = "2026-09-23";
const students = [
  { id: "a" }, { id: "b" }, { id: "c" },
  { id: "gone", status: "transferred" },
];
const assignments = [
  { studentId: "a", amount: 100000 },
  { studentId: "b", amount: 100000 },
  { studentId: "gone", amount: 50000 },
];

describe("computeFinancePulse", () => {
  const r = computeFinancePulse({
    students,
    assignments,
    today: TODAY,
    payments: [
      { studentId: "a", amount: 120000, status: "verified", paymentDate: TODAY },
      { studentId: "b", amount: 40000, status: "verified", paymentDate: "2026-09-01" },
      { studentId: "b", amount: 60000, status: "unverified", paymentDate: TODAY },
      { studentId: "b", amount: 10000, status: "rejected", paymentDate: TODAY },
    ],
  });

  it("counts only active students, billed and collected", () => {
    assert.equal(r.students, 3);
    assert.equal(r.billed, 200000);
    assert.equal(r.collected, 160000);
  });
  it("outstanding is per student — a's overpayment doesn't reduce b's debt", () => {
    assert.equal(r.outstanding, 60000);
    assert.equal(r.owing, 1);
  });
  it("unverified claims are counted apart and never as money in", () => {
    assert.equal(r.unverified, 1);
  });
  it("today's takings are verified payments dated today", () => {
    assert.equal(r.collectedToday, 120000);
    assert.equal(r.paymentsToday, 1);
  });
  it("flags active students with no fee assigned", () => {
    assert.equal(r.unbilled, 1);
  });
  it("collection rate is capped at 100%", () => {
    assert.equal(r.collectionRate, 80);
    const over = computeFinancePulse({
      students: [{ id: "a" }], assignments: [{ studentId: "a", amount: 10 }],
      payments: [{ studentId: "a", amount: 30, status: "verified" }], today: TODAY,
    });
    assert.equal(over.collectionRate, 100);
  });
  it("has no rate when nothing is billed", () => {
    assert.equal(computeFinancePulse({ students: [{ id: "a" }], today: TODAY }).collectionRate, null);
  });
});
