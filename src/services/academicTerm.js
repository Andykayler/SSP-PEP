// src/services/academicTerm.js
// ─────────────────────────────────────────────────────────────────────────────
// One source of truth for "which term is it".
//
// Before this, the term was hardcoded in each module that needed it — the
// teacher's mark entry defaulted to "Term 1 2026" while the parent app only
// ever queried "Term 2 2026", so marks saved under the default were invisible
// to families with no error anywhere. Anything that writes or reads a `term`
// field should get it from here instead of declaring its own.
//
// It lives on `school_settings/{schoolCode}` alongside `promotionThreshold`,
// which the head teacher's Promotion tab already owns.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { formatTerm, parseTerm, isFullYear, resolveTerm } from "./academicTermCore.js";

export const TERMS_PER_YEAR = 3;

// formatTerm, parseTerm, isFullYear and resolveTerm now live in
// academicTermCore.js (no Firestore import) so serverless functions can share
// them; re-exported here so nothing importing this module has to change.
export { formatTerm, parseTerm, isFullYear, resolveTerm };

/**
 * Term 3 rolls over into Term 1 of the next year — which is also the point at
 * which promotion between forms happens, since that is the academic year end.
 */
export function nextTerm(term) {
  const parsed = parseTerm(term);
  if (!parsed) return null;
  return parsed.number >= TERMS_PER_YEAR
    ? { number: 1, year: parsed.year + 1, startsNewYear: true }
    : { number: parsed.number + 1, year: parsed.year, startsNewYear: false };
}

export function previousTerm(term) {
  const parsed = parseTerm(term);
  if (!parsed) return null;
  return parsed.number <= 1
    ? { number: TERMS_PER_YEAR, year: parsed.year - 1 }
    : { number: parsed.number - 1, year: parsed.year };
}

/** Academic year label used by the fees modules, e.g. "2025/2026". */
export function academicYearFor(term) {
  const parsed = parseTerm(term);
  if (!parsed) return "";
  return `${parsed.year - 1}/${parsed.year}`;
}

/**
 * The calendar window a term covers, as ISO dates.
 *
 * Nothing stores term dates, but they are implied by what `academicYearFor`
 * already asserts: "Term 1 2026" belongs to academic year 2025/2026, so Term 1
 * sits in the back half of 2025 and Terms 2 and 3 in 2026. That matches the
 * Malawian school year — Term 1 from September, the year ending in July.
 *
 * Used to scope attendance and discipline to the term being reported on. The
 * boundaries are generous on purpose: a register marked a few days either side
 * of the official term start should still count toward that term, and the
 * alternative — counting a whole year's absences against one term — is much
 * more wrong than a week of overlap.
 *
 * A school running a different calendar would need this configurable; today
 * nothing in the product asks for term dates at all.
 */
export function termWindow(term) {
  const parsed = parseTerm(term);
  if (!parsed) return null;

  const { number, year } = parsed;
  // year - 1 is when the academic year opens; `year` is when it closes.
  switch (number) {
    case 1:  return { start: `${year - 1}-09-01`, end: `${year - 1}-12-31` };
    case 2:  return { start: `${year}-01-01`,     end: `${year}-04-30` };
    default: return { start: `${year}-05-01`,     end: `${year}-08-31` };
  }
}

/**
 * Best guess when a school has never set a term — the calendar year, first
 * term. Only ever used to pre-fill the picker, never written silently.
 */
export function defaultTerm() {
  return formatTerm(1, new Date().getFullYear());
}

/** Selectable terms: a year either side of the one in use, newest first. */
export function termOptions(currentTerm) {
  const parsed = parseTerm(currentTerm) || parseTerm(defaultTerm());
  const years = [parsed.year + 1, parsed.year, parsed.year - 1];
  const out = [];
  years.forEach((year) => {
    for (let n = TERMS_PER_YEAR; n >= 1; n -= 1) out.push(formatTerm(n, year));
  });
  return out;
}

// ─── Term access ─────────────────────────────────────────────────────────────
// Who may look at which term, and who may write to it.
//
// The school records against exactly one term at a time — the one the head
// teacher set — and that is the whole point of setting it. Offering a free
// choice of term wherever marks are entered undoes it: marks get filed under a
// term nobody is reading, and the mistake is invisible until a report card
// comes out empty. The head teacher's Performance module defaulted to a
// hardcoded "Term 1 2026" for exactly this reason.
//
// So: recording is always the current term, never a choice. Looking back is a
// separate, read-only act, and one the two roles are trusted with differently.

