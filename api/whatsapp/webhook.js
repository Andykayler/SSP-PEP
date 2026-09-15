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
// whichever WhatsApp account sent the message, exactly as WaAPI reports it
// (resolved from a privacy-preserving "@lid" id where needed — see
// resolveLid() in api/_lib/waapi.js). That is matched against
// `students.guardianPhone`, and a payment is only ever opened for a student
// whose guardian number equals the sender's. There is no form field to spoof,
// which is the strongest version of the "does the submitted number match our
// records" check the spec asks for — there is simply nothing submitted to
// disagree with the record.
//
// Every trigger — matched or not — is logged to `wa_payment_attempts` so the
// school can review who has been asking to pay and from what number, the same
// audit trail the spec asks for around mismatches.
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
  sendWhatsAppToChatId, phoneFromChatId, resolveLid, isConfigured as waConfigured,
} from "../_lib/waapi.js";
import { findStudentsByGuardianPhone, computeStudentBalance } from "../_lib/feeBalance.js";
import { getSession, setSession, clearSession } from "../_lib/waSession.js";
import { openWhatsAppFeeCheckout } from "../_lib/waFeeCheckout.js";
import { normalisePhone } from "../../src/services/phone.js";

const ATTEMPTS = "wa_payment_attempts";

/** Anything reasonably close to "I want to pay" starts the flow. */
const TRIGGER_RE = /\b(make\s*a?\s*payment|pay\s*(my\s*)?fees?|pay\s*now|i\s*want\s*to\s*pay)\b/i;
const YES_RE = /^\s*(yes|y|confirm|full|all|pay)\s*$/i;
const NO_RE = /^\s*(no|n|cancel|stop)\s*$/i;

/** Mirrors the single-payment ceiling in api/payments/initiate.js. */
const MAX_AMOUNT = 50_000_000;

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

/**
 * Always replies to the raw chat id the message arrived on (lid or c.us) —
 * never to a phone number reconstructed as "<number>@c.us". For an
 * @lid-addressed sender those are not the same conversation; see
 * sendWhatsAppToChatId() in api/_lib/waapi.js.
 */
async function reply(chatId, text) {
  try {
    await sendWhatsAppToChatId(chatId, text);
  } catch (err) {
    console.error("[whatsapp] could not send reply to", chatId, err);
  }
}

