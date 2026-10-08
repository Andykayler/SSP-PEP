// src/services/pricing.js
// ─────────────────────────────────────────────────────────────────────────────
// One source of truth for what a school pays us.
//
// The admin and director billing page, the checkout the server opens and the
// public pricing section all read from here, so the figure a school was shown
// is the figure it is charged.
//
// The model is flat: MWK 3,050 per learner, per year, for every school whatever
// its size. A school's invoice is its active roll times that rate.
// ─────────────────────────────────────────────────────────────────────────────

/** MWK per learner per year. */
export const PRICE_PER_LEARNER_PER_YEAR = 3050;

/** The subscription is billed once a year. */
export const CADENCE = { id: "annual", label: "Annual", invoicesPerYear: 1 };

/**
 * SMS is a USD-denominated cost (international termination) and must never sit
 * inside a fixed kwacha subscription — it is sold as a prepaid wallet instead.
 */
export const SMS = {
  pricePerMessage: 40,
  /** Included allowance, per 100 learners, per term. */
  includedPer100PerTerm: 150,
  bundles: [2000, 10000, 50000],
};

// ─── Formatting ──────────────────────────────────────────────────────────────

/** "MWK 262,500". Pass `false` for the bare number with separators. */
export function formatMWK(amount, withPrefix = true) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const n = Math.round(amount).toLocaleString("en-US");
  return withPrefix ? `MWK ${n}` : n;
}

// ─── The model ───────────────────────────────────────────────────────────────

/** Included SMS allowance for one term at this enrolment. */
export function includedSmsPerTerm(learners) {
  const n = Math.max(0, Math.floor(learners || 0));
  return Math.ceil(n / 100) * SMS.includedPer100PerTerm;
}

/** What a school with this many active learners pays for a year. */
export function quote({ learners = 0 } = {}) {
  const count = Math.max(0, Math.floor(Number(learners) || 0));
  const annualPayable = count * PRICE_PER_LEARNER_PER_YEAR;
  return {
    learners: count,
    ratePerLearner: PRICE_PER_LEARNER_PER_YEAR,
    cadence: CADENCE,
    annualPayable,
    perInvoice: annualPayable,
    includedSms: includedSmsPerTerm(count),
  };
}
