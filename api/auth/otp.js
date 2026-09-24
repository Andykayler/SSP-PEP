// api/auth/otp.js
// ─────────────────────────────────────────────────────────────────────────────
// A six-digit code sent over WhatsApp: proof that the person signing in — or
// adding a number to their account — holds that phone.
//
//   POST /api/auth/otp   { action: "request", purpose, phone? }
//   POST /api/auth/otp   { action: "verify",  purpose, code }
//
//   purpose = "login"          the second step of a two-step sign-in
//           = "enable_2fa"     turn two-step sign-in on (needs a phone)
//           = "disable_2fa"    turn it off
//           = "verify_phone"   confirm a number so alerts can be sent to it
//
// WHAT THIS DOES AND DOES NOT GUARANTEE
//
// The code is generated, hashed, expired, rate-limited and checked here, on the
// server, so it cannot be guessed or read back from the browser. But the
// sign-in itself is a Firebase password sign-in that has already succeeded by
// the time this runs; the browser is what holds the user at the code screen. A
// caller who skipped the sign-in page and used the Firebase SDK directly would
// not be stopped by this. It is a strong second factor for the ordinary
// person at the sign-in page, not a substitute for enforcing MFA inside
// Firebase Auth (which needs the Identity Platform upgrade). See
// docs/whatsapp-first-notifications.md.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { adminAuth, adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import { sendEmail, appUrl } from "../_lib/email.js";
import { verificationEmail, newRegistrationEmail } from "../_lib/emailTemplates.js";
import { readBody, requireStaff } from "../_lib/auth.js";
import { sendWhatsAppText, isConfigured as waConfigured } from "../_lib/waapi.js";
import { normalisePhone } from "../../src/services/phone.js";

const COLLECTION = "otp_challenges";
const PURPOSES = ["login", "enable_2fa", "disable_2fa", "verify_phone"];
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CHECKS = 5;
const MAX_REQUESTS_PER_HOUR = 5;

const hashCode = (uid, code) =>
  createHash("sha256").update(`${uid}:${code}:${process.env.OTP_PEPPER || "acalink"}`).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const maskPhone = (p) => (p && p.length > 6 ? `${p.slice(0, 4)}•••••${p.slice(-2)}` : "your phone");

