// Optional fees (bus, uniform, a trip) are billed to the students who take them
// but are not part of what a family owes: they must not inflate the charged,
// owed or balance figures, or hold a child's results.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocate, termPosition } from "../../src/services/feeAllocationCore.js";

const TERM = "Term 1 2026";
const charges = [
  { term: TERM, amount: 100000 },
  { term: TERM, amount: 30000, optional: true },
];

describe("optional fees are not counted", () => {
  it("termPosition charges compulsory fees only", () => {
    const p = termPosition(charges, [{ amount: 100000 }], TERM);
    assert.equal(p.charged, 100000);
    assert.equal(p.owed, 0);
    assert.equal(p.balance, 0);
    assert.equal(p.percentage, 100);
  });

  it("allocate ignores them in the balance", () => {
    const a = allocate(charges, [{ amount: 40000 }], TERM);
    assert.equal(a.totalCharged, 100000);
    assert.equal(a.balance, 60000);
  });

  it("a student with only an optional fee has nothing charged", () => {
    const p = termPosition([{ term: TERM, amount: 30000, optional: true }], [], TERM);
    assert.equal(p.charged, 0);
    assert.equal(p.balance, 0);
  });
});
