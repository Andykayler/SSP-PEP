// A school's subscription: MWK 3,050 per active learner per year.
import test from "node:test";
import assert from "node:assert/strict";
import { quote, formatMWK, PRICE_PER_LEARNER_PER_YEAR } from "../../src/services/pricing.js";

test("the rate is MWK 3,050 per learner per year", () => {
  assert.equal(PRICE_PER_LEARNER_PER_YEAR, 3050);
});

test("the yearly amount is learners times the rate, at any size", () => {
  assert.equal(quote({ learners: 1 }).annualPayable, 3050);
  assert.equal(quote({ learners: 100 }).annualPayable, 305000);
  assert.equal(quote({ learners: 500 }).annualPayable, 1525000);
  assert.equal(quote({ learners: 2000 }).annualPayable, 6100000);
});

test("what is charged is the yearly amount, once", () => {
  const q = quote({ learners: 250 });
  assert.equal(q.perInvoice, q.annualPayable);
  assert.equal(q.cadence.id, "annual");
  assert.equal(q.cadence.invoicesPerYear, 1);
});

test("no learners, nothing to pay; bad input is treated as none", () => {
  assert.equal(quote({ learners: 0 }).annualPayable, 0);
  assert.equal(quote({ learners: -5 }).annualPayable, 0);
  assert.equal(quote({ learners: "abc" }).annualPayable, 0);
  assert.equal(quote().annualPayable, 0);
});

test("amounts read as kwacha with separators", () => {
  assert.equal(formatMWK(1525000), "MWK 1,525,000");
});
