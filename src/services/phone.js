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

export function normalisePhone(raw = "") {
  const stripped = String(raw).replace(/\s+/g, "").replace(/[^+\d]/g, "");
  if (!stripped) return "";
  if (stripped.startsWith("+")) return stripped;
  // Malawian local: 09xxxxxxxx or 08xxxxxxxx → +265 9xxxxxxxx
  if (/^0[89]\d{8}$/.test(stripped)) return "+265" + stripped.slice(1);
  // Already without country code but 9-digit
  if (/^[89]\d{8}$/.test(stripped)) return "+265" + stripped;
  return stripped; // return as-is; API will validate
}

/** How a number should be shown back to staff — grouped, not run together. */
export function displayPhone(raw = "") {
  const n = normalisePhone(raw);
  const m = /^\+265(\d{3})(\d{3})(\d{3})$/.exec(n);
  return m ? `+265 ${m[1]} ${m[2]} ${m[3]}` : n;
}
