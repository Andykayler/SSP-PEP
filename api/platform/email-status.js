// api/platform/email-status.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/platform/email-status   { authUids: string[] }
//   → { verified: { [uid]: boolean } }
//
// Whether each school founder has confirmed their email address. That fact
// lives only in Firebase Auth — a browser cannot read another account's — so
// the platform console asks here before approving a school, and can say "this
// email has not been verified" instead of approving a typo.
//
// Also the platform owner's other server-side actions, so they share one function:
//   { action: "school-decision" | "student-counts" | "guardian-lookup" }
//
// Platform owner only.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth, adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import { sendEmail, appUrl } from "../_lib/email.js";
import { approvedEmail, rejectedEmail } from "../_lib/emailTemplates.js";
import { studentCounts, guardianLookup } from "../_lib/platformStudents.js";

const toMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : null);

/**
 * Emails a school's founder the platform owner's decision: approved (with the
 * trial end date) or not approved (with the reason). Called by the back office
 * right after it records the decision. `decisionEmailedFor` stops the same
 * decision being emailed twice if the button is pressed again.
 */
async function emailDecision(schoolCode, res) {
  const ref = adminDb.collection("schools").doc(String(schoolCode || ""));
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "No such school." });
  const school = { code: snap.id, ...snap.data() };
  if (!["active", "rejected"].includes(school.status)) return res.status(200).json({ ok: true, skipped: "no_decision" });
  if (school.decisionEmailedFor === school.status) return res.status(200).json({ ok: true, skipped: "already_sent" });

  const founder = school.authUid ? await adminAuth.getUser(school.authUid).catch(() => null) : null;
  const to = founder?.email || school.email;
  if (!to) return res.status(200).json({ ok: true, skipped: "no_email" });

  const mail = school.status === "active"
    ? approvedEmail({ school, trialEndsMs: toMs(school.trialEndsAt), signinUrl: `${appUrl()}/signin`, appUrl: appUrl() })
    : rejectedEmail({ school, reason: school.rejectedReason || "", appUrl: appUrl() });
  const sent = await sendEmail({ to, ...mail, tag: school.status === "active" ? "school_approved" : "school_rejected" });
  if (sent.ok) await ref.update({ decisionEmailedFor: school.status, decisionEmailedAt: FieldValue.serverTimestamp() });
  return res.status(200).json({ ok: sent.ok, error: sent.error });
}
import { readBody, requireStaff } from "../_lib/auth.js";

const MAX_UIDS = 100;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireStaff(req, { roles: ["superadmin"] });
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: "Body is not valid JSON." });

  if (body.action === "school-decision") {
    try {
      return await emailDecision(body.schoolCode, res);
    } catch (err) {
      console.error("[platform] decision email failed:", err);
      return res.status(500).json({ error: "Couldn't send the email." });
    }
  }

  if (body.action === "student-counts") {
    try {
      return res.status(200).json({ counts: await studentCounts() });
    } catch (err) {
      console.error("[platform] student counts failed:", err);
      return res.status(500).json({ error: "Couldn't count the students." });
    }
  }

  if (body.action === "guardian-lookup") {
    try {
      const result = await guardianLookup(body.phone, auth);
      return res.status(result.error ? 400 : 200).json(result);
    } catch (err) {
      console.error("[platform] guardian lookup failed:", err);
      return res.status(500).json({ error: "Couldn't look that number up." });
    }
  }

  const uids = [...new Set((Array.isArray(body.authUids) ? body.authUids : []).filter((u) => typeof u === "string" && u))]
    .slice(0, MAX_UIDS);
  if (uids.length === 0) return res.status(200).json({ verified: {} });

  try {
    const result = await adminAuth.getUsers(uids.map((uid) => ({ uid })));
    const verified = {};
    uids.forEach((u) => { verified[u] = false; });
    result.users.forEach((u) => { verified[u.uid] = Boolean(u.emailVerified); });
    return res.status(200).json({ verified });
  } catch (err) {
    console.error("[platform] email-status failed:", err);
    return res.status(502).json({ error: "Could not check email status." });
  }
}
