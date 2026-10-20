// api/_lib/payoutCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The arithmetic and rules of paying a school what its families paid online.
// Pure, so tests/logic can pin it down; the I/O is api/_lib/payouts.js.
//
// The model: every online fee payment lands in Acalink's PayChangu account and
// is credited to the student in full. Nothing is sent to the school
// automatically. Instead the school has a BALANCE — online payments received,
// less what has been paid out or is on its way — and the bursar asks for some of
// it to be sent to the school's bank account, which the director approves.
// ─────────────────────────────────────────────────────────────────────────────

/** Payout states that have already claimed part of the balance. */
export const RESERVING = ["requested", "processing", "paid"];

export const PAYOUT_STATUS_LABEL = {
  requested: "Awaiting approval",
  processing: "Being sent",
  paid: "Paid",
  failed: "Failed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const sum = (rows) => rows.reduce((n, r) => n + (Number(r.amount) || 0), 0);

/**
 * What the school is owed from online payments.
 *   earned    confirmed online payments recorded under this flow — the ones
 *             marked `payoutStatus: "held"` when they settled. Payments from
 *             before it (whose old automatic payout sent, failed, was pending
 *             or was never set up) do not count: they were never part of this
 *             balance, and a failed old payout must not inflate it
 *   reserved  payouts that are waiting, in flight or done
 * A failed, declined or cancelled payout releases its amount back.
 */
export function availableBalance({ payments = [], payouts = [] }) {
  const earned = sum(payments.filter((p) =>
    p.source === "paychangu" && p.status === "verified" && p.payoutStatus === "held"));
  const reserved = sum(payouts.filter((p) => RESERVING.includes(p.status)));
  return {
    earned,
    reserved,
    awaiting: sum(payouts.filter((p) => p.status === "requested")),
    paidOut: sum(payouts.filter((p) => p.status === "paid")),
    available: Math.max(0, earned - reserved),
  };
}

/** PayChangu's fee for sending a payout, from configuration: a rate and/or a flat amount. */
export function feeConfigFromEnv(env = {}) {
  const rate = Number(env.PAYCHANGU_BANK_PAYOUT_FEE_RATE);
  const flat = Number(env.PAYCHANGU_BANK_PAYOUT_FEE_FLAT);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    flat: Number.isFinite(flat) && flat > 0 ? flat : 0,
  };
}

/** The fee, in whole kwacha, taken out of what the school receives. */
export function payoutFee(amount, { rate = 0, flat = 0 } = {}) {
  return Math.max(0, Math.round((Number(amount) || 0) * rate + flat));
}

/** An error message, or "" when the amount may be requested. */
export function checkRequestAmount(amount, available, feeConfig) {
  if (!Number.isInteger(amount) || amount <= 0) return "Enter a whole amount in kwacha.";
  if (amount > available) return "That is more than the school's available balance.";
  if (amount - payoutFee(amount, feeConfig) <= 0) return "That amount is not enough to cover the payout fee.";
  return "";
}

/** Bank account details, checked before they are saved. */
export function checkDestination({ bankUuid, accountName, accountNumber }) {
  if (!String(bankUuid || "").trim()) return "Choose a bank.";
  if (String(accountName || "").trim().length < 3) return "Enter the account name exactly as the bank has it.";
  if (!/^\d{6,20}$/.test(String(accountNumber || "").replace(/\s+/g, ""))) return "Enter the account number, digits only.";
  return "";
}

/** 1234567890 → ••••7890, for showing back an account without exposing it whole. */
export function maskAccount(number) {
  const n = String(number || "").replace(/\s+/g, "");
  return n.length <= 4 ? n : `${"•".repeat(Math.min(n.length - 4, 6))}${n.slice(-4)}`;
}

/**
 * Who may approve a school's payouts: its director. A school that has no active
 * director would otherwise be stuck, so then its administrator may. Nobody ever
 * approves their own request.
 */
export function canApprovePayout({ role, uid, requestedById, schoolHasDirector }) {
  if (uid && uid === requestedById) return false;
  if (role === "director") return true;
  return role === "admin" && !schoolHasDirector;
}

/** Whether PayChangu's status word for a payout means the money has gone. */
export function payoutOutcome(statusWord) {
  const s = String(statusWord || "").toLowerCase();
  if (["success", "successful", "paid", "completed"].includes(s)) return "paid";
  if (["failed", "cancelled", "canceled", "rejected", "reversed"].includes(s)) return "failed";
  return "processing";
}
