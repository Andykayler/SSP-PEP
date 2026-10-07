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

/**
 * The calendar window a term covers, as ISO dates. Nothing stores term dates,
 * so they are implied by the academic year ("Term 1 2026" belongs to 2025/2026:
 * Term 1 from September, Terms 2 and 3 in 2026). Boundaries are generous on
 * purpose — a register marked a few days either side still counts.
 */
export function termWindow(term) {
  const parsed = parseTerm(term);
  if (!parsed) return null;

  const { number, year } = parsed;
  switch (number) {
    case 1:  return { start: `${year - 1}-09-01`, end: `${year - 1}-12-31` };
    case 2:  return { start: `${year}-01-01`,     end: `${year}-04-30` };
    default: return { start: `${year}-05-01`,     end: `${year}-08-31` };
  }
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
