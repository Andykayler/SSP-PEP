// ─── Helpers ──────────────────────────────────────────────────────────────────
export function generatePassword() {
  const words = ["Blue","Star","Lake","Gold","Moon","Fire","Wind","Peak","Rock","Dawn"];
  const syms  = ["#","@","!","$"];
  return `${words[Math.floor(Math.random()*words.length)]}${syms[Math.floor(Math.random()*syms.length)]}${Math.floor(1000+Math.random()*9000)}`;
}

export function generateStudentCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg   = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  return `STU-${seg()}-${seg()}`;
}

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
export function normalisePhone(raw = "") {
  const stripped = raw.replace(/\s+/g, "").replace(/[^+\d]/g, "");
  if (!stripped) return "";
  if (stripped.startsWith("+")) return stripped;
  // Malawian local: 09xxxxxxxx or 08xxxxxxxx → +265 9xxxxxxxx
  if (/^0[89]\d{8}$/.test(stripped)) return "+265" + stripped.slice(1);
  // Already without country code but 9-digit
  if (/^[89]\d{8}$/.test(stripped)) return "+265" + stripped;
  return stripped; // return as-is; API will validate
}
