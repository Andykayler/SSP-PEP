// api/payments/initiate.js
// ─────────────────────────────────────────────────────────────────────────────
// Opens a PayChangu checkout. Reachable at POST /api/payments/initiate.
//
// Two kinds of money go through here and they are NOT symmetrical:
//
//   purpose: "school_fee"    a family paying the school. The payer chooses the
//                            amount, because part-payment against a balance is
//                            how school fees are actually paid in Malawi. What
//                            the school is credited with is whatever PayChangu
//                            confirms was received, so a client-supplied figure
//                            can only ever under-promise, never over-credit.
//
//   purpose: "subscription"  the school paying Acalink. Here the amount is
//                            recomputed from services/pricing.js against the
//                            school's own enrolment and ignored if supplied,
//                            because settling it flips the school to "active" —
//                            a client-set price would let a school subscribe
//                            for one kwacha.
//
// Every caller must present a Firebase ID token. Staff are resolved through
// their users document; the parent app signs in anonymously and has none, so a
// guardian is bound instead to the student they name, exactly as
// firestore.rules does it.
// ─────────────────────────────────────────────────────────────────────────────
import { cors } from "../_lib/cors.js";
import { adminAuth, adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import { isDeactivated } from "../../src/services/staffAccountCore.js";
import {
  createCheckout, makeTxRef, isConfigured, CURRENCY, mobileMoneyOperatorRef, initiateMobileMoneyCharge,
  initiateBankTransferCharge,
} from "../_lib/paychangu.js";
import { TX_COLLECTION } from "../_lib/settle.js";
import { quote } from "../../src/services/pricing.js";
import { startConnect, completeConnect } from "../_lib/connectLink.js";
import { PAYOUT_ACTIONS, isPayoutAction, UserError } from "../_lib/payouts.js";
import { calculateTransactionFee } from "../../src/services/transactionFeeCore.js";

const FINANCE_ROLES = ["admin", "bursar"];
const SUBSCRIPTION_ROLES = ["admin", "director"];

/** Highest single payment we will open a checkout for. */
const MAX_AMOUNT = 50_000_000;

function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body || {};
}

