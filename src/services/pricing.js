// src/services/pricing.js
// ─────────────────────────────────────────────────────────────────────────────
// One source of truth for what a school pays us.
//
// Before this, the admin billing page and the public pricing section each
// carried their own hardcoded plan list, and they had already drifted apart —
// the dashboard advertised MWK 45,000/month while the landing page advertised
// MK 12,500/month for what was nominally the same product. Anything that
// quotes, invoices or displays a price goes through here.
//
// The model is per learner, per term, in MARGINAL bands: a learner is charged
// at the rate of the band they fall into, not the rate of the school's total
// size. That matters — a flat "over 250 costs X each" rule makes the marginal
// learner several times more expensive than the average one, so growing
// schools get punished and large schools are priced out entirely.
// ─────────────────────────────────────────────────────────────────────────────

/** Malawi runs three terms, not four quarters. Billing follows the terms. */
export const TERMS_PER_YEAR = 3;

/**
 * Marginal bands. `to` is inclusive; the last band is open-ended.
 * Rates are MWK per learner per term.
 */
export const BANDS = [
  { id: "A", from: 1,    to: 250,      rate: 1050 },
  { id: "B", from: 251,  to: 600,      rate: 800  },
  { id: "C", from: 601,  to: 1200,     rate: 620  },
  { id: "D", from: 1201, to: Infinity, rate: 480  },
];

/**
 * Floor on the platform line, so a 60-learner school is still worth serving.
 * Applied to the platform fee before add-ons, not to the whole invoice.
 */
export const MIN_PLATFORM_PER_TERM = 135000;

/** Boarding add-on, charged per boarder per term on top of the platform fee. */
export const BOARDING_PER_TERM = 250;

/**
 * Cadence changes the price, not just the schedule. Termly is list. Annual
 * prepay is discounted because the cash arrives up front; monthly carries a
 * premium because chasing twelve payments a year costs us collections effort.
 */
export const CADENCES = {
  termly: {
    id: "termly", label: "Termly", multiplier: 1, invoicesPerYear: TERMS_PER_YEAR,
    note: "Invoiced day 1 of each term, due day 14 — when schools collect fees.",
  },
  annual: {
    id: "annual", label: "Annual prepay", multiplier: 0.85, invoicesPerYear: 1,
    note: "Paid before Term 1. Onboarding waived and the rate is locked for the year.",
  },
  monthly: {
    id: "monthly", label: "Monthly", multiplier: 1.12, invoicesPerYear: 12,
    note: "On request only, minimum one-term commitment.",
  },
};

export const DEFAULT_CADENCE = "termly";

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

/** One-time, covering data import, fee-structure setup and training. */
export const ONBOARDING = [
  { upTo: 250,      fee: 200000 },
  { upTo: 600,      fee: 350000 },
  { upTo: 1200,     fee: 550000 },
  { upTo: Infinity, fee: null   },   // by quote
];

// ─── Formatting ──────────────────────────────────────────────────────────────

/** "MWK 262,500". Pass `false` for the bare number with separators. */
export function formatMWK(amount, withPrefix = true) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const n = Math.round(amount).toLocaleString("en-US");
  return withPrefix ? `MWK ${n}` : n;
}

// ─── The model ───────────────────────────────────────────────────────────────

/**
 * Splits an enrolment across the bands it spans.
 * 500 learners => [{ A, 250, 1050, 262500 }, { B, 250, 800, 200000 }].
 */
export function bandBreakdown(learners) {
  const total = Math.max(0, Math.floor(learners || 0));
  const rows = [];
  for (const band of BANDS) {
    if (total < band.from) break;
    const upper = Math.min(total, band.to);
    const count = upper - band.from + 1;
    if (count <= 0) continue;
    rows.push({
      id: band.id,
      from: band.from,
      to: band.to,
      rate: band.rate,
      learners: count,
      amount: count * band.rate,
    });
  }
  return rows;
}

/** The band a school's next learner falls into — used for "you are in Band B". */
export function bandFor(learners) {
  const n = Math.max(1, Math.floor(learners || 1));
  return BANDS.find(b => n >= b.from && n <= b.to) || BANDS[BANDS.length - 1];
}

export function onboardingFee(learners) {
  const n = Math.max(0, Math.floor(learners || 0));
  return (ONBOARDING.find(t => n <= t.upTo) || { fee: null }).fee;
}

/** Included SMS allowance for one term at this enrolment. */
export function includedSmsPerTerm(learners) {
  const n = Math.max(0, Math.floor(learners || 0));
  return Math.ceil(n / 100) * SMS.includedPer100PerTerm;
}

/**
 * The full quote for a school.
 *
 * Returns per-term list amounts (before cadence), the cadence-adjusted annual
 * total, and what lands on each invoice. `perInvoice` is what the bursar
 * actually sees, so it is the figure worth putting on screen.
 */
export function quote({ learners = 0, boarders = 0, cadence = DEFAULT_CADENCE } = {}) {
  const plan = CADENCES[cadence] || CADENCES[DEFAULT_CADENCE];

  const breakdown = bandBreakdown(learners);
  const bandTotal = breakdown.reduce((sum, r) => sum + r.amount, 0);
  const floorApplied = learners > 0 && bandTotal < MIN_PLATFORM_PER_TERM;
  const platformPerTerm = learners > 0 ? Math.max(bandTotal, MIN_PLATFORM_PER_TERM) : 0;

  const boardingPerTerm = Math.max(0, Math.floor(boarders || 0)) * BOARDING_PER_TERM;
  const listPerTerm = platformPerTerm + boardingPerTerm;

  const annualList = listPerTerm * TERMS_PER_YEAR;
  const annualPayable = annualList * plan.multiplier;

  return {
    learners: Math.max(0, Math.floor(learners || 0)),
    boarders: Math.max(0, Math.floor(boarders || 0)),
    cadence: plan,
    breakdown,
    bandTotal,
    floorApplied,
    platformPerTerm,
    boardingPerTerm,
    listPerTerm,
    annualList,
    annualPayable,
    perInvoice: plan.invoicesPerYear ? annualPayable / plan.invoicesPerYear : annualPayable,
    savingVsTermly: annualList - annualPayable,   // negative on the monthly premium
    perLearnerPerYear: learners > 0 ? annualPayable / learners : 0,
    onboarding: onboardingFee(learners),
    includedSms: includedSmsPerTerm(learners),
  };
}

/** Every cadence priced side by side, for the comparison cards. */
export function compareCadences({ learners = 0, boarders = 0 } = {}) {
  return Object.keys(CADENCES).map(id => quote({ learners, boarders, cadence: id }));
}
