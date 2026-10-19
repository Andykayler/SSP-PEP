// api/_lib/connectWebhook.js
// ─────────────────────────────────────────────────────────────────────────────
// What happens when PayChangu calls the webhook of the Acalink *Connect app*
// (a school linking, or unlinking, its own PayChangu account) rather than a
// checkout. It lives in _lib and is reached through api/payments/webhook.js
// with ?source=connect, because Vercel's plan caps the number of functions.
//
// For now this RECORDS and nothing else. The shape of these events has not been
// confirmed against PayChangu's documentation, so the handler acts on none of
// it: it logs the event with anything secret-looking removed, so the real
// payload can be read from the function logs and the linking logic written
// against what PayChangu actually sends. A webhook that could mark a school as
// connected on an unverified body is exactly the hole the checkout webhook is
// built to avoid.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { deriveSchoolWebhookSecret } from "./connectLinkCore.js";

const SECRETISH = /token|secret|key|password|authorization|signature|code$/i;

/** A copy of `value` that is safe to log: secret-looking fields are replaced, long strings cut. */
export function redact(value, depth = 0) {
  if (depth > 5) return "[deep]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, SECRETISH.test(k) ? "[redacted]" : redact(v, depth + 1)]));
  }
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}

/** Advisory, like the checkout webhook: HMAC-SHA256 of the raw body with the Connect webhook secret. */
export function verifyConnectSignature(rawBody, signatureHeader, schoolCode = "") {
  const master = process.env.PAYCHANGU_CONNECT_WEBHOOK_SECRET;
  // An event for one school's link is signed with that school's own derived
  // secret (see connectLinkCore.js); the app-level webhook uses the master.
  const secret = schoolCode ? deriveSchoolWebhookSecret(master, schoolCode) : master;
  if (!secret || !signatureHeader || !rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = String(signatureHeader).trim().toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Logs one Connect event. Never throws and never acts on the payload. */
export function recordConnectEvent({ payload, raw, headers = {}, schoolCode = "" }) {
  const signature = headers.signature || headers["x-paychangu-signature"];
  const signed = raw ? verifyConnectSignature(raw, signature, schoolCode) : null;
  console.log("[connect] webhook received", JSON.stringify({
    school: schoolCode || undefined,
    signatureValid: signed,
    headerNames: Object.keys(headers).filter((h) => /sign|paychangu|event/i.test(h)),
    event: redact(payload),
  }));
}
