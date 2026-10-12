// src/services/pricing.js
// ─────────────────────────────────────────────────────────────────────────────
// One source of truth for what a school pays us.
//
// The admin and director billing page, the checkout the server opens and the
// public pricing section all read from here, so the figure a school was shown
// is the figure it is charged.
//
// The model is flat: MWK 5,000 per learner, per year, for every school whatever
// its size. A school's invoice is its active roll times its rate. The platform
// owner can give a school a discount (schools/{code}.discount, which a school
// cannot write): a percentage off, or a custom rate per learner.
// ─────────────────────────────────────────────────────────────────────────────

/** MWK per learner per year. */
export const PRICE_PER_LEARNER_PER_YEAR = 5000;

/**
 * A discount as stored on the school, cleaned up; null when there is none.
 *   { type: "percent", value: 0-100 }   that much off the standard rate
 *   { type: "rate",    value: MWK }     this much per learner instead (never above standard)
 */
export function normaliseDiscount(d) {
  const value = Number(d?.value);
  if (!d || !Number.isFinite(value) || value < 0) return null;
  if (d.type === "percent") return value > 0 ? { type: "percent", value: Math.min(100, value), note: String(d.note || "") } : null;
  if (d.type === "rate") return value < PRICE_PER_LEARNER_PER_YEAR ? { type: "rate", value, note: String(d.note || "") } : null;
  return null;
}

/** MWK per learner per year for a school with this discount. */
export function rateFor(discount) {
  const d = normaliseDiscount(discount);
  if (!d) return PRICE_PER_LEARNER_PER_YEAR;
  return d.type === "percent" ? PRICE_PER_LEARNER_PER_YEAR * (1 - d.value / 100) : d.value;
}

/** "20% off", "MWK 3,500 per learner" - for badges. */
export function describeDiscount(discount) {
  const d = normaliseDiscount(discount);
  if (!d) return "";
  return d.type === "percent" ? `${d.value}% off` : `${formatMWK(d.value)} per learner`;
}

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
export function quote({ learners = 0, discount = null } = {}) {
  const count = Math.max(0, Math.floor(Number(learners) || 0));
  const rate = rateFor(discount);
  const annualPayable = Math.round(count * rate);
  return {
    learners: count,
    ratePerLearner: rate,
    standardRate: PRICE_PER_LEARNER_PER_YEAR,
    discount: normaliseDiscount(discount),
    saving: count * PRICE_PER_LEARNER_PER_YEAR - annualPayable,
    cadence: CADENCE,
    annualPayable,
    perInvoice: annualPayable,
    includedSms: includedSmsPerTerm(count),
  };
}