/** The public origin, used to build the URLs PayChangu sends the payer back to. */
function originOf(req) {
  if (process.env.APP_URL) {
    // A scheme-less value (e.g. "ssp-pep.vercel.app", missing "https://")
    // builds a callback/return URL PayChangu's validator rejects outright —
    // this once slipped through Vercel's env var UI unnoticed.
    const url = process.env.APP_URL;
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return withScheme.replace(/\/$/, "");
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function authenticate(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "Sign in before starting a payment." };

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { error: "Your session has expired. Sign in again." };
  }

  const isAnonymous = decoded.firebase?.sign_in_provider === "anonymous";
  if (isAnonymous) return { uid: decoded.uid, isAnonymous: true };

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) return { error: "No staff profile is attached to this account." };
  if (isDeactivated(userSnap.data())) return { error: "This account has been deactivated. Contact your school administrator." };

  return { uid: decoded.uid, isAnonymous: false, user: userSnap.data() };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isConfigured()) {
    return res.status(503).json({ error: "Online payments are not configured for this deployment." });
  }

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: "Body is not valid JSON." });

  const auth = await authenticate(req);
  if (auth.error) return res.status(401).json({ error: auth.error });

  // A school linking its own PayChangu account shares this endpoint (see
  // api/_lib/connectLink.js) — the function budget leaves no room for another.
  if (body.action === "connect_start" || body.action === "connect_complete") {
    try {
      const out = body.action === "connect_start"
        ? await startConnect({ auth, origin: originOf(req) })
        : await completeConnect({ auth, body });
      if (out.error) return res.status(out.status || 400).json({ error: out.error });
      return res.status(200).json(out);
    } catch (err) {
      console.error("[connect]", body.action, "failed:", err);
      return res.status(502).json({ error: err.message || "Could not reach PayChangu." });
    }
  }

  // Paying a school what its families paid online (api/_lib/payouts.js).
  if (isPayoutAction(body.action)) {
    try {
      return res.status(200).json(await PAYOUT_ACTIONS[body.action]({ auth, body }));
    } catch (err) {
      if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
      console.error("[payout]", body.action, "failed:", err);
      return res.status(502).json({ error: err.message || "Could not complete that." });
    }
  }

  const purpose = body.purpose === "subscription" ? "subscription" : "school_fee";

  try {
    const prepared =
      purpose === "subscription"
        ? await prepareSubscription({ body, auth })
        : await prepareFee({ body, auth });

    if (prepared.error) return res.status(prepared.status || 400).json({ error: prepared.error });

    const txRef = makeTxRef(purpose);
    const origin = originOf(req);

    // The transaction document is written BEFORE the checkout is opened. If
    // PayChangu is reached and the response is lost, the webhook still finds a
    // record to settle against; a document written afterwards would leave a
    // paid transaction with nothing to attach it to.
    await adminDb.collection(TX_COLLECTION).doc(txRef).set({
      txRef,
      purpose,
      status: "pending",
      currency: CURRENCY,
      initiatedById: auth.uid,
      initiatedByName: prepared.initiatedByName || "",
      createdAt: FieldValue.serverTimestamp(),
      ...prepared.record,
    });

    // Mobile money paid from inside the app: PayChangu pushes a PIN prompt to
    // the phone and the app waits on /api/payments/status, so the payer never
    // leaves Acalink. Cards still need the hosted checkout below — a card
    // number is never typed into anything this product builds.
    if (purpose === "school_fee" && body.method === "mobile_money") {
      const network = String(body.network || "").toLowerCase();
      if (!["airtel", "tnm"].includes(network)) {
        return res.status(400).json({ error: "Choose Airtel Money or TNM Mpamba." });
      }
      const digits = String(body.mobile || "").replace(/\D/g, "");
      const local = digits.startsWith("265") ? digits.slice(3) : digits.replace(/^0/, "");
      if (!/^[89]\d{8}$/.test(local)) {
        return res.status(400).json({ error: "Enter the mobile money number to pay from, e.g. 0888 123 456." });
      }
      await adminDb.collection(TX_COLLECTION).doc(txRef).update({
        chargeMethod: "direct", network, payMobile: `+265${local}`, channel: "app",
      });
      const charge = await initiateMobileMoneyCharge({
        chargeId: txRef,
        mobile: local,
        operatorRefId: await mobileMoneyOperatorRef(network),
        amount: prepared.record.chargeAmount || prepared.record.amount,
        email: prepared.payer.email,
        firstName: prepared.payer.firstName,
        lastName: prepared.payer.lastName,
      });
      await adminDb.collection(TX_COLLECTION).doc(txRef).update({
        gatewayRefId: charge.refId || "",
        gatewayTransId: charge.transId || "",
        gatewayInitialStatus: charge.status || "",
      });
      return res.status(200).json({
        txRef,
        direct: true,
        operator: charge.operator,
        amount: prepared.record.amount,
        fee: prepared.record.transactionFee,
        chargeAmount: prepared.record.chargeAmount,
        currency: CURRENCY,
      });
    }

    // Bank transfer inside the app: PayChangu issues a one-off account; the
    // payer sends exactly chargeAmount to it and the app waits on the status.
    if (purpose === "school_fee" && body.method === "bank_transfer") {
      await adminDb.collection(TX_COLLECTION).doc(txRef).update({ chargeMethod: "bank_transfer", channel: "app" });
      const transfer = await initiateBankTransferCharge({
        chargeId: txRef,
        amount: prepared.record.chargeAmount || prepared.record.amount,
      });
      await adminDb.collection(TX_COLLECTION).doc(txRef).update({
        gatewayRefId: transfer.refId || "",
        bankName: transfer.bankName,
        bankAccountNumber: transfer.accountNumber,
        bankAccountName: transfer.accountName,
        bankExpiresAt: transfer.expiresAt || null,
      });
      return res.status(200).json({
        txRef,
        bankTransfer: {
          bankName: transfer.bankName,
          accountNumber: transfer.accountNumber,
          accountName: transfer.accountName,
          expiresAt: transfer.expiresAt,
          payExactly: transfer.amount,
        },
        amount: prepared.record.amount,
        fee: prepared.record.transactionFee,
        chargeAmount: prepared.record.chargeAmount,
        currency: CURRENCY,
      });
    }

    const { checkoutUrl } = await createCheckout({
      txRef,
      amount: prepared.record.chargeAmount || prepared.record.amount,
      email: prepared.payer.email,
      firstName: prepared.payer.firstName,
      lastName: prepared.payer.lastName,
      callbackUrl: `${origin}/api/payments/webhook`,
      returnUrl: `${origin}/pay/return?tx_ref=${encodeURIComponent(txRef)}`,
      title: prepared.title,
      description: prepared.description,
      meta: { txRef, purpose, schoolCode: prepared.record.schoolCode },
    });

    await adminDb.collection(TX_COLLECTION).doc(txRef).update({ checkoutUrl });

    return res.status(200).json({
      txRef,
      checkoutUrl,
      amount: prepared.record.amount,
      // Present only for a school_fee payment — a subscription has no
      // pass-through processing surcharge (see transactionFeeCore.js).
      fee: prepared.record.transactionFee,
      chargeAmount: prepared.record.chargeAmount,
      currency: CURRENCY,
    });
  } catch (err) {
    console.error("[payments] initiate failed:", err);
    return res.status(502).json({ error: err.message || "Could not start the payment." });
  }
}

