// api/whatsapp/webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// The inbound side of the WhatsApp payment bot. POST /api/whatsapp/webhook
//
// WaAPI (an unofficial WhatsApp gateway — see api/_lib/waapi.js) POSTs every
// inbound chat message here. There is no Meta "Flow" involved: the payment
// checkpoint described for the Meta Cloud API is implemented instead as a
// short chat conversation, driven entirely by the number the message actually
// arrived from.
//
// PHONE VALIDATION (the point of this whole file)
//
// A parent never types a phone number anywhere in this flow — the number is
// whichever WhatsApp account sent the message, exactly as WaAPI reports it,
// resolved from a privacy-preserving "@lid" id where WhatsApp assigns one
// instead of the plain phone-based id (see resolveLid() in api/_lib/waapi.js).
// That resolved number is matched against `students.guardianPhone`, and a
// payment is only ever opened for a student whose guardian number equals the
// sender's. There is no form field to spoof, which is the strongest version
// of the "does the submitted number match our records" check the spec asks
// for — there is simply nothing submitted to disagree with the record.
//
// Every reply is sent back to that same resolved phone number (never to the
// raw @lid id) — WaAPI addresses a phone-based id as "<digits>@c.us"
// regardless of how the inbound message identified the sender, and treats
// that as the canonical identity for the conversation either way.
//
// Every trigger — matched or not — is logged to `wa_payment_attempts` so the
// school can review who has been asking to pay and from what number, the same
// audit trail the spec asks for around mismatches.
//
// PAYING NATIVELY (no checkout link)
//
// Once a student, amount and network are agreed, api/_lib/waFeeCheckout.js
// pushes a PayChangu mobile-money PIN prompt straight to the payer's phone —
// nothing to tap out to a browser for. That kind of charge has no
// callback_url, so PayChangu never calls back to tell us what happened; this
// file polls PayChangu itself after initiating one (pollAndReport()) and
// reports the outcome in the same conversation. "CHECK" lets a parent ask
// again later if the poll window closes first.
//
// SECURITY
//
// WaAPI does not sign webhook calls. Its own documentation recommends putting
// a secret in the webhook URL and checking it server-side — that is `token`
// below, compared against WAAPI_WEBHOOK_TOKEN. Register the webhook with
// WaAPI as:
//
//   https://<your-deployment>/api/whatsapp/webhook?token=<WAAPI_WEBHOOK_TOKEN>
//
// Always answers 200 once a message has been read, even when a downstream
// step failed — a webhook that 500s gets retried, and a retry storm against a
// bot conversation would mean the parent gets asked the same question twice.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import {
  sendWhatsAppText, phoneFromChatId, resolveLid, isConfigured as waConfigured,
} from "../_lib/waapi.js";
import { findStudentsByGuardianPhone, computeStudentBalance } from "../_lib/feeBalance.js";
import { getSession, setSession, clearSession } from "../_lib/waSession.js";
import { openWhatsAppDirectCharge, openWhatsAppFeeCheckout } from "../_lib/waFeeCheckout.js";
import { settleTransaction, TX_COLLECTION } from "../_lib/settle.js";
import { normalisePhone } from "../../src/services/phone.js";
import { isGuardianPhone } from "../../src/services/guardians.js";
import { handleGuardianSend } from "../_lib/guardianSend.js";
import { parseParentCommand, startParentCommand, continueParentSession } from "../_lib/waParent.js";
import { calculateTransactionFee } from "../../src/services/transactionFeeCore.js";
import { parsePayNumber, numberFitsNetwork, localDisplay, NETWORK_LABEL } from "../../src/services/waPayCore.js";

const ATTEMPTS = "wa_payment_attempts";

/** Anything reasonably close to "I want to pay" starts the flow. */
const TRIGGER_RE = /\b(make\s*a?\s*payment|pay\s*(my\s*)?fees?|pay\s*now|i\s*want\s*to\s*pay)\b/i;
const YES_RE = /^\s*(yes|y|confirm|full|all|pay)\s*$/i;
const NO_RE = /^\s*(no|n|cancel|stop)\s*$/i;
const CHECK_RE = /^\s*check\s*$/i;
/** Opting out of, and back into, the school's WhatsApp alerts. */
const STOP_RE = /^\s*(stop|unsubscribe|imani)\s*$/i;
const START_RE = /^\s*(start|subscribe|yambani)\s*$/i;
const AIRTEL_RE = /^\s*(1|airtel)\s*$/i;
const TNM_RE = /^\s*(2|tnm|mpamba)\s*$/i;
const CARD_RE = /^\s*(3|card|bank)\s*$/i;

