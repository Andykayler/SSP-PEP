// api/_lib/waFeeCheckout.js
// ─────────────────────────────────────────────────────────────────────────────
// Opens a PayChangu checkout for a fee payment the WhatsApp bot has agreed
// with a parent. Mirrors the "school_fee" path in api/payments/initiate.js —
// same collections, same idempotent-write-before-checkout ordering, same
// "the browser never tells us what was paid" rule — kept as its own small
// function rather than a shared one because the trust boundary is different:
// initiate.js authenticates a Firebase ID token (staff, or an anonymous
// guardian session naming a student); this path authenticates by the
// WhatsApp sender's own number already having been matched to the student's
// guardianPhone (see api/whatsapp/webhook.js). Neither should be made to
// depend on the other's auth story changing safely.
//
// Every transaction written here carries channel: "whatsapp" and the phone
// the message came from, which is what lets api/payments/webhook.js send a
// WhatsApp confirmation back to the right number once PayChangu confirms it.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { createCheckout, makeTxRef, CURRENCY } from "./paychangu.js";
import { TX_COLLECTION } from "./settle.js";

function origin() {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL is not set — needed to build the PayChangu callback/return URLs.");
  return url.replace(/\/$/, "");
}

export async function openWhatsAppFeeCheckout({ student, amount, payerPhone }) {
  const txRef = makeTxRef("school_fee");
  const base = origin();

  const record = {
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
    payerPhone,
    channel: "whatsapp",
  };

  // Written before the checkout is opened, same as initiate.js: if PayChangu
  // is reached and the response is lost, the webhook still finds a record to
  // settle against.
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
    amount: record.amount,
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

  return { txRef, checkoutUrl, amount: record.amount };
}