// ─── School fees ─────────────────────────────────────────────────────────────

async function prepareFee({ body, auth }) {
  const studentId = String(body.studentId || "");
  if (!studentId) return { error: "No student selected." };

  const studentSnap = await adminDb.collection("students").doc(studentId).get();
  if (!studentSnap.exists) return { error: "That student record no longer exists.", status: 404 };
  const student = studentSnap.data();

  // Who is allowed to collect for this child. Staff must be finance staff of
  // that student's own school.
  //
  // A guardian session is anonymous and carries no claim tying it to a family,
  // so it is bound only to the student it names — the same standard the rules
  // apply to the parent app, and subject to the same KNOWN GAP documented at
  // the foot of firestore.rules. The exposure here is narrow and one-way: the
  // worst an unrelated session can do is pay their own money into a child's
  // fee account. It closes when parents move to Phone Auth and the phone
  // number is in the token.
  if (!auth.isAnonymous) {
    if (student.schoolCode !== auth.user?.schoolCode) {
      return { error: "That student belongs to another school.", status: 403 };
    }
    if (!FINANCE_ROLES.includes(auth.user?.role)) {
      return { error: "Only the bursar or an administrator can collect a fee payment.", status: 403 };
    }
  }

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount to pay." };
  if (amount > MAX_AMOUNT) return { error: "That amount is too large for a single payment." };

  const payerName = String(body.payerName || student.guardianName || "").trim();
  const [firstName, ...rest] = payerName.split(/\s+/).filter(Boolean);

  // The family pays the processing surcharge on top; the school is always
  // credited with the full balance they chose to pay — see
  // src/services/transactionFeeCore.js.
  const { fee, total, acalinkFee, paychanguFee } = calculateTransactionFee(amount);

  return {
    initiatedByName: auth.isAnonymous ? (payerName || "Guardian") : (auth.user?.name || "Staff"),
    payer: {
      email: String(body.payerEmail || student.guardianEmail || "").trim(),
      firstName: firstName || "Guardian",
      lastName: rest.join(" ") || student.lastName || "",
    },
    title: "School fees",
    description: `${student.fullName || "Student"} — ${body.term || "fees"}`,
    record: {
      schoolCode: student.schoolCode,
      studentId,
      studentName: student.fullName || "",
      studentCode: student.studentCode || "",
      classId: student.classId || "",
      className: student.className || "",
      campusId: student.campusId || "",
      campusName: student.campusName || "",
      term: String(body.term || ""),
      academicYear: String(body.academicYear || ""),
      note: String(body.note || "").slice(0, 300),
      amount,
      chargeAmount: total,
      transactionFee: fee,
      acalinkFee,
      paychanguFee,
      payerPhone: String(body.payerPhone || student.guardianPhone || ""),
    },
  };
}

// ─── Subscription ────────────────────────────────────────────────────────────

async function prepareSubscription({ body, auth }) {
  if (auth.isAnonymous) return { error: "Sign in as an administrator to pay a subscription.", status: 403 };
  if (!SUBSCRIPTION_ROLES.includes(auth.user?.role)) {
    return { error: "Only an administrator or director can pay the subscription.", status: 403 };
  }

  const schoolCode = auth.user.schoolCode;
  if (!schoolCode) return { error: "No school is attached to this account." };

  const schoolSnap = await adminDb.collection("schools").doc(schoolCode).get();
  const school = schoolSnap.exists ? schoolSnap.data() : {};

  // The price is recomputed here from the roll, never accepted from the
  // browser. Same pricing module the Billing page renders from, so the figure
  // the admin was shown and the figure they are charged cannot drift.
  const studentsSnap = await adminDb.collection("students").where("schoolCode", "==", schoolCode).get();
  const active = studentsSnap.docs.map((d) => d.data()).filter((s) => (s.status || "active") === "active");
  const learners = active.length;

  const q = quote({ learners, discount: school.discount });
  const amount = Math.round(q.perInvoice);

  if (amount <= 0) {
    return { error: "There is nothing to pay yet — no active learners are on the roll." };
  }

  return {
    initiatedByName: auth.user?.name || "Administrator",
    payer: {
      email: String(body.payerEmail || school.email || auth.user?.email || "").trim(),
      firstName: (auth.user?.name || "School").split(/\s+/)[0],
      lastName: (auth.user?.name || "").split(/\s+/).slice(1).join(" ") || "Administrator",
    },
    title: "Acalink subscription",
    description: `${school.name || schoolCode} — ${q.cadence.label} (${learners} learners)`,
    record: {
      schoolCode,
      schoolName: school.name || schoolCode,
      cadence: q.cadence.id,
      periodLabel: q.cadence.label,
      learners,
      ratePerLearner: q.ratePerLearner,
      amount,
    },
  };
}
