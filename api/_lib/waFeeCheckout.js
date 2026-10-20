// api/_lib/waFeeCheckout.js
// ─────────────────────────────────────────────────────────────────────────────
// Turns a payment the WhatsApp bot has agreed with a parent (student, amount)
// into money moving, one of two ways depending on how they want to pay.
// Mirrors the "school_fee" path in api/payments/initiate.js — same
// collections, same idempotent-write-before-charging ordering, same "the
// browser never tells us what was paid" rule — kept as its own module
// because the trust boundary is different: initiate.js authenticates a
// Firebase ID token; this path authenticates by the WhatsApp sender's own
// number already having been matched to the student's guardianPhone (see
// api/whatsapp/webhook.js).
//
//   openWhatsAppDirectCharge()  Airtel Money / TNM Mpamba — a PIN prompt
//                               pushed straight to the phone, nothing to
//                               leave the chat for. Cards cannot work this
//                               way: PayChangu has no server-side "charge
//                               this card number" endpoint, and this product
//                               never collects card details itself (see
//                               api/_lib/paychangu.js) — a card number typed
//                               into a WhatsApp message would be a PCI
//                               nightmare regardless.
//   openWhatsAppFeeCheckout()   Card or bank transfer — a PayChangu hosted
//                               checkout link, same one the bursar's
//                               "Collect Online" uses. This is the one case
//                               the WhatsApp bot still hands off to a
//                               browser, because a card number has to be
//                               typed somewhere PCI-compliant, and this
//                               product deliberately never builds that page
//                               itself.
//
// Both write channel: "whatsapp" so api/payments/webhook.js can message the
// parent back on the hosted-checkout path; the direct-charge path additionally
// carries chargeMethod: "direct", which tells api/_lib/settle.js to verify it
// through PayChangu's direct-charge endpoint instead — a direct charge has no
// callback_url, so api/whatsapp/webhook.js polls it itself rather than
// waiting on a webhook.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import {
  createCheckout, makeTxRef, CURRENCY, mobileMoneyOperatorRef, initiateMobileMoneyCharge,
} from "./paychangu.js";
import { TX_COLLECTION } from "./settle.js";
import { calculateTransactionFee } from "../../src/services/transactionFeeCore.js";

/**
 * PayChangu's direct-charge API wants the bare 9-digit local number
 * ("888606204"), not the "+265888606204" form normalisePhone() produces
 * everywhere else in the product — it rejects anything else outright.
 */
function localMobileNumber(phone) {
  return String(phone || "").replace(/^\+265/, "");
}

function origin() {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL is not set — needed to build the PayChangu callback/return URLs.");
  // A scheme-less value (e.g. "ssp-pep.vercel.app", missing "https://") builds
  // a callback/return URL PayChangu's validator rejects outright — this once
  // slipped through Vercel's env var UI unnoticed, so it is corrected rather
  // than trusted here.
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/$/, "");
}

/**
 * The family pays the processing surcharge on top; the school is always
 * credited with the full balance they chose to pay (`amount`, unaffected) —
 * see src/services/transactionFeeCore.js. `chargeAmount` is what PayChangu is
 * actually asked to charge.
 */
function baseRecord(student, amount, payerPhone) {
  const { fee, total, acalinkFee, paychanguFee } = calculateTransactionFee(amount);
  return {
    schoolCode: student.schoolCode,
    studentId: student.id,
    studentName: student.fullName || "",
    studentCode: student.studentCode || "",
    classId: student.classId || "",
    className: student.className || "",
    campusId: student.campusId || "",
    campusName: student.campusName || "",
    term: "",
    academicYear: "",
    note: "Paid via WhatsApp",
    amount: Math.round(Number(amount)),
    chargeAmount: total,
    transactionFee: fee,
    acalinkFee,
    paychanguFee,
    payerPhone,
    channel: "whatsapp",
  };
}

/**
 * `payerPhone` is the WhatsApp number the parent chatted from — replies and CHECK
 * go there. `mobile` is the mobile money number the PIN prompt is sent to, which
 * the parent chose and which may be someone else's; it defaults to payerPhone.
 */
export async function openWhatsAppDirectCharge({ student, amount, payerPhone, network, mobile }) {
  const txRef = makeTxRef("school_fee");
  const operatorRefId = await mobileMoneyOperatorRef(network);
  const payMobile = mobile || payerPhone;
  const record = { ...baseRecord(student, amount, payerPhone), chargeMethod: "direct", network, payMobile };

  // Written before the charge is initiated, same as initiate.js: if
  // PayChangu is reached and the response is lost, the next CHECK or poll
  // still finds a record to settle against.
  await adminDb.collection(TX_COLLECTION).doc(txRef).set({
    txRef,
    purpose: "school_fee",
    status: "pending",
    currency: CURRENCY,
    initiatedById: "whatsapp-bot",
    initiatedByName: student.guardianName || "Guardian (WhatsApp)",
    createdAt: FieldValue.serverTimestamp(),
    ...record,
  });

  const charge = await initiateMobileMoneyCharge({
    chargeId: txRef,
    mobile: localMobileNumber(payMobile),
    operatorRefId,
    amount: record.chargeAmount,
    email: student.guardianEmail || "",
    firstName: (student.guardianName || "Guardian").split(/\s+/)[0],
    lastName: (student.guardianName || "").split(/\s+/).slice(1).join(" ") || student.lastName || "",
  });

  await adminDb.collection(TX_COLLECTION).doc(txRef).update({
    gatewayRefId: charge.refId || "",
    gatewayTransId: charge.transId || "",
    gatewayInitialStatus: charge.status || "",
  });

  return {
    txRef, amount: record.amount, fee: record.transactionFee, chargeAmount: record.chargeAmount,
    operatorName: charge.operator,
  };
}

export async function openWhatsAppFeeCheckout({ student, amount, payerPhone }) {
  const txRef = makeTxRef("school_fee");
  const base = origin();
  const record = baseRecord(student, amount, payerPhone);

  await adminDb.collection(TX_COLLECTION).doc(txRef).set({
    txRef,
    purpose: "school_fee",
    status: "pending",
    currency: CURRENCY,
    initiatedById: "whatsapp-bot",
    initiatedByName: student.guardianName || "Guardian (WhatsApp)",
    createdAt: FieldValue.serverTimestamp(),
    ...record,
  });

  const { checkoutUrl } = await createCheckout({
    txRef,
    amount: record.chargeAmount,
    email: student.guardianEmail || "",
    firstName: (student.guardianName || "Guardian").split(/\s+/)[0],
    lastName: (student.guardianName || "").split(/\s+/).slice(1).join(" ") || student.lastName || "",
    callbackUrl: `${base}/api/payments/webhook`,
    returnUrl: `${base}/pay/return?tx_ref=${encodeURIComponent(txRef)}`,
    title: "School fees",
    description: `${student.fullName || "Student"} — fees`,
    meta: { txRef, purpose: "school_fee", schoolCode: student.schoolCode, channel: "whatsapp" },
  });

  await adminDb.collection(TX_COLLECTION).doc(txRef).update({ checkoutUrl });

  return {
    txRef, checkoutUrl, amount: record.amount, fee: record.transactionFee, chargeAmount: record.chargeAmount,
  };
}
