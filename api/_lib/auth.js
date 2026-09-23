// api/_lib/auth.js
// ─────────────────────────────────────────────────────────────────────────────
// "Who is calling, and may they?" for the serverless endpoints.
//
// The older endpoints each carry their own copy of this; new ones use this so
// the checks stay identical. A caller presents a Firebase ID token in the
// Authorization header; the staff profile in `users/{uid}` decides what they
// may do, exactly as firestore.rules does.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth, adminDb } from "./firebaseAdmin.js";
import { isDeactivated } from "../../src/services/staffAccountCore.js";

export function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body || {};
}

/**
 * @param {object} req
 * @param {{ roles?: string[] }} [opts]  Roles allowed to call. Omit to allow any staff.
 * @returns {Promise<{ ok: true, uid: string, user: object, decoded: object } | { ok: false, status: number, error: string }>}
 */
export async function requireStaff(req, { roles } = {}) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Sign in first." };

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, error: "Your session has expired. Sign in again." };
  }

  if (decoded.firebase?.sign_in_provider === "anonymous") {
    return { ok: false, status: 403, error: "This is for school staff." };
  }

  let snap;
  try {
    snap = await adminDb.collection("users").doc(decoded.uid).get();
  } catch (err) {
    console.error("[auth] could not read staff profile:", err);
    return { ok: false, status: 500, error: "Could not verify your account. Please try again." };
  }
  if (!snap.exists) return { ok: false, status: 403, error: "No staff profile is attached to this account." };

  const user = snap.data();
  if (isDeactivated(user)) {
    return { ok: false, status: 403, error: "This account has been deactivated. Contact your school administrator." };
  }
  if (roles && !roles.includes(user.role)) {
    return { ok: false, status: 403, error: "You don't have access to this." };
  }
  return { ok: true, uid: decoded.uid, user, decoded };
}
