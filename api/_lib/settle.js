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
import {
  verifyTransaction, verifyDirectCharge, mobileMoneyOperatorRef, initiateMobileMoneyPayout,
} from "./paychangu.js";
import { paidThroughAfter } from "../../src/services/subscriptionState.js";

export const TX_COLLECTION = "payment_transactions";

/**
 * A direct mobile-money charge (api/_lib/waFeeCheckout.js, the WhatsApp bot)
 * is verified through a different PayChangu endpoint than a hosted checkout,
 * because it is a different kind of transaction: no callback_url, no
 * `tx_ref` — see the comment on the direct-charge functions in paychangu.js.
 * Both return the same normalised shape, so everything below this line
 * treats them identically.
 */
function verifierFor(tx) {
  return tx.chargeMethod === "direct" ? verifyDirectCharge : verifyTransaction;
}

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

  const verified = await verifierFor(tx)(txRef);

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

  // Paid — but for how much? Checked against chargeAmount when the family
  // paid a processing surcharge on top (src/services/transactionFeeCore.js) —
  // that is what PayChangu actually charged and verifies, not the smaller
  // balance amount the student's account gets credited with below.
  const expected = Number(tx.chargeAmount || tx.amount || 0);
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
/**
 * PayChangu's payout API wants the bare 9-digit local number, same as its
 * charge API — see the identical comment in api/_lib/waFeeCheckout.js.
 */
function localMobileNumber(phone) {
  return String(phone || "").replace(/^\+265/, "");
}

/**
 * Pushes the school's share out to their own mobile money number the moment
 * their fee payment settles — see "Fee Payout Destination" on School
 * Settings, and initiateMobileMoneyPayout() in api/_lib/paychangu.js for why
 * this needs no PayChangu account on the school's side.
 *
 * Never allowed to fail the payment it is attached to: the family's payment
 * is already confirmed and credited by the time this runs, and a payout
 * hiccup is Acalink's problem to retry, not a reason to make a settled
 * payment look unsettled. `payoutStatus` on the payments doc is what makes a
 * stuck payout visible for that retry rather than silently lost.
 */
async function payoutToSchool(tx, paymentRef) {
  try {
    const schoolSnap = await adminDb.collection("schools").doc(tx.schoolCode).get();
    const school = schoolSnap.exists ? schoolSnap.data() : {};

    if (!school.payoutMobile || !school.payoutOperator) {
      await paymentRef.update({ payoutStatus: "not_configured" });
      return;
    }

    const operatorRefId = await mobileMoneyOperatorRef(school.payoutOperator);
    const payoutId = `PYT-${tx.txRef}`;
    const payout = await initiateMobileMoneyPayout({
      chargeId: payoutId,
      mobile: localMobileNumber(school.payoutMobile),
      operatorRefId,
      // Acalink absorbs PayChangu's own payout fee — the school is always
      // sent the full fee amount it was credited with, never less.
      amount: Math.round(Number(tx.amount || 0)),
      firstName: school.name || tx.schoolCode,
    });

    await paymentRef.update({
      payoutStatus: payout.status === "success" ? "sent" : payout.status || "pending",
      payoutChargeId: payoutId,
    });
  } catch (err) {
    console.error("[settle] payout to school failed for", tx.txRef, err);
    await paymentRef.update({ payoutStatus: "failed", payoutError: err.message }).catch(() => {});
  }
}

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
    // Present when the family paid the processing surcharge on top
    // (src/services/transactionFeeCore.js) — informational, never subtracted
    // from `amount` above, which is always the full balance credited.
    chargeAmount: tx.chargeAmount || null,
    transactionFee: tx.transactionFee || 0,
    acalinkFee: tx.acalinkFee || 0,
    paychanguFee: tx.paychanguFee || 0,
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

  // Awaited, not fired-and-forgotten: a serverless function can stop running
  // the instant its response is sent, so the payout has to actually happen
  // within this same invocation to happen at all — which is also what makes
  // it feel instant to the school rather than caught by some later sweep.
  await payoutToSchool(tx, ref);

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
  // How long this payment carries the school. Paying early extends from the
  // existing date rather than restarting the clock, so nobody loses days by
  // renewing ahead of time. Without this the school could never lapse.
  const schoolRef = adminDb.collection("schools").doc(tx.schoolCode);
  const current = (await schoolRef.get()).data() || {};
  const paidThrough = new Date(paidThroughAfter(tx.cadence, current.paidThrough));

  await schoolRef.set({
    subscription_status: "active",
    paidThrough,
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