/** Mirrors the single-payment ceiling in api/payments/initiate.js. */
const MAX_AMOUNT = 50_000_000;

/**
 * A direct charge has no callback_url (see api/_lib/paychangu.js) — the only
 * way to know what happened is to poll PayChangu ourselves. Bounded well
 * inside the 60s function timeout (vercel.json) so the response still
 * completes; CHECK (below) covers whatever this window doesn't catch.
 */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 13;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-MW", { maximumFractionDigits: 0 });
}

function parseAmount(text) {
  const cleaned = String(text || "").replace(/[,\sA-Za-z]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

/** Constant-time-ish comparison — the token is short-lived secret material. */
function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function reply(phone, text) {
  try {
    await sendWhatsAppText(phone, text);
  } catch (err) {
    console.error("[whatsapp] could not send reply to", phone, err);
  }
}

async function logAttempt({ senderPhone, matchedStudentIds, outcome }) {
  try {
    await adminDb.collection(ATTEMPTS).add({
      senderPhone,
      matchedStudentIds: matchedStudentIds || [],
      outcome,
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[whatsapp] could not log payment attempt:", err);
  }
}

function askAmountText(student, balance) {
  const age = balance.oldestUnpaidTerm ? ` (outstanding since ${balance.oldestUnpaidTerm})` : "";
  return `${student.fullName || "Your child"} has an outstanding balance of MK ${fmt(balance.balance)}${age}. `
    + `Reply with the amount you'd like to pay, or YES to pay it all.`;
}

async function loadStudent(id) {
  const snap = await adminDb.collection("students").doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Re-checked immediately before a charge is opened, not just when the flow
 * started — a session can sit for several minutes, long enough for a record
 * to be edited, and the charge must never be opened against a stale match.
 */
async function stillOwnsStudent(senderPhone, student) {
  return isGuardianPhone(student, senderPhone);
}

// ─── The conversation ────────────────────────────────────────────────────────

async function startPaymentFlow(senderPhone) {
  const students = await findStudentsByGuardianPhone(senderPhone);

  if (students.length === 0) {
    await logAttempt({ senderPhone, matchedStudentIds: [], outcome: "no_student_for_number" });
    await reply(senderPhone,
      "This number isn't registered as a parent/guardian contact for any student on Acalink. "
      + "Please contact your school's office to update the number on file.");
    return;
  }

  await logAttempt({ senderPhone, matchedStudentIds: students.map((s) => s.id), outcome: "matched" });

  const withBalance = [];
  for (const s of students) {
    const balance = await computeStudentBalance(s);
    if (balance && balance.balance > 0) withBalance.push({ student: s, balance });
  }

  if (withBalance.length === 0) {
    const names = students.map((s) => s.fullName || "your child").join(", ");
    await reply(senderPhone, `Good news — there's no outstanding balance for ${names}.`);
    return;
  }

  if (withBalance.length === 1) {
    const { student, balance } = withBalance[0];
    await setSession(senderPhone, { awaiting: "amount", studentId: student.id, balance: balance.balance });
    await reply(senderPhone, askAmountText(student, balance));
    return;
  }

  const options = withBalance.map(({ student, balance }, i) => ({
    index: i + 1, studentId: student.id, balance: balance.balance,
    name: student.fullName || `Student ${i + 1}`,
  }));
  await setSession(senderPhone, { awaiting: "select", options });
  const lines = options.map((o) => `${o.index}) ${o.name} — MK ${fmt(o.balance)} owing`);
  await reply(senderPhone,
    `You have more than one child with an outstanding balance. Reply with a number:\n\n${lines.join("\n")}`);
}

async function handleSelect(senderPhone, text, session) {
  const n = parseInt(String(text).trim(), 10);
  const chosen = (session.options || []).find((o) => o.index === n);
  if (!chosen) {
    await reply(senderPhone, "Please reply with just the number next to your child's name.");
    return;
  }
  const student = await loadStudent(chosen.studentId);
  if (!student) {
    await clearSession(senderPhone);
    await reply(senderPhone, "Sorry, that record could not be found. Please try again.");
    return;
  }
  await setSession(senderPhone, { awaiting: "amount", studentId: student.id, balance: chosen.balance });
  await reply(senderPhone, askAmountText(student, { balance: chosen.balance }));
}

async function handleAmount(senderPhone, text, session) {
  const amount = YES_RE.test(text) ? session.balance : parseAmount(text);

  if (!amount || amount <= 0) {
    await reply(senderPhone,
      "Sorry, I didn't understand that. Reply with a number (e.g. 20000) or YES to pay the full balance.");
    return;
  }
  if (amount > MAX_AMOUNT) {
    await reply(senderPhone,
      "That amount is too large for a single WhatsApp payment — please use the Acalink app or contact the school office.");
    return;
  }

  const student = await loadStudent(session.studentId);
  if (!student) {
    await clearSession(senderPhone);
    await reply(senderPhone, "Sorry, that record could not be found.");
    return;
  }
  if (!(await stillOwnsStudent(senderPhone, student))) {
    await clearSession(senderPhone);
    await logAttempt({ senderPhone, matchedStudentIds: [student.id], outcome: "mismatch_at_amount" });
    await reply(senderPhone, "This number is not registered to this student. Please contact the school office.");
    return;
  }

  const { fee, total } = calculateTransactionFee(amount);
  await setSession(senderPhone, { awaiting: "confirm", studentId: student.id, amount });
  await reply(senderPhone,
    `Confirm: pay MK ${fmt(amount)} for ${student.fullName || "your child"}'s school fees?\n\n`
    + `Fees: MK ${fmt(amount)}\nTransaction fee: MK ${fmt(fee)}\nTotal to pay: MK ${fmt(total)}\n\n`
    + `Reply YES to confirm or CANCEL to stop.`);
}

async function handleConfirm(senderPhone, text, session) {
  if (!YES_RE.test(text)) {
    await reply(senderPhone, "Reply YES to confirm, or CANCEL to stop.");
    return;
  }

  const student = await loadStudent(session.studentId);
  if (!student) {
    await clearSession(senderPhone);
    await reply(senderPhone, "Sorry, that record could not be found.");
    return;
  }
  if (!(await stillOwnsStudent(senderPhone, student))) {
    await clearSession(senderPhone);
    await logAttempt({ senderPhone, matchedStudentIds: [student.id], outcome: "mismatch_at_confirm" });
    await reply(senderPhone, "This number is not registered to this student. Please contact the school office.");
    return;
  }

  await setSession(senderPhone, { awaiting: "network", studentId: student.id, amount: session.amount });
  await reply(senderPhone,
    "How would you like to pay?\n\n1) Airtel Money\n2) TNM Mpamba\n3) Card or bank transfer");
}

/**
 * Polls a just-initiated direct charge and reports the outcome in the same
 * conversation, since there is no webhook to wait on for this kind of
 * transaction — see the comment on the direct-charge functions in
 * api/_lib/paychangu.js. Settlement itself goes through the exact same
 * idempotent settleTransaction() the PayChangu webhook uses, so nothing about
 * how a payment is recorded differs between the two payment paths.
 */
async function pollAndReport(senderPhone, txRef, operatorName) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await sleep(POLL_INTERVAL_MS);

    let result;
    try {
      result = await settleTransaction(txRef);
    } catch (err) {
      console.error("[whatsapp] poll failed for", txRef, err);
      continue;
    }

    if (result.status === "success") {
      const receipt = result.receiptNo ? ` Receipt: ${result.receiptNo}.` : "";
      await reply(senderPhone, `Payment received — thank you!${receipt}`);
      return;
    }
    if (result.status === "failed") {
      await reply(senderPhone,
        `That payment didn't go through. Reply "Make Payment" to try again.`);
      return;
    }
    // Still pending — keep polling.
  }

  await reply(senderPhone,
    `Still waiting to hear back from ${operatorName || "your mobile money provider"} — `
    + `if you haven't approved the prompt on your phone yet, do that now. Reply CHECK in a minute either way.`);
}

async function handleNetwork(senderPhone, text, session) {
  const network = AIRTEL_RE.test(text) ? "airtel" : TNM_RE.test(text) ? "tnm" : CARD_RE.test(text) ? "card" : null;
  if (!network) {
    await reply(senderPhone, "Please reply 1 for Airtel Money, 2 for TNM Mpamba, or 3 for card/bank.");
    return;
  }

  const student = await loadStudent(session.studentId);
  if (!student) {
    await clearSession(senderPhone);
    await reply(senderPhone, "Sorry, that record could not be found.");
    return;
  }
  if (!(await stillOwnsStudent(senderPhone, student))) {
    await clearSession(senderPhone);
    await logAttempt({ senderPhone, matchedStudentIds: [student.id], outcome: "mismatch_at_network" });
    await reply(senderPhone, "This number is not registered to this student. Please contact the school office.");
    return;
  }

  // Card and bank transfer need a PCI-compliant page to type a card number
  // into — this product never builds that itself (see api/_lib/paychangu.js) —
  // so that one case still hands off to PayChangu's hosted checkout link,
  // settled the normal webhook-driven way rather than polled.
  if (network === "card") {
    // Cleared before charging, not after: a WaAPI retry of this same message
    // finding no session in "network" state can't trigger a second charge.
    await clearSession(senderPhone);
    try {
      const { checkoutUrl, chargeAmount } = await openWhatsAppFeeCheckout({
        student, amount: session.amount, payerPhone: senderPhone,
      });
      await reply(senderPhone,
        `Tap this secure link to pay MK ${fmt(chargeAmount)}:\n${checkoutUrl}\n\nYou'll get a message here once it's confirmed.`);
    } catch (err) {
      console.error("[whatsapp] could not open checkout:", err);
      await reply(senderPhone, "Sorry, we couldn't start that payment right now. Please try again shortly or use the Acalink app.");
    }
    return;
  }

  // Mobile money: ask which number the payment will come from before anything
  // is charged — see src/services/waPayCore.js.
  await setSession(senderPhone, { awaiting: "number", studentId: student.id, amount: session.amount, network });
  await reply(senderPhone,
    `Which ${NETWORK_LABEL[network]} number will you pay from?\n\n`
    + `Reply with the number (e.g. 0991234567), or reply SAME to use this WhatsApp number (${localDisplay(senderPhone)}).`);
}

/** Asks the parent to confirm the number back, then — and only then — charges. */
async function askToConfirmNumber(senderPhone, session, mobile) {
  const { total } = calculateTransactionFee(session.amount);
  await setSession(senderPhone, { ...session, awaiting: "confirm_number", mobile });
  await reply(senderPhone,
    `We'll send a payment request of MK ${fmt(total)} to *${localDisplay(mobile)}* (${NETWORK_LABEL[session.network]}).\n\n`
    + `Reply YES to send it, send a different number to change it, or CANCEL to stop.`);
}

async function handleNumber(senderPhone, text, session) {
  const parsed = parsePayNumber(text, senderPhone);
  if (!parsed.ok) {
    await reply(senderPhone,
      `That doesn't look like a Malawian mobile money number. Reply with it like 0991234567, or SAME to use this WhatsApp number.`);
    return;
  }
  if (!numberFitsNetwork(parsed.mobile, session.network)) {
    const other = session.network === "airtel" ? "TNM Mpamba" : "Airtel Money";
    await reply(senderPhone,
      `${localDisplay(parsed.mobile)} looks like a ${other} number, but you chose ${NETWORK_LABEL[session.network]}. `
      + `Send a ${NETWORK_LABEL[session.network]} number, or reply CANCEL and start again to choose ${other}.`);
    return;
  }
  await askToConfirmNumber(senderPhone, session, parsed.mobile);
}

async function handleConfirmNumber(senderPhone, text, session) {
  if (!YES_RE.test(text)) {
    // Anything else that reads as a number replaces the one on screen.
    const parsed = parsePayNumber(text, senderPhone);
    if (parsed.ok && !/^\s*1\s*$/.test(text)) {
      if (!numberFitsNetwork(parsed.mobile, session.network)) return handleNumber(senderPhone, text, session);
      return askToConfirmNumber(senderPhone, session, parsed.mobile);
    }
    await reply(senderPhone, "Reply YES to send the request, send a different number, or CANCEL to stop.");
    return;
  }

  const student = await loadStudent(session.studentId);
  if (!student) {
    await clearSession(senderPhone);
    await reply(senderPhone, "Sorry, that record could not be found.");
    return;
  }
  if (!(await stillOwnsStudent(senderPhone, student))) {
    await clearSession(senderPhone);
    await logAttempt({ senderPhone, matchedStudentIds: [student.id], outcome: "mismatch_at_number" });
    await reply(senderPhone, "This number is not registered to this student. Please contact the school office.");
    return;
  }

  // Cleared before charging, not after: a WaAPI retry of this same message
  // finding no session in "confirm_number" state can't trigger a second charge.
  await clearSession(senderPhone);

  try {
    const { txRef, chargeAmount, operatorName } = await openWhatsAppDirectCharge({
      student, amount: session.amount, payerPhone: senderPhone, network: session.network, mobile: session.mobile,
    });
    await reply(senderPhone,
      `Sending a request for MK ${fmt(chargeAmount)} to ${localDisplay(session.mobile)} via ${operatorName || NETWORK_LABEL[session.network]}. `
      + `Enter your mobile money PIN when prompted to approve it.`);
    await pollAndReport(senderPhone, txRef, operatorName);
  } catch (err) {
    console.error("[whatsapp] could not start direct charge:", err);
    await reply(senderPhone, "Sorry, we couldn't start that payment right now. Please try again shortly or use the Acalink app.");
  }
}

/**
 * An out-of-band re-check, for whenever the poll window in pollAndReport()
 * closes before an answer arrives — a slow PIN entry, a dropped connection —
 * or a WaAPI retry cut the original reply short. Reuses the same
 * settleTransaction() as everything else, so it can never disagree with what
 * the bursar's own records already show.
 */
async function handleCheckCommand(senderPhone) {
  const snap = await adminDb.collection(TX_COLLECTION)
    .where("payerPhone", "==", senderPhone)
    .where("channel", "==", "whatsapp")
    .where("status", "==", "pending")
    .get();

  if (snap.empty) {
    await reply(senderPhone, "There's no pending WhatsApp payment to check right now.");
    return;
  }

  // Most recent first — sorted here rather than in the query, which would
  // need a composite index for an equality filter plus an orderBy.
  const docs = snap.docs.sort(
    (a, b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0),
  );

  let result;
  try {
    result = await settleTransaction(docs[0].id);
  } catch (err) {
    console.error("[whatsapp] CHECK failed:", err);
    await reply(senderPhone, "Couldn't check that just now — please try again shortly.");
    return;
  }

  if (result.status === "success") {
    const receipt = result.receiptNo ? ` Receipt: ${result.receiptNo}.` : "";
    await reply(senderPhone, `Payment received — thank you!${receipt}`);
  } else if (result.status === "failed") {
    await reply(senderPhone, `That payment didn't go through. Reply "Make Payment" to try again.`);
  } else {
    await reply(senderPhone, "Still pending — reply CHECK again in a minute.");
  }
}

/**
 * A guardian who replies STOP stops receiving the school's alerts. This is not
 * a courtesy: the alerts go out from one real WhatsApp number, and a number
 * that people report as spam gets banned, taking every school's alerts down
 * with it. The delivery function (functions/index.js) checks this list before
 * every guardian message.
 *
 * STOP only counts when no payment conversation is open, because "stop" is also
 * how someone abandons a half-finished payment (NO_RE below).
 */
async function optOut(senderPhone) {
  await adminDb.collection("wa_optouts").doc(senderPhone.replace(/[^\d]/g, "")).set({
    phone: senderPhone, optedOutAt: new Date(),
  });
  await reply(senderPhone,
    "You will no longer receive WhatsApp alerts from your school. Reply START to receive them again.\n\n"
    + "Simudzalandiranso mauthenga a sukulu pa WhatsApp. Tumizani START kuti mulandirenso.");
}

async function optIn(senderPhone) {
  const ref = adminDb.collection("wa_optouts").doc(senderPhone.replace(/[^\d]/g, ""));
  if (!(await ref.get()).exists) return;             // never opted out: stay silent
  await ref.delete();
  await reply(senderPhone,
    "Welcome back. You will receive your school's WhatsApp alerts again.\n\n"
    + "Zikomo, mudzalandiranso mauthenga a sukulu pa WhatsApp.");
}

async function route(senderPhone, text) {
  if (STOP_RE.test(text) && !(await getSession(senderPhone))) return optOut(senderPhone);
  if (START_RE.test(text)) return optIn(senderPhone);

  if (NO_RE.test(text)) {
    const had = await getSession(senderPhone);
    if (had) {
      await clearSession(senderPhone);
      await reply(senderPhone, "Okay, cancelled.");
    }
    return;
  }

  // A menu word (RESULTS, ATTENDANCE, HOMEWORK…) always wins, even mid-way
  // through a payment: it abandons that conversation, which expires on its own.
  const parentCommand = parseParentCommand(text);
  if (parentCommand) return startParentCommand(senderPhone, parentCommand, (p, t) => reply(p, t));

  const session = await getSession(senderPhone);

  if (session?.awaiting === "info_child" || session?.awaiting === "info_term") {
    return continueParentSession(senderPhone, text, session, (p, t) => reply(p, t));
  }
  if (session?.awaiting === "select") return handleSelect(senderPhone, text, session);
  if (session?.awaiting === "amount") return handleAmount(senderPhone, text, session);
  if (session?.awaiting === "confirm") return handleConfirm(senderPhone, text, session);
  if (session?.awaiting === "network") return handleNetwork(senderPhone, text, session);
  if (session?.awaiting === "number") return handleNumber(senderPhone, text, session);
  if (session?.awaiting === "confirm_number") return handleConfirmNumber(senderPhone, text, session);

  if (CHECK_RE.test(text)) return handleCheckCommand(senderPhone);
  if (TRIGGER_RE.test(text)) return startPaymentFlow(senderPhone);

  // No active conversation and no trigger phrase or menu word: stay silent. This
  // is not a general assistant — replying to every stray message sent to this
  // number would be noise, not help.
  return undefined;
}

// Guardian sends can take a while (about two messages a second).
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // The teacher-facing guardian sends (attendance, discipline, homework) share
  // this function so the project stays under the Hobby plan's 12-function
  // limit. They authenticate with the teacher's Firebase login, not the
  // webhook token.
  if (req.query?.action === "send") return handleGuardianSend(req, res);

  const expected = process.env.WAAPI_WEBHOOK_TOKEN;
  const given = String(req.query?.token || "");
  if (!expected || !tokenMatches(given, expected)) {
    return res.status(403).json({ error: "Invalid webhook token." });
  }

  if (!waConfigured()) {
    console.warn("[whatsapp] webhook received but WAAPI_API_TOKEN/WAAPI_INSTANCE_ID are not set.");
    return res.status(200).json({ ok: true });
  }

  const body = readBody(req);
  if (body?.event && body.event !== "message") return res.status(200).json({ ok: true });

  const message = body?.data?.message || body?.message;
  if (!message || message.fromMe || (message.type && message.type !== "chat")) {
    return res.status(200).json({ ok: true });
  }

  const rawFrom = String(message.from || "");
  const text = String(message.body || "").trim();
  if (!rawFrom || !text) return res.status(200).json({ ok: true });

  try {
    // A privacy-preserving "@lid" id hides the real number until asked of
    // WhatsApp — see resolveLid() in api/_lib/waapi.js. Without a real number
    // there is nothing to match against `guardianPhone`, so the message is
    // acknowledged and dropped rather than crashing the webhook.
    const resolved = await resolveLid(rawFrom);
    const senderPhone = normalisePhone(phoneFromChatId(resolved));
    if (!senderPhone) return res.status(200).json({ ok: true });

    console.log("[whatsapp] inbound from", senderPhone, JSON.stringify(text.slice(0, 60)));
    await route(senderPhone, text);
  } catch (err) {
    console.error("[whatsapp] webhook handling failed:", err);
  }

  return res.status(200).json({ ok: true });
}