async function logAttempt({ chatId, senderPhone, matchedStudentIds, outcome }) {
  try {
    await adminDb.collection(ATTEMPTS).add({
      chatId,
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
  return normalisePhone(student.guardianPhone) === senderPhone;
}

// ─── The conversation ────────────────────────────────────────────────────────
//
// Every step is keyed on `chatId` — the raw WhatsApp identity the message
// arrived on (lid or c.us) — since that is what stays constant for a reply
// and for the session across a multi-turn conversation. `phone`, the number
// resolved once at the top of handler() (see resolveLid() in api/_lib/waapi.js),
// is threaded alongside it purely for matching against `students.guardianPhone`
// and is cached in the session so later turns never need to re-resolve it.

async function startPaymentFlow(chatId, phone) {
  const students = await findStudentsByGuardianPhone(phone);

  if (students.length === 0) {
    await logAttempt({ chatId, senderPhone: phone, matchedStudentIds: [], outcome: "no_student_for_number" });
    await reply(chatId,
      "This number isn't registered as a parent/guardian contact for any student on Acalink. "
      + "Please contact your school's office to update the number on file.");
    return;
  }

  await logAttempt({
    chatId, senderPhone: phone, matchedStudentIds: students.map((s) => s.id), outcome: "matched",
  });

  const withBalance = [];
  for (const s of students) {
    const balance = await computeStudentBalance(s);
    if (balance && balance.balance > 0) withBalance.push({ student: s, balance });
  }

  if (withBalance.length === 0) {
    const names = students.map((s) => s.fullName || "your child").join(", ");
    await reply(chatId, `Good news — there's no outstanding balance for ${names}.`);
    return;
  }

  if (withBalance.length === 1) {
    const { student, balance } = withBalance[0];
    await setSession(chatId, { phone, awaiting: "amount", studentId: student.id, balance: balance.balance });
    await reply(chatId, askAmountText(student, balance));
    return;
  }

  const options = withBalance.map(({ student, balance }, i) => ({
    index: i + 1, studentId: student.id, balance: balance.balance,
    name: student.fullName || `Student ${i + 1}`,
  }));
  await setSession(chatId, { phone, awaiting: "select", options });
  const lines = options.map((o) => `${o.index}) ${o.name} — MK ${fmt(o.balance)} owing`);
  await reply(chatId,
    `You have more than one child with an outstanding balance. Reply with a number:\n\n${lines.join("\n")}`);
}

async function handleSelect(chatId, text, session) {
  const n = parseInt(String(text).trim(), 10);
  const chosen = (session.options || []).find((o) => o.index === n);
  if (!chosen) {
    await reply(chatId, "Please reply with just the number next to your child's name.");
    return;
  }
  const student = await loadStudent(chosen.studentId);
  if (!student) {
    await clearSession(chatId);
    await reply(chatId, "Sorry, that record could not be found. Please try again.");
    return;
  }
  await setSession(chatId, {
    phone: session.phone, awaiting: "amount", studentId: student.id, balance: chosen.balance,
  });
  await reply(chatId, askAmountText(student, { balance: chosen.balance }));
}

async function handleAmount(chatId, text, session) {
  const amount = YES_RE.test(text) ? session.balance : parseAmount(text);

  if (!amount || amount <= 0) {
    await reply(chatId,
      "Sorry, I didn't understand that. Reply with a number (e.g. 20000) or YES to pay the full balance.");
    return;
  }
  if (amount > MAX_AMOUNT) {
    await reply(chatId,
      "That amount is too large for a single WhatsApp payment — please use the Acalink app or contact the school office.");
    return;
  }

  const student = await loadStudent(session.studentId);
  if (!student) {
    await clearSession(chatId);
    await reply(chatId, "Sorry, that record could not be found.");
    return;
  }
  if (!(await stillOwnsStudent(session.phone, student))) {
    await clearSession(chatId);
    await logAttempt({
      chatId, senderPhone: session.phone, matchedStudentIds: [student.id], outcome: "mismatch_at_amount",
    });
    await reply(chatId, "This number is not registered to this student. Please contact the school office.");
    return;
  }

  await setSession(chatId, { phone: session.phone, awaiting: "confirm", studentId: student.id, amount });
  await reply(chatId,
    `Confirm: pay MK ${fmt(amount)} for ${student.fullName || "your child"}'s school fees? `
    + `Reply YES to confirm or CANCEL to stop.`);
}

async function handleConfirm(chatId, text, session) {
  if (!YES_RE.test(text)) {
    await reply(chatId, "Reply YES to confirm, or CANCEL to stop.");
    return;
  }

  const student = await loadStudent(session.studentId);
  if (!student) {
    await clearSession(chatId);
    await reply(chatId, "Sorry, that record could not be found.");
    return;
  }
  if (!(await stillOwnsStudent(session.phone, student))) {
    await clearSession(chatId);
    await logAttempt({
      chatId, senderPhone: session.phone, matchedStudentIds: [student.id], outcome: "mismatch_at_confirm",
    });
    await reply(chatId, "This number is not registered to this student. Please contact the school office.");
    return;
  }

  await clearSession(chatId);
  try {
    const { checkoutUrl, amount } = await openWhatsAppFeeCheckout({
      student, amount: session.amount, payerPhone: session.phone,
    });
    await reply(chatId,
      `Tap this secure link to pay MK ${fmt(amount)}:\n${checkoutUrl}\n\nYou'll get a message here once it's confirmed.`);
  } catch (err) {
    console.error("[whatsapp] could not open checkout:", err);
    await reply(chatId, "Sorry, we couldn't start that payment right now. Please try again shortly or use the Acalink app.");
  }
}

async function route(chatId, phone, text) {
  if (NO_RE.test(text)) {
    const had = await getSession(chatId);
    if (had) {
      await clearSession(chatId);
      await reply(chatId, "Okay, cancelled.");
    }
    return;
  }

  const session = await getSession(chatId);

  if (session?.awaiting === "select") return handleSelect(chatId, text, session);
  if (session?.awaiting === "amount") return handleAmount(chatId, text, session);
  if (session?.awaiting === "confirm") return handleConfirm(chatId, text, session);

  if (TRIGGER_RE.test(text)) return startPaymentFlow(chatId, phone);

  // No active conversation and no trigger phrase: stay silent. This is a
  // payment bot, not a general assistant — replying to every stray message
  // sent to this number would be noise, not help.
  return undefined;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  const chatId = String(message.from || "");
  const text = String(message.body || "").trim();
  if (!chatId || !text) return res.status(200).json({ ok: true });

  try {
    // A privacy-preserving "@lid" id hides the real number until asked of
    // WhatsApp — see resolveLid() in api/_lib/waapi.js. Without a real number
    // there is nothing to match against `guardianPhone`, so the message is
    // acknowledged and dropped rather than crashing the webhook.
    const resolved = await resolveLid(chatId);
    const phone = normalisePhone(phoneFromChatId(resolved));
    if (!phone) return res.status(200).json({ ok: true });

    await route(chatId, phone, text);
  } catch (err) {
    console.error("[whatsapp] webhook handling failed:", err);
  }

  return res.status(200).json({ ok: true });
}
