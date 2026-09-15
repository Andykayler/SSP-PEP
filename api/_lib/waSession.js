// api/_lib/waSession.js
// ─────────────────────────────────────────────────────────────────────────────
// Where the WhatsApp bot's conversation state lives between one inbound
// message and the next.
//
// Each serverless invocation is stateless and can land on a different
// instance, so "what did we just ask this parent" cannot live in memory — it
// has to be a row keyed by phone number. Kept deliberately tiny: one pending
// question at a time, expiring on its own so an abandoned conversation can't
// be resumed by a stale "YES" days later.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";

export const SESSIONS = "wa_sessions";

/** How long a pending question stays answerable. */
const SESSION_TTL_MS = 10 * 60 * 1000;

export async function getSession(phone) {
  if (!phone) return null;
  const snap = await adminDb.collection(SESSIONS).doc(phone).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
  if (expiresAt < Date.now()) return null;
  return data;
}

export async function setSession(phone, data) {
  await adminDb.collection(SESSIONS).doc(phone).set({
    ...data,
    phone,
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
}

export async function clearSession(phone) {
  await adminDb.collection(SESSIONS).doc(phone).delete();
}
