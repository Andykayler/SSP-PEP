// api/_lib/paymentDelete.js
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY CLEAN-UP TOOL: delete a payment record (test payments taken on a live
// school). Reached through api/payments/initiate.js (payment_delete).
//
//   • only the school's own bursar or administrator, and only that school's rows;
//   • any payment, online or entered by hand — a ledger row is a record of
//     money, so the confirmation says so and nothing is removed without a copy;
//   • the full record is copied to `deleted_payments` first (server-only), so a
//     deletion can be inspected and a payment restored by hand;
//   • it removes the ledger row only. It does NOT refund anything: an online
//     payment's money already moved through PayChangu. Deleting the row puts the
//     amount back on the student's balance and takes it out of the school's
//     payout balance.
//
// Remove this file, its route and the Delete button once the clean-up is done.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";

export const DELETED = "deleted_payments";

class RefusedError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function deletePayment({ auth, body }) {
  const user = auth.user;
  if (auth.isAnonymous || !user?.schoolCode || !["bursar", "admin"].includes(user.role)) {
    throw new RefusedError("Only the school's bursar or administrator can delete a payment.", 403);
  }

  const ref = adminDb.collection("payments").doc(String(body.id || "_"));
  const snap = await ref.get();
  if (!snap.exists || snap.data().schoolCode !== user.schoolCode) throw new RefusedError("Payment not found.", 404);

  const payment = snap.data();

  // Copy first, then delete: if the copy fails nothing is lost.
  await adminDb.collection(DELETED).doc(ref.id).set({
    ...payment,
    originalId: ref.id,
    deletedById: auth.uid,
    deletedByName: user.name || user.email || "",
    deletedAt: FieldValue.serverTimestamp(),
  });
  await ref.delete();
  console.log("[payment-delete]", ref.id, payment.source || "", payment.receiptNo || "", "by", auth.uid);
  return { ok: true, receiptNo: payment.receiptNo || "" };
}

export { RefusedError };
