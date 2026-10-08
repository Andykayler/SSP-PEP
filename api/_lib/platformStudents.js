// api/_lib/platformStudents.js
// ─────────────────────────────────────────────────────────────────────────────
// What the platform owner sees across schools, which no school-scoped rule lets
// a browser read:
//
//   • how many students each school has;
//   • a guardian's portal password, looked up by phone number, for the guardian
//     whose WhatsApp message never arrived.
//
// Called from api/platform/email-status.js, after it has checked the caller is
// the platform owner. Every password lookup is written to `platform_audit`.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { normalisePhone } from "../../src/services/phone.js";

const countOf = async (query) => (await query.count().get()).data().count;

/** { [schoolCode]: { total, active } } for every school. */
export async function studentCounts() {
  const schools = await adminDb.collection("schools").select().get();
  const counts = {};
  await Promise.all(schools.docs.map(async (s) => {
    const base = adminDb.collection("students").where("schoolCode", "==", s.id);
    const [total, active] = await Promise.all([countOf(base), countOf(base.where("status", "==", "active"))]);
    counts[s.id] = { total, active };
  }));
  return counts;
}

/** Every way the same number may have been written on an enrolment form. */
export function phoneVariants(raw) {
  const normal = normalisePhone(raw);
  const digits = normal.replace(/\D/g, "");
  const out = new Set([String(raw || "").trim(), normal]);
  if (normal.startsWith("+265") && digits.length === 12) {
    const national = digits.slice(3);
    out.add(national); out.add(`0${national}`); out.add(`265${national}`); out.add(`+265 ${national}`);
  }
  return [...out].filter(Boolean).slice(0, 10);
}

/**
 * The guardians behind a phone number, with their password and children.
 * Passwords of confirmed children come first: a pending link's password was
 * never proven to be in the guardian's hands.
 */
export async function guardianLookup(rawPhone, actor) {
  const variants = phoneVariants(rawPhone);
  if (!variants.length) return { error: "Enter the guardian's phone number." };

  const snap = await adminDb.collection("students").where("guardianPhone", "in", variants).get();
  const byPhone = new Map();
  snap.docs.forEach((doc) => {
    const d = doc.data();
    const phone = normalisePhone(d.guardianPhone || "");
    const g = byPhone.get(phone) || { phone, name: d.guardianName || "", passwords: [], children: [] };
    const confirmed = (d.guardianLinkStatus || "active") === "active";
    g.name = g.name || d.guardianName || "";
    g.children.push({
      id: doc.id,
      name: d.fullName || `${d.firstName || ""} ${d.lastName || ""}`.trim(),
      className: d.className || "",
      schoolCode: d.schoolCode || "",
      schoolName: d.schoolName || "",
      status: d.status || "active",
      confirmed,
    });
    if (d.parentPortalPassword) g.passwords.push({ value: d.parentPortalPassword, confirmed });
    byPhone.set(phone, g);
  });

  const guardians = [...byPhone.values()].map((g) => {
    const sorted = [...g.passwords].sort((a, b) => Number(b.confirmed) - Number(a.confirmed));
    return { phone: g.phone, name: g.name, passwords: [...new Set(sorted.map((p) => p.value))], children: g.children };
  });

  if (guardians.length) {
    const first = guardians[0].children[0] || {};
    await adminDb.collection("platform_audit").add({
      action: "view_guardian_password",
      schoolCode: first.schoolCode || "",
      schoolName: first.schoolName || "",
      actorId: actor.uid,
      actorName: actor.user?.name || actor.user?.email || "",
      detail: { phone: guardians.map((g) => g.phone).join(", ") },
      createdAt: FieldValue.serverTimestamp(),
    }).catch((err) => console.error("[platform] audit write failed:", err));
  }
  return { guardians };
}
