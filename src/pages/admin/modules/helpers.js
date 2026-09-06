// ─── Helpers ──────────────────────────────────────────────────────────────────
// Generated credentials. Canonical implementations live in the services layer
// so services can use them without importing from pages/. Re-exported here to
// keep existing imports of this module working unchanged.
export { generatePassword, generateStudentCode } from "../../../services/credentials";

export function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Format phone to international — adds +265 prefix if local Malawian number
// Canonical implementation lives in the services layer so services can use
// it without importing from pages/. Re-exported here to keep existing
// imports of this module working unchanged.
export { normalisePhone } from "../../../services/phone";
