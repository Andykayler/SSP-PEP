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
// Platform owner only.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth } from "../_lib/firebaseAdmin.js";
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
