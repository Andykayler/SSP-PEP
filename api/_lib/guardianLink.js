// api/_lib/guardianLink.js
// ─────────────────────────────────────────────────────────────────────────────
// Guardian link confirmation: the proof that a child a school attached as
// `pending` really belongs to the person holding the phone number.
//
// Replaces the verifyGuardianLink Cloud Function. The parent app now calls
// POST /api/parent/confirm (routed to api/parent/results.js, see vercel.json,
// to stay inside the plan's function-count limit) and gets the verdict in the
// response instead of waiting on a Firestore trigger. The password is never
// written to Firestore.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth, adminDb, FieldValue } from "./firebaseAdmin.js";
import { readBody } from "./auth.js";
import { normalisePhone } from "../../src/services/phone.js";

// Five wrong guesses in ten minutes per number: generous for someone typing a
// password they know, useless for brute force.
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const fail = (res, status, error) => res.status(status).json({ error });

async function recentFailures(phone) {
  const since = Date.now() - ATTEMPT_WINDOW_MS;
  const snap = await adminDb
    .collection("guardian_link_requests")
    .where("phone", "==", phone)
    .where("status", "==", "rejected")
    .get();
  return snap.docs.filter((d) => {
    const t = d.data().resolvedAt;
    return t?.toDate && t.toDate().getTime() > since;
  }).length;
}

async function recordFailure(phone, studentId, uid) {
  try {
    await adminDb.collection("guardian_link_requests").add({
      phone, studentId, requestedByUid: uid,
      status: "rejected",
      resolvedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[guardian-link] could not record failure:", err);
  }
}

export async function confirmGuardianLink(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Use POST.");

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(res, 401, "Sign in again.");
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return fail(res, 401, "Your session has expired. Sign in again.");
  }

  const body = readBody(req) || {};
  const studentId = String(body.studentId || "");
  const phone = normalisePhone(body.phone || "");
  const attempt = String(body.password || "").trim();
  if (!studentId || !phone || !attempt) return fail(res, 400, "Incomplete request.");

  try {
    if ((await recentFailures(phone)) >= MAX_ATTEMPTS) {
      return fail(res, 429, "Too many attempts. Wait ten minutes and try again.");
    }

    const studentRef = adminDb.collection("students").doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) return fail(res, 404, "That student no longer exists.");

    const student = studentSnap.data();
    if (normalisePhone(student.guardianPhone) !== phone) {
      // Worded like a wrong password so this can't be used to discover which
      // students sit under a given number.
      await recordFailure(phone, studentId, decoded.uid);
      return fail(res, 403, "Incorrect password.");
    }

    if ((student.guardianLinkStatus || "active") === "active") {
      return res.status(200).json({ verified: true });
    }

    // Compare against already-confirmed records only: a pending sibling's
    // password has never been proven to be in anyone's hands.
    const family = await adminDb.collection("students").where("guardianPhone", "==", phone).get();
    const confirmed = family.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.id !== studentId && (s.guardianLinkStatus || "active") === "active");

    if (confirmed.length === 0) {
      return fail(res, 403, "There is no confirmed account for this number yet. Contact the school.");
    }
    if (!confirmed.some((s) => (s.parentPortalPassword || "") === attempt)) {
      await recordFailure(phone, studentId, decoded.uid);
      return fail(res, 403, "Incorrect password.");
    }

    // One credential per family, however many schools have enrolled children.
    await studentRef.update({
      guardianLinkStatus: "active",
      guardianLinkVerifiedAt: FieldValue.serverTimestamp(),
      parentPortalPassword: attempt,
    });
    console.log(`[guardian-link] confirmed ${studentId} for ${phone}`);
    return res.status(200).json({ verified: true });
  } catch (err) {
    console.error("[guardian-link] failed:", err);
    return fail(res, 500, "Could not confirm right now. Please try again.");
  }
}
