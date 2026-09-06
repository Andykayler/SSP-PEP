// src/services/credentials.js
// ─────────────────────────────────────────────────────────────────────────────
// Generated strings a human has to read off an SMS and type back in.
//
// These lived in the admin module's helpers, where the services layer could not
// reach them without importing from `pages/`. Same move as `phone.js`: this is
// the canonical copy now and `pages/admin/modules/helpers` re-exports both, so
// existing imports keep working.
//
// Both alphabets deliberately exclude the characters people confuse when
// copying from a phone screen — O/0, I/1, and lowercase l — because a guardian
// mistyping one character looks exactly like a wrong password.
// ─────────────────────────────────────────────────────────────────────────────

/** Word + symbol + digits: short enough to read aloud down a phone line. */
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
