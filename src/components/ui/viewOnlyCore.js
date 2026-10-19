// src/components/ui/viewOnlyCore.js
// Which control labels mean "this changes something". Pure, so it is testable
// without a DOM; ViewOnly.jsx applies it.

const WRITE_VERBS = [
  "add", "new", "create", "edit", "delete", "remove", "save", "submit", "approve",
  "decline", "reject", "enrol", "enroll", "assign", "post", "publish", "import",
  "upload", "record", "issue", "release", "archive", "restore", "deactivate",
  "reactivate", "resolve", "send", "invite", "register", "update", "transfer",
  "promote", "generate", "revoke", "grant", "confirm", "verify", "allocate",
  "check in", "check out", "reply", "notify", "remind", "write", "change",
  "rename", "duplicate", "reopen", "re-issue", "reissue", "withdraw", "lend",
  "renew", "reset", "unbill",
];

// Anchored at the start, optionally after a "+" or an icon glyph, and followed
// by a word boundary so "record" does not swallow "Records".
const WRITE_LABEL = new RegExp(
  `^[+\\s]*(${WRITE_VERBS.map((v) => v.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})(\\b|\\s|$)`,
  "i",
);

/** Whether a control's own label says it changes something. Exported for tests. */
export function looksLikeWrite(label) {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  // A long string is a sentence or a card, not a button label.
  if (!text || text.length > 40) return false;
  return WRITE_LABEL.test(text);
}


// Controls that do nothing but dismiss, navigate or filter keep working even if
// their label happens to start with a write verb ("Close", "Cancel").
const DISMISS = /^[+\s]*(close|cancel|dismiss|back|done)\b/i;

/** Dismiss-only controls stay usable even where a write verb would match. */
export function isDismissal(label) {
  return DISMISS.test(String(label || "").trim());
}


