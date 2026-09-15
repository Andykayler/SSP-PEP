// api/_lib/settle.js
// ─────────────────────────────────────────────────────────────────────────────
// Turning a verified gateway transaction into a record the school can act on.
//
// Two callers reach this: the PayChangu webhook, and the status endpoint the
// browser polls after the payer comes back. Both can arrive first, both can
// arrive twice, and on a bad network the browser can arrive while the webhook
// is still in flight. So settlement is written once as an idempotent
// transaction rather than twice as a pair of nearly-identical handlers — the
// alternative is a family charged once and credited twice.
//
// Idempotency is enforced inside a Firestore transaction on the
// `payment_transactions` document: whoever reads `settled: false` and flips it
// wins, everyone else returns the already-settled result. A same-process lock
// would not do, because the webhook and the poll usually land on two different
// serverless instances.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { verifyTransaction } from "./paychangu.js";

export const TX_COLLECTION = "payment_transactions";

/** A receipt number in the same shape the bursar module already issues. */
function receiptNo() {
  return `RCP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

/** "Airtel Money" reads better on a receipt than "mobile_money/airtel". */
function methodLabel(verified) {
  const operator = String(verified.operator || "").toLowerCase();
  if (operator.includes("airtel")) return "Airtel Money";
  if (operator.includes("mpamba") || operator.includes("tnm")) return "TNM Mpamba";
  const channel = String(verified.channel || "").toLowerCase();
  if (channel.includes("card")) return "Card (PayChangu)";
  if (channel.includes("bank")) return "Bank Transfer (PayChangu)";
  if (channel.includes("mobile")) return "Mobile Money (PayChangu)";
  return "PayChangu";
}

/**
 * Verifies a transaction with PayChangu and, if it really was paid, writes the
 * record it stands for — exactly once.
 *
 * Returns `{ status, alreadySettled, paymentId }`. Callers should treat a
 * thrown error as "try again later" rather than as failure of the payment;
 * the transaction document stays pending and the next poll or webhook retry
 * picks it up.
 */
export async function settleTransaction(txRef) {
  const txDocRef = adminDb.collection(TX_COLLECTION).doc(txRef);
  const snap = await txDocRef.get();

  if (!snap.exists) {
    // A reference we never issued. Nothing to settle, and nothing to create —
    // creating one here would let anyone with a URL invent transactions.
    return { status: "unknown", alreadySettled: false, reason: "No such transaction." };
  }

  const tx = snap.data();
  if (tx.status === "success") {
    return { status: "success", alreadySettled: true, paymentId: tx.paymentId || null };
  }

  const verified = await verifyTransaction(txRef);

  if (!verified.paid) {
    const status = verified.failed ? "failed" : "pending";
    const changed = tx.status !== status;
    if (changed) {
      await txDocRef.update({
        status,
        gatewayStatus: verified.status,
        checkedAt: FieldValue.serverTimestamp(),
      });
    }
    // channel/payerPhone/studentName/amount let a caller (the PayChangu
    // webhook) notify a WhatsApp-initiated payment's own number on failure,
    // without a second Firestore read — but only worth acting on when this
    // call is the one that just discovered the failure.
    return {
      status, alreadySettled: false, changed,
      channel: tx.channel || "", payerPhone: tx.payerPhone || "",
      studentName: tx.studentName || "", amount: tx.amount || 0,
    };
  }

  // Paid — but for how much? The amount we quoted is what the record must say.
  // A gateway that settles less than we asked for (a partial capture, a
  // currency mix-up) is a discrepancy for a human, not a receipt to issue.
  const expected = Number(tx.amount || 0);
  if (expected > 0 && verified.amount > 0 && Math.round(verified.amount) < Math.round(expected)) {
    await txDocRef.update({
      status: "underpaid",
      gatewayStatus: verified.status,
      gatewayAmount: verified.amount,
      gatewayRef: verified.gatewayRef || "",
      checkedAt: FieldValue.serverTimestamp(),
    });
    return { status: "underpaid", alreadySettled: false, expected, received: verified.amount };
  }

  // ── Claim the settlement ──────────────────────────────────────────────────
  // Everything below runs at most once per transaction, whichever caller wins.
  const claimed = await adminDb.runTransaction(async (t) => {
    const fresh = await t.get(txDocRef);
    const data = fresh.data() || {};
    if (data.status === "success") return false;
    t.update(txDocRef, {
      status: "success",
      gatewayStatus: verified.status,
      gatewayRef: verified.gatewayRef || "",
      gatewayAmount: verified.amount,
      gatewayChannel: verified.channel || "",
      settledAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!claimed) {
    const after = await txDocRef.get();
    return { status: "success", alreadySettled: true, paymentId: after.data()?.paymentId || null };
  }

  const written =
    tx.purpose === "subscription"
      ? await recordSubscriptionPayment(tx, verified)
      : await recordFeePayment(tx, verified);

  await txDocRef.update(written.txPatch || {});

  return {
    status: "success", alreadySettled: false, changed: true,
    channel: tx.channel || "", payerPhone: tx.payerPhone || "",
    studentName: tx.studentName || "", amount: tx.amount || 0,
    ...written.result,
  };
}

/**
 * A school fee, landing in the same `payments` ledger the bursar reads.
 *
 * `source: 'paychangu'` and `status: 'verified'` are what make this row
 * different from the parent app's self-reported claim: the money is confirmed
 * by the gateway before the row exists, so the bursar's totals can be trusted
 * without a second confirmation step.
 */
async function recordFeePayment(tx, verified) {
  const receipt = receiptNo();
  const ref = await adminDb.collection("payments").add({
    studentId: tx.studentId || "",
    studentName: tx.studentName || "",
    studentCode: tx.studentCode || "",
    classId: tx.classId || "",
    className: tx.className || "",
    campusId: tx.campusId || "",
    campusName: tx.campusName || "",
    amount: Math.round(Number(tx.amount || 0)),
    method: methodLabel(verified),
    referenceNo: verified.gatewayRef || tx.txRef,
    term: tx.term || "",
    notes: tx.note || "",
    paymentDate: new Date().toISOString().split("T")[0],
    receiptNo: receipt,
    recordedBy: tx.initiatedByName || "Online payment",
    academicYear: tx.academicYear || "",
    schoolCode: tx.schoolCode,
    source: "paychangu",
    status: "verified",
    gatewayTxRef: tx.txRef,
    sponsorId: "",
    sponsorName: "",
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    txPatch: { paymentId: ref.id, receiptNo: receipt },
    result: { paymentId: ref.id, receiptNo: receipt },
  };
}

/**
 * The school paying Acalink, which is a different kind of money entirely — it
 * never belongs in `payments`, where every row is a family's fee and the
 * bursar's totals would quietly absorb it.
 */
async function recordSubscriptionPayment(tx, verified) {
  const receipt = receiptNo();
  const ref = await adminDb.collection("subscription_payments").add({
    schoolCode: tx.schoolCode,
    schoolName: tx.schoolName || "",
    amount: Math.round(Number(tx.amount || 0)),
    currency: verified.currency,
    cadence: tx.cadence || "",
    periodLabel: tx.periodLabel || "",
    learners: tx.learners || 0,
    boarders: tx.boarders || 0,
    method: methodLabel(verified),
    gatewayRef: verified.gatewayRef || "",
    gatewayTxRef: tx.txRef,
    receiptNo: receipt,
    paidByName: tx.initiatedByName || "",
    paidById: tx.initiatedById || "",
    paidAt: FieldValue.serverTimestamp(),
  });

  // The school is now a paying customer. `paidThroughLabel` is what the
  // Billing page shows instead of "Trial", so an admin who has just paid sees
  // it reflected without waiting for anyone at Acalink to act.
  await adminDb.collection("schools").doc(tx.schoolCode).set({
    subscription_status: "active",
    billing_cadence: tx.cadence || "",
    lastPaymentAt: FieldValue.serverTimestamp(),
    lastPaymentAmount: Math.round(Number(tx.amount || 0)),
    paidThroughLabel: tx.periodLabel || "",
  }, { merge: true });

  return {
    txPatch: { subscriptionPaymentId: ref.id, receiptNo: receipt },
    result: { subscriptionPaymentId: ref.id, receiptNo: receipt },
  };
}