/**
 * Terms that already happened, newest first, excluding the current one.
 * Never includes a future term — there is nothing recorded in one, and
 * offering it is how marks end up somewhere nobody looks.
 */
export function pastTermOptions(currentTerm, count = 5) {
  const parsed = parseTerm(currentTerm);
  if (!parsed) return [];

  const out = [];
  let cursor = { number: parsed.number, year: parsed.year };
  for (let i = 0; i < count; i += 1) {
    cursor = cursor.number <= 1
      ? { number: TERMS_PER_YEAR, year: cursor.year - 1 }
      : { number: cursor.number - 1, year: cursor.year };
    out.push(formatTerm(cursor.number, cursor.year));
  }
  return out;
}

/** True when `term` is neither the current one nor in the future. */
export function isPastTerm(term, currentTerm) {
  const a = parseTerm(term);
  const b = parseTerm(currentTerm);
  if (!a || !b) return false;
  return a.year < b.year || (a.year === b.year && a.number < b.number);
}

/**
 * Whether marks may be entered against `term`.
 *
 * A head teacher may correct a past term — someone has to be able to fix a
 * transcription error found after the fact, and they are the one accountable
 * for the result. A class teacher may not: their job is the term in progress,
 * and a quietly edited past mark is exactly the change a school cannot audit.
 *
 * Enforced in firestore.rules as well. This copy is what stops the UI offering
 * an action that would be rejected; the rules are what make it true.
 */
export function canEditTerm({ term, currentTerm, role }) {
  if (!term || !currentTerm) return false;
  if (term === currentTerm) return true;
  return role === "admin" || role === "head_teacher" || role === "headteacher";
}

/** Whether this role may look at terms other than the current one at all. */
export function canViewPastTerms(role) {
  return role === "admin" || role === "head_teacher" || role === "headteacher"
      || role === "teacher" || role === "class_teacher";
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function fetchSchoolSettings(schoolCode) {
  if (!schoolCode) return null;
  try {
    const snap = await getDoc(doc(db, "school_settings", schoolCode));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("[term] could not read school settings:", err);
    return null;
  }
}

export async function fetchCurrentTerm(schoolCode) {
  const settings = await fetchSchoolSettings(schoolCode);
  return settings?.currentTerm || "";
}

/** Live subscription — the topbar and mark entry both follow a term change. */
export function subscribeSchoolSettings(schoolCode, onChange) {
  if (!schoolCode) return () => {};
  return onSnapshot(
    doc(db, "school_settings", schoolCode),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => {
      console.error("[term] settings subscription failed:", err);
      onChange(null);
    },
  );
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Sets the school's current term. `merge` matters: this document also holds
 * schoolType, promotionThreshold and the class setup, none of which belong to
 * this screen.
 */
export async function setCurrentTerm({ schoolCode, term, actorId }) {
  if (!schoolCode || !parseTerm(term)) {
    return { ok: false, error: "That is not a valid term." };
  }
  try {
    await setDoc(doc(db, "school_settings", schoolCode), {
      schoolCode,
      currentTerm: term,
      academicYear: academicYearFor(term),
      termSetAt: serverTimestamp(),
      termSetBy: actorId || "",
    }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error("[term] could not set term:", err);
    return { ok: false, error: err.message };
  }
}

// ─── Reconciling the two term vocabularies ───────────────────────────────────
//
// The fee modules predate this file and store terms as "Term 1" with no year,
// offering "Full Year" as a fourth option. Everything else — marks, report
// cards, school_settings — stores "Term 1 2026". Any code comparing a fee
// record against the current term has to speak both, or it silently matches
// nothing: a charge of "Term 1" tested against "Term 1 2026" is simply not
// equal, and the arrears, sponsorship and expenditure figures all quietly
// read zero.
//
// Rather than migrate the fee data — which would break the bursar's existing
// screens — the short form is read as belonging to the academic year now
// running. That is an assumption, and it is the right one: a school's fee
// records are for the year they are in, and no year-less record can mean
// anything else.

/**
 * Whether a stored term refers to the term now running.
 * "Full Year" matches any term within the same academic year.
 */
export function termsMatch(stored, currentTerm) {
  if (!stored || !currentTerm) return false;
  if (stored === currentTerm) return true;

  const now = parseTerm(currentTerm);
  if (!now) return false;
  if (isFullYear(stored)) return true;

  return resolveTerm(stored, currentTerm) === formatTerm(now.number, now.year);
}