async function request({ uid, user, purpose, body }, res) {
  if (!waConfigured()) {
    return res.status(503).json({ error: "WhatsApp isn't set up for this deployment, so a code can't be sent." });
  }

  // Which number does the code go to? A login/disable goes to the number already
  // on the account. Enabling, or verifying a number, goes to the one being added.
  let phone;
  if (purpose === "login" || purpose === "disable_2fa") {
    if (!user.twoFactor) {
      return res.status(400).json({ error: "Two-step sign-in isn't turned on for this account." });
    }
    phone = normalisePhone(user.phone || "");
  } else {
    phone = normalisePhone(body.phone || "");
  }
  if (!/^\+\d{9,15}$/.test(phone)) {
    return res.status(400).json({ error: "Enter a valid WhatsApp number, for example 0991234567." });
  }

  const ref = adminDb.collection(COLLECTION).doc(uid);
  const existing = (await ref.get()).data() || {};

  const hourAgo = Date.now() - 3_600_000;
  const recent = (existing.requestedAt || []).filter((t) => t > hourAgo);
  if (recent.length >= MAX_REQUESTS_PER_HOUR) {
    return res.status(429).json({ error: "Too many codes requested. Try again in a while." });
  }

  const code = String(randomInt(100000, 1000000));
  await ref.set({
    uid, purpose, phone,
    hash: hashCode(uid, code),
    checks: 0,
    expiresAt: Date.now() + CODE_TTL_MS,
    requestedAt: [...recent, Date.now()],
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    await sendWhatsAppText(
      phone,
      `*${code}* is your Acalink verification code.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this message and don't share the code.`,
    );
  } catch (err) {
    console.error("[otp] WhatsApp send failed:", err);
    await ref.delete().catch(() => {});
    return res.status(502).json({ error: "Couldn't send the code on WhatsApp. Check the number and try again." });
  }

  return res.status(200).json({ sent: true, to: maskPhone(phone), expiresInSeconds: CODE_TTL_MS / 1000 });
}

async function verify({ uid, purpose, body }, res) {
  const ref = adminDb.collection(COLLECTION).doc(uid);
  const snap = await ref.get();
  const c = snap.data();

  if (!c || c.purpose !== purpose) {
    return res.status(400).json({ error: "Ask for a new code first." });
  }
  if (Date.now() > c.expiresAt) {
    await ref.delete().catch(() => {});
    return res.status(400).json({ error: "That code has expired. Ask for a new one." });
  }
  if (c.checks >= MAX_CHECKS) {
    await ref.delete().catch(() => {});
    return res.status(429).json({ error: "Too many wrong tries. Ask for a new code." });
  }

  const given = String(body.code || "").replace(/\D/g, "");
  if (!safeEqual(hashCode(uid, given), c.hash)) {
    await ref.update({ checks: FieldValue.increment(1) });
    return res.status(400).json({ error: "That code isn't right." });
  }

  await ref.delete();

  // The proof succeeded: apply what it was for.
  const userRef = adminDb.collection("users").doc(uid);
  const now = FieldValue.serverTimestamp();
  if (purpose === "login") {
    await userRef.update({ mfaVerifiedAt: now });
  } else if (purpose === "enable_2fa") {
    await userRef.update({ phone: c.phone, whatsappAlerts: true, twoFactor: true, mfaVerifiedAt: now, updatedAt: now });
  } else if (purpose === "disable_2fa") {
    await userRef.update({ twoFactor: false, updatedAt: now });
  } else if (purpose === "verify_phone") {
    await userRef.update({ phone: c.phone, whatsappAlerts: true, phoneVerifiedAt: now, updatedAt: now });
  }

  return res.status(200).json({ ok: true, purpose });
}

// ─── Email: verification, and telling the platform owner about a new school ──
// These live here, beside the phone-verification codes, because both are
// "prove who you are" steps of an account — and because Vercel's Hobby plan
// allows 12 functions, so new server work joins an existing one.

/**
 * Sends the caller a branded "confirm your email" message. The link opens our
 * own /verify-email page (not Firebase's generic handler), which applies the
 * code and says so in Acalink's look.
 */
async function sendVerification({ uid, user }, res) {
  const record = await adminAuth.getUser(uid);
  if (!record.email) return res.status(400).json({ error: "This account has no email address." });
  if (record.emailVerified) return res.status(200).json({ ok: true, alreadyVerified: true });

  const firebaseLink = await adminAuth.generateEmailVerificationLink(record.email);
  const code = new URL(firebaseLink).searchParams.get("oobCode");
  const link = `${appUrl()}/verify-email?code=${encodeURIComponent(code)}`;

  const mail = verificationEmail({ name: user.name || record.displayName || "", link, appUrl: appUrl() });
  const sent = await sendEmail({ to: record.email, ...mail, tag: "verify_email" });
  if (!sent.ok) return res.status(503).json({ error: "Email isn't available right now.", reason: sent.error });
  return res.status(200).json({ ok: true });
}

/**
 * Called once by the registration page: emails every platform owner that a
 * school is waiting for approval. Only the school's own founder can trigger it,
 * and only while the school is pending; `registrationNotifiedAt` stops repeats.
 */
async function announceRegistration({ uid, user }, res) {
  if (user.role !== "admin" || !user.schoolCode) return res.status(403).json({ error: "Only a school's founder can do this." });
  const ref = adminDb.collection("schools").doc(user.schoolCode);
  const snap = await ref.get();
  const school = snap.exists ? { code: snap.id, ...snap.data() } : null;
  if (!school || school.authUid !== uid) return res.status(403).json({ error: "That isn't your school." });
  if (school.status !== "pending" || school.registrationNotifiedAt) return res.status(200).json({ ok: true, skipped: true });

  const owners = await adminDb.collection("users").where("role", "==", "superadmin").get();
  const to = owners.docs.map((d) => d.data().email).filter(Boolean);
  if (to.length === 0) return res.status(200).json({ ok: true, skipped: "no_owner" });

  const mail = newRegistrationEmail({
    school,
    adminEmail: user.email || "",
    consoleUrl: `${appUrl()}/platform`,
    appUrl: appUrl(),
  });
  const sent = await sendEmail({ to, ...mail, tag: "new_school" });
  if (sent.ok) await ref.update({ registrationNotifiedAt: FieldValue.serverTimestamp() });
  return res.status(200).json({ ok: sent.ok });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireStaff(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: "Body is not valid JSON." });

  try {
    if (body.action === "send-verification-email") return await sendVerification(auth, res);
    if (body.action === "registered") return await announceRegistration(auth, res);
  } catch (err) {
    console.error(`[otp] ${body.action} failed:`, err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }

  if (!PURPOSES.includes(body.purpose)) return res.status(400).json({ error: "Unknown purpose." });

  const ctx = { uid: auth.uid, user: auth.user, purpose: body.purpose, body };
  try {
    if (body.action === "request") return await request(ctx, res);
    if (body.action === "verify") return await verify(ctx, res);
    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("[otp] failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
