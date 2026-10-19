// src/services/feeAllocationCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure half of feeClearance.js — no Firestore, no notifications.
//
// Split out so serverless functions (api/_lib/feeBalance.js, for the WhatsApp
// bot and the bursar reminder scheduler) compute a student's balance with the
// exact same allocation rule the bursar's Arrears screen uses, rather than a
// second copy that can drift. feeClearance.js re-exports everything here, so
// existing imports of feeClearance.js are unaffected.
// ─────────────────────────────────────────────────────────────────────────────
import { parseTerm, resolveTerm } from "./academicTermCore.js";

/** Orders terms chronologically. Unparseable terms sort last, not first, so a
 *  malformed record cannot masquerade as the oldest debt. */
export function termRank(term) {
  const p = parseTerm(term);
  return p ? p.year * 10 + p.number : Number.MAX_SAFE_INTEGER;
}

export function compareTerms(a, b) {
  return termRank(a) - termRank(b);
}

/** How many terms back a debt reaches, relative to the term now running. */
export function termsBehind(term, currentTerm) {
  const a = parseTerm(term);
  const b = parseTerm(currentTerm);
  if (!a || !b) return 0;
  return Math.max(0, (b.year * 3 + b.number) - (a.year * 3 + a.number));
}

/**
 * Buckets describe how *old* a debt is, not how large. A school chases a
 * hundred thousand kwacha owed since last year quite differently from the same
 * sum charged three weeks ago, and lumping them together is why arrears lists
 * get ignored.
 */
export const AGE_BUCKETS = [
  { id: "current",  label: "This term",      minTerms: 0, tone: "success" },
  { id: "oneTerm",  label: "One term back",  minTerms: 1, tone: "warning" },
  { id: "twoTerms", label: "Two terms back", minTerms: 2, tone: "danger"  },
  { id: "chronic",  label: "A year or more", minTerms: 3, tone: "danger"  },
];

export function bucketFor(termsOld) {
  if (termsOld >= 3) return AGE_BUCKETS[3];
  if (termsOld >= 2) return AGE_BUCKETS[2];
  if (termsOld >= 1) return AGE_BUCKETS[1];
  return AGE_BUCKETS[0];
}

/**
 * Works out what a single student owes, and from when.
 *
 * Payments are applied to the oldest outstanding charge first regardless of
 * which term the payment was labelled for. That is deliberate: a parent paying
 * "for Term 2" while Term 1 is unpaid is, in practice, paying down the arrear —
 * treating the label as binding would leave the school reporting an ancient
 * debt beside a credit balance, which is not what happened.
 *
 * @param {Array} charges  fee_assignments for one student
 * @param {Array} paid     payments for one student
 * @param {string} currentTerm
 */
export function allocate(charges, paid, currentTerm) {
  const byTerm = new Map();
  compulsoryOnly(charges).forEach((c) => {
    // Charges are stored by the fee modules as "Term 1" or "Full Year";
    // resolving them against the running term is what makes an arrear
    // sortable, and therefore ageable. An unresolvable term keeps its raw
    // value and simply sorts last.
    const t = resolveTerm(c.term, currentTerm) || c.term || "";
    byTerm.set(t, (byTerm.get(t) || 0) + (Number(c.amount) || 0));
  });

  const terms = [...byTerm.keys()].sort(compareTerms);
  let pool = (paid || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const totalCharged = terms.reduce((s, t) => s + byTerm.get(t), 0);
  const totalPaid = pool;

  const outstandingByTerm = [];
  terms.forEach((t) => {
    const due = byTerm.get(t);
    const applied = Math.min(pool, due);
    pool -= applied;
    const left = due - applied;
    if (left > 0) outstandingByTerm.push({ term: t, amount: left });
  });

  const balance = Math.max(0, totalCharged - totalPaid);
  // A credit balance is real information — a family that has overpaid should
  // never appear on a chase list — so it is reported rather than clamped away.
  const credit = Math.max(0, totalPaid - totalCharged);

  const oldest = outstandingByTerm[0]?.term || "";
  const termsOld = oldest ? termsBehind(oldest, currentTerm) : 0;

  return {
    totalCharged,
    totalPaid,
    balance,
    credit,
    outstandingByTerm,
    oldestUnpaidTerm: oldest,
    termsOld,
    bucket: balance > 0 ? bucketFor(termsOld) : null,
    percentPaid: totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 100,
  };
}

/**
 * Optional (secondary) fees — bus, uniform, a trip — are billed to the students
 * who take them (`optional: true` on the charge) and are NOT part of what the
 * school counts as owed: they are left out of the charged, paid, owed and
 * balance figures, so a family is never held or chased for something that was
 * never compulsory.
 */
export const compulsoryOnly = (charges) => (charges || []).filter((c) => !c.optional);

/**
 * A student's position in the ONE term they are in — the school's current
 * term. Earlier terms are not a second enrolment: whatever is still unpaid
 * from them is carried forward as a single figure. Uses the same oldest-first
 * allocation as `allocate`, so a payment clears old debt before this term's.
 *
 * @returns {{ term, charged, paid, owed, broughtForward, balance, credit, percentage }}
 *   charged  — this term's fees
 *   paid     — how much of this term's fees has been covered
 *   owed     — this term's fees still unpaid
 *   broughtForward — unpaid fees from any other term
 */
export function termPosition(charges, paid, currentTerm) {
  const a = allocate(charges, paid, currentTerm);
  const charged = compulsoryOnly(charges)
    .filter((c) => (resolveTerm(c.term, currentTerm) || c.term) === currentTerm)
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const owed = a.outstandingByTerm.find((o) => o.term === currentTerm)?.amount || 0;
  const broughtForward = a.outstandingByTerm
    .filter((o) => o.term !== currentTerm)
    .reduce((s, o) => s + o.amount, 0);
  return {
    term: currentTerm,
    charged,
    paid: charged - owed,
    owed,
    broughtForward,
    balance: a.balance,
    credit: a.credit,
    percentage: charged > 0 ? Math.round(((charged - owed) / charged) * 100) : 0,
  };
}

/** Runs `allocate` across a whole school in one pass. */
export function buildArrears({ students, charges, payments, currentTerm }) {
  const chargesBy = new Map();
  (charges || []).forEach((c) => {
    if (!chargesBy.has(c.studentId)) chargesBy.set(c.studentId, []);
    chargesBy.get(c.studentId).push(c);
  });
  const paidBy = new Map();
  (payments || []).forEach((p) => {
    if (!paidBy.has(p.studentId)) paidBy.set(p.studentId, []);
    paidBy.get(p.studentId).push(p);
  });

  return (students || []).map((s) => ({
    ...s,
    ...allocate(chargesBy.get(s.id) || [], paidBy.get(s.id) || [], currentTerm),
  }));
}
