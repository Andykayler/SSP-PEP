// A school's subscription: MWK 5,000 per active learner per year.
import test from "node:test";
import assert from "node:assert/strict";
import { quote, formatMWK, rateFor, normaliseDiscount, describeDiscount, PRICE_PER_LEARNER_PER_YEAR } from "../../src/services/pricing.js";

test("the rate is MWK 5,000 per learner per year", () => {
  assert.equal(PRICE_PER_LEARNER_PER_YEAR, 5000);
});

test("the yearly amount is learners times the rate, at any size", () => {
  assert.equal(quote({ learners: 1 }).annualPayable, 5000);
  assert.equal(quote({ learners: 100 }).annualPayable, 500000);
  assert.equal(quote({ learners: 500 }).annualPayable, 2500000);
  assert.equal(quote({ learners: 2000 }).annualPayable, 10000000);
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
  assert.equal(formatMWK(2500000), "MWK 2,500,000");
});

test("a percentage discount comes off the standard rate", () => {
  const q = quote({ learners: 200, discount: { type: "percent", value: 20 } });
  assert.equal(q.ratePerLearner, 4000);
  assert.equal(q.annualPayable, 800000);
  assert.equal(q.saving, 200000);
  assert.equal(describeDiscount(q.discount), "20% off");
});

test("a custom rate replaces the standard rate", () => {
  const q = quote({ learners: 100, discount: { type: "rate", value: 3500 } });
  assert.equal(q.annualPayable, 350000);
  assert.equal(describeDiscount(q.discount), "MWK 3,500 per learner");
});

test("a discount that is not a discount is ignored", () => {
  for (const d of [null, {}, { type: "percent", value: 0 }, { type: "percent", value: -5 }, { type: "rate", value: 6000 },
                   { type: "rate", value: 5000 }, { type: "other", value: 10 }, { type: "percent", value: "x" }]) {
    assert.equal(rateFor(d), 5000, JSON.stringify(d));
    assert.equal(normaliseDiscount(d), null, JSON.stringify(d));
  }
  assert.equal(quote({ learners: 10, discount: { type: "percent", value: 150 } }).annualPayable, 0); // capped at 100% off
});
