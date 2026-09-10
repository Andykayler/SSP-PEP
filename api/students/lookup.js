// api/students/lookup.js
// ─────────────────────────────────────────────────────────────────────────────
// The two lookups that legitimately cross a school boundary. POST /api/students/lookup
//
// Everything else in this product is scoped to one school, and firestore.rules
// enforces that. These two are not, by design:
//
//   { studentCode }  Transfer-in. A school receiving a child needs to find the
//                    record the previous school holds, from the code on the
//                    child's report card.
//
//   { phones: [...] } Guardian linking. A guardian is one person across
//                    ACALink, so a second school enrolling their child must
//                    find the account the first school created and reuse its
//                    password rather than issuing a second one.
//
// WHY THIS EXISTS AS AN ENDPOINT AT ALL
//
// Both used to run as client queries, which forced firestore.rules to carry
// `... || isAdminOrHead()` on the students read — a branch that, because a
// same-school admin already passes `sameSchool()`, did nothing EXCEPT grant
// every administrator and head teacher read access to every child at every
// other school on the platform. Two narrow lookups were paying for a blanket
// cross-tenant hole.
//
// Rules cannot tell "a query for one student code" from "a query for all
// students" — a list is authorised from its provable equality predicates, not
// from its shape or its limit. So the only way to have the narrow lookup
// without the blanket read is to run it somewhere that can enforce narrowness
// itself. That is here: the Admin SDK bypasses rules, the caller is checked,
// and the response carries only the handful of fields each flow actually needs.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth, adminDb } from "../_lib/firebaseAdmin.js";

/** Only the roles that run enrolment and transfers. */
const ALLOWED_ROLES = ["admin", "head_teacher"];

/** Firestore's `in` filter takes 30 values. */
const CHUNK = 30;

/** A cap on how many numbers one bulk import can ask about in a single call. */
const MAX_PHONES = 600;

/**
 * What a transfer-in screen needs to identify a child and raise the request.
 * Deliberately does NOT include the guardian's portal password, marks, fees or
 * anything else about a school's own records.
 */
function transferView(id, d) {
  return {
    id,
    studentCode: d.studentCode || "",
    fullName: d.fullName || "",
    firstName: d.firstName || "",
    lastName: d.lastName || "",
    gender: d.gender || "",
    dob: d.dob || "",
    className: d.className || "",
    schoolCode: d.schoolCode || "",
    schoolName: d.schoolName || "",
    guardianName: d.guardianName || "",
    guardianPhone: d.guardianPhone || "",
    guardianEmail: d.guardianEmail || "",
    status: d.status || "active",
  };
}

/**
 * What guardian linking needs, and nothing more.
 *
 * `parentPortalPassword` is here because reusing the family's existing
 * credential is the entire point of the feature — a second school must not
 * issue a second password for the same guardian. It is the reason this
 * endpoint is restricted to enrolment roles.
 */
function siblingView(id, d) {
  return {
    id,
    guardianPhone: d.guardianPhone || "",
    guardianName: d.guardianName || "",
    guardianLinkStatus: d.guardianLinkStatus || "active",
    parentPortalPassword: d.parentPortalPassword || "",
    schoolCode: d.schoolCode || "",
    schoolName: d.schoolName || "",
    fullName: d.fullName || "",
  };
}

function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body || {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: "Body is not valid JSON." });

  // ── Who is asking ─────────────────────────────────────────────────────────
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sign in first." });

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }

  // A guardian session is anonymous and has no business here at all.
  if (decoded.firebase?.sign_in_provider === "anonymous") {
    return res.status(403).json({ error: "Not available to this account." });
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) return res.status(403).json({ error: "No staff profile on this account." });
  const user = userSnap.data();
  if (!ALLOWED_ROLES.includes(user.role)) {
    return res.status(403).json({ error: "Only an administrator or head teacher can look a student up." });
  }

  try {
    // ── By student code: transfer-in ────────────────────────────────────────
    if (body.studentCode) {
      const code = String(body.studentCode).trim().toUpperCase();
      if (!code) return res.status(400).json({ error: "Enter a student code." });

      const snap = await adminDb.collection("students")
        .where("studentCode", "==", code).limit(1).get();

      if (snap.empty) return res.status(200).json({ student: null });
      const doc = snap.docs[0];
      return res.status(200).json({ student: transferView(doc.id, doc.data()) });
    }

    // ── By guardian phone: linking ──────────────────────────────────────────
    if (Array.isArray(body.phones)) {
      const phones = [...new Set(
        body.phones.map((p) => String(p || "").trim()).filter(Boolean)
      )];
      if (phones.length === 0) return res.status(200).json({ siblings: {} });
      if (phones.length > MAX_PHONES) {
        return res.status(400).json({ error: `Too many numbers in one request (max ${MAX_PHONES}).` });
      }

      const siblings = Object.fromEntries(phones.map((p) => [p, []]));
      for (let i = 0; i < phones.length; i += CHUNK) {
        const chunk = phones.slice(i, i + CHUNK);
        const snap = await adminDb.collection("students")
          .where("guardianPhone", "in", chunk).get();
        snap.docs.forEach((d) => {
          const view = siblingView(d.id, d.data());
          if (siblings[view.guardianPhone]) siblings[view.guardianPhone].push(view);
        });
      }
      return res.status(200).json({ siblings });
    }

    return res.status(400).json({ error: "Provide either studentCode or phones." });
  } catch (err) {
    console.error("[students/lookup] failed:", err);
    return res.status(500).json({ error: "Lookup failed. Please try again." });
  }
}
