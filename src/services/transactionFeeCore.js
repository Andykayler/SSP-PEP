// src/services/transactionFeeCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The one place the 3.5% online-payment surcharge is calculated — every
// channel that opens a PayChangu checkout or charge for a family paying
// school fees (the portal's "Collect Online", the parent app, the WhatsApp
// bot) computes it here, so a family never sees a different total for the
// same balance depending on which channel they paid through.
//
// PayChangu's own processing fee is ~3% of what it settles; Acalink adds
// 0.5% on top as its own share. Both come out of the family, not the
// school — the amount credited toward a student's balance is always the
// balance they chose to pay, in full, never reduced by a fee.
//
// This does NOT apply to a school paying its own Acalink subscription
// (`purpose: "subscription"` in api/payments/initiate.js) — that is Acalink
// billing the school directly, not a payment-processing cost being passed
// through a third party.
// ─────────────────────────────────────────────────────────────────────────────

/** Total surcharge, as a fraction of the amount being paid. */
export const TRANSACTION_FEE_RATE = 0.035;

/** Acalink's own share of that total — the rest (~3%) is PayChangu's. */
export const ACALINK_FEE_SHARE = 0.005;

/**
 * @param {number} amount The balance the family is choosing to pay — what
 *   the student's account is credited with, unaffected by the fee.
 * @returns {{ amount:number, fee:number, total:number, acalinkFee:number, paychanguFee:number }}
 *   `total` is what PayChangu is asked to actually charge.
 */
export function calculateTransactionFee(amount) {
  const base = Math.round(Number(amount) || 0);
  const fee = Math.round(base * TRANSACTION_FEE_RATE);
  const acalinkFee = Math.round(base * ACALINK_FEE_SHARE);
  return {
    amount: base,
    fee,
    total: base + fee,
    acalinkFee,
    paychanguFee: fee - acalinkFee,
  };
}
