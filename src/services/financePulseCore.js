// The bursar's day at a glance, computed from the ledger itself. Pure, so
// tests/logic can check the arithmetic; financePulse.js does the reads.
//
// Money in means VERIFIED money: a parent-app claim ("unverified") is a
// promise, and a "rejected" one never happened — the same rule the Payments
// screen and the director's figures use.

const counts = (p) => p.status !== "unverified" && p.status !== "rejected";

/** A payment's day as YYYY-MM-DD, from the date the bursar entered or when it was written. */
function paymentDay(p) {
  if (p.paymentDate) return String(p.paymentDate).slice(0, 10);
  const ms = p.createdAt?.toMillis?.() ?? (p.createdAt?.seconds ? p.createdAt.seconds * 1000 : null);
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

/**
 * @param {{ students: object[], assignments: object[], payments: object[], today: string }} input
 */
export function computeFinancePulse({ students = [], assignments = [], payments = [], today }) {
  const active = students.filter((s) => (s.status || "active") === "active");
  const activeIds = new Set(active.map((s) => s.id));

  const billedBy = new Map();
  for (const a of assignments) {
    if (!activeIds.has(a.studentId) || a.optional) continue;
    billedBy.set(a.studentId, (billedBy.get(a.studentId) || 0) + Number(a.amount || a.totalAmount || 0));
  }

  const paidBy = new Map();
  let collectedToday = 0;
  let paymentsToday = 0;
  let unverified = 0;
  for (const p of payments) {
    if (p.status === "unverified") { unverified += 1; continue; }
    if (!counts(p)) continue;
    const amount = Number(p.amount || 0);
    paidBy.set(p.studentId, (paidBy.get(p.studentId) || 0) + amount);
    if (paymentDay(p) === today) { collectedToday += amount; paymentsToday += 1; }
  }

  let billed = 0;
  let collected = 0;
  let outstanding = 0;
  let owing = 0;
  let unbilled = 0;
  for (const s of active) {
    const due = billedBy.get(s.id) || 0;
    const paid = paidBy.get(s.id) || 0;
    if (!billedBy.has(s.id)) unbilled += 1;
    billed += due;
    collected += paid;
    // Per student, so one family's overpayment doesn't hide another's debt.
    if (due > paid) { outstanding += due - paid; owing += 1; }
  }

  return {
    students: active.length,
    billed,
    collected,
    outstanding,
    collectionRate: billed > 0 ? Math.min(100, Math.round((collected / billed) * 100)) : null,
    collectedToday,
    paymentsToday,
    unverified,
    owing,
    unbilled,
  };
}
