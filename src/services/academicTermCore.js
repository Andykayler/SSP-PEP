// src/services/academicTermCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure half of academicTerm.js — no Firestore, no browser-only imports.
//
// Split out so serverless functions (api/_lib/*, Node runtime, Admin SDK) can
// compute against the same term vocabulary the app uses without dragging in
// the client "firebase" package just to parse a string. academicTerm.js
// re-exports everything here, so existing imports of academicTerm.js are
// unaffected.
// ─────────────────────────────────────────────────────────────────────────────

/** The canonical stored form. Every `term` field in Firestore is this string. */
export function formatTerm(number, year) {
  return `Term ${number} ${year}`;
}

/** Splits a stored term back into its parts; null if it is not our format. */
export function parseTerm(term = "") {
  const m = /^Term\s+(\d+)\s+(\d{4})$/.exec(term.trim());
  if (!m) return null;
  return { number: Number(m[1]), year: Number(m[2]) };
}

/** True for the fee modules' catch-all option, which covers every term. */
export function isFullYear(term) {
  return String(term || "").trim().toLowerCase() === "full year";
}

/**
 * Expands a stored term into the canonical "Term N YYYY" form.
 *
 * A year-less "Term N" takes the year of `currentTerm`; "Full Year" resolves
 * to that year's first term, since that is when annual fees are charged.
 * Returns "" for anything unrecognisable, which callers treat as unsortable
 * rather than as the oldest possible debt.
 */
export function resolveTerm(stored, currentTerm) {
  const exact = parseTerm(stored);
  if (exact) return formatTerm(exact.number, exact.year);

  const now = parseTerm(currentTerm);
  if (!now) return "";

  if (isFullYear(stored)) return formatTerm(1, now.year);

  const short = /^Term\s+(\d+)$/i.exec(String(stored || "").trim());
  return short ? formatTerm(Number(short[1]), now.year) : "";
}
