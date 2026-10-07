// src/services/guardians.js
// ─────────────────────────────────────────────────────────────────────────────
// A child can have several guardians — mother, father, an uncle who pays the
// fees — and every one of them should hear from the school.
//
// A student stores:
//   guardians       [{ name, phone, relation }]   everyone with a usable number
//   guardianPhones  ["+265…", …]                  the same numbers, flat, so a
//                                                 query can find a child by any
//                                                 of them (array-contains)
//   guardianName / guardianPhone / guardianRelation
//                                                 the first guardian, kept because
//                                                 the parent app, sign-in and the
//                                                 fee screens all key on it
//
// Pure — no Firestore — so the browser, the API and the tests share it.
// ─────────────────────────────────────────────────────────────────────────────
import { normalisePhone, isDialablePhone } from "./phone.js";

/** Every guardian of a student, falling back to the single legacy fields. */
export function guardiansOf(student) {
  const out = [];
  const seen = new Set();
  const add = (g) => {
    const phone = normalisePhone(g?.phone);
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    out.push({ name: String(g?.name || "").trim(), phone, relation: String(g?.relation || "").trim() });
  };
  (student?.guardians || []).forEach(add);
  add({ name: student?.guardianName, phone: student?.guardianPhone, relation: student?.guardianRelation });
  return out;
}

/** Every number that may be messaged about this student. */
export const guardianPhonesOf = (student) => guardiansOf(student).map((g) => g.phone);

/** True when `phone` belongs to any guardian of the student. */
export function isGuardianPhone(student, phone) {
  const p = normalisePhone(phone);
  return Boolean(p) && guardianPhonesOf(student).includes(p);
}

/** The fields to write onto a student document for a list of guardians. */
export function guardianFields(guardians) {
  const list = guardiansOf({ guardians });
  const first = list[0];
  return {
    guardians: list,
    guardianPhones: list.map((g) => g.phone),
    guardianName: first?.name || "",
    guardianPhone: first?.phone || "",
    guardianRelation: first?.relation || "",
  };
}

// ─── Reading a spreadsheet's guardian cells ──────────────────────────────────

/** "Mary Banda, John Banda", "A & B", "A / B" → separate names. */
export function splitNames(cell) {
  return decodeEntities(cell)
    .split(/\s*(?:,|;|\/|&|\band\b|\n)\s*/i)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && !isNullish(s));
}

/** "0999541085, 0997998604" → separate raw numbers, in order. */
export function splitPhones(cell) {
  return String(cell || "")
    .split(/\s*(?:,|;|\/|\n)\s*/)
    .map((s) => s.trim())
    .filter((s) => s && !isNullish(s));
}

export const isNullish = (s) => /^(null|n\/?a|none|nil|-+|\.+)$/i.test(String(s).trim());

export function decodeEntities(s) {
  return String(s || "")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Pairs names with numbers by position and standardises every number.
 *
 * `names` and `phones` are the raw lists from the file. A number that cannot be
 * messaged is not guessed at — it is returned in `rejected` with a reason, so
 * the clerk can fix the source rather than the school messaging a stranger.
 */
export function pairGuardians({ names, phones, relations = [] }) {
  const guardians = [];
  const rejected = [];
  const seen = new Set();

  phones.forEach((raw, i) => {
    const phone = normalisePhone(raw);
    // One name and several numbers: the same person's two phones.
    const name = names.length === 1 ? names[0] : names[i] || "";
    if (!isDialablePhone(phone)) {
      rejected.push({ raw, name, reason: reasonFor(raw) });
      return;
    }
    if (seen.has(phone)) return;                 // the same number listed twice
    seen.add(phone);
    guardians.push({ name, phone, relation: relations[i] || "" });
  });

  // Names left over with no number at all.
  const unmatched = names.length > 1 ? names.slice(phones.length).filter(Boolean) : [];
  return { guardians, rejected, unmatched };
}

function reasonFor(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length > 12) {
    const head = digits.slice(0, 10);
    // Offered, never applied: messaging a wrong number would hand a child's
    // details (and a login password) to a stranger.
    const hint = isDialablePhone(head) ? ` — the first ten digits, ${head}, may be the right number` : "";
    return `"${raw}" has too many digits — it looks like two numbers run together${hint}`;
  }
  if (digits.length < 9 || (digits.length === 9 && digits.startsWith("0"))) return `"${raw}" is missing a digit`;
  return `"${raw}" is not a number WhatsApp can reach`;
}
