// The online-payment surcharge: 4.5% on top of the balance, of which 1.5% is
// Acalink's commission. The school is always credited the full balance.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateTransactionFee } from "../../src/services/transactionFeeCore.js";

describe("calculateTransactionFee", () => {
  it("adds 4.5% and splits it 3% / 1.5%", () => {
    const r = calculateTransactionFee(100000);
    assert.equal(r.amount, 100000);
    assert.equal(r.fee, 4500);
    assert.equal(r.total, 104500);
    assert.equal(r.acalinkFee, 1500);
    assert.equal(r.paychanguFee, 3000);
  });
  it("never reduces what the student is credited", () => {
    assert.equal(calculateTransactionFee(12345).amount, 12345);
  });
  it("handles nothing and nonsense", () => {
    assert.equal(calculateTransactionFee(0).total, 0);
    assert.equal(calculateTransactionFee("abc").total, 0);
  });
});
