// src/services/phone.js
// ─────────────────────────────────────────────────────────────────────────────
// One spelling of a Malawian phone number.
//
// A guardian's number is the parent app's identity — `parentRecipientId` is
// built from it — so "0991 234 567", "+265991234567" and "991234567" written
// on three different forms have to end up as the same string, or the same
// family becomes three families and only one of them gets notified.
//
// This lived in the admin module's helpers, where the services layer could not
// reach it without importing from `pages/`. It is the canonical copy now;
// `pages/admin/modules/helpers` re-exports it so existing imports still work.
// ─────────────────────────────────────────────────────────────────────────────

/** Country codes of the places families abroad are most likely to be reached from. */
const FOREIGN_CODES = ["1", "27", "44", "61", "91", "254", "255", "256", "258", "260", "263"];

export function normalisePhone(raw = "") {
  let stripped = String(raw).replace(/\s+/g, "").replace(/[^+\d]/g, "");
  if (!stripped) return "";
  if (stripped.startsWith("+")) return stripped;
  // International dialling prefix: 00265… → +265…
  if (stripped.startsWith("00") && stripped.length > 10) stripped = stripped.slice(2);
  // Malawian local: 09xxxxxxxx or 08xxxxxxxx → +265 9xxxxxxxx
  if (/^0[89]\d{8}$/.test(stripped)) return "+265" + stripped.slice(1);
  // Already without country code but 9-digit
  if (/^[89]\d{8}$/.test(stripped)) return "+265" + stripped;
  // Country code typed without the "+": 265991234567
  if (/^265[89]\d{8}$/.test(stripped)) return "+" + stripped;
  // A well-formed number from abroad written without the "+" (US 11 digits, UK/ZA 11–12).
  if (/^\d{11,12}$/.test(stripped) && FOREIGN_CODES.some((c) => stripped.startsWith(c))
      && !stripped.startsWith("0")) {
    return "+" + stripped;
  }
  return stripped; // return as-is; API will validate
}

/**
 * Whether a normalised number can be messaged on WhatsApp: a Malawian mobile
 * (+265 8/9…) or a plausible international one (+ then 10–13 digits).
 */
export function isDialablePhone(raw = "") {
  const n = normalisePhone(raw);
  if (/^\+265[89]\d{8}$/.test(n)) return true;
  if (/^\+265/.test(n)) return false;              // a Malawian number with the wrong digit count
  if (/^\+1\d{10}$/.test(n)) return true;          // US / Canada
  if (/^\+27\d{9}$/.test(n)) return true;          // South Africa
  if (/^\+44\d{10}$/.test(n)) return true;         // UK
  return /^\+(?!1|27|44)\d{10,13}$/.test(n);
}

/** How a number should be shown back to staff — grouped, not run together. */
export function displayPhone(raw = "") {
  const n = normalisePhone(raw);
  const m = /^\+265(\d{3})(\d{3})(\d{3})$/.exec(n);
  return m ? `+265 ${m[1]} ${m[2]} ${m[3]}` : n;
}
