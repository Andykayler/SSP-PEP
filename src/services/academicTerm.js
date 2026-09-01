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

export const TERMS_PER_YEAR = 3;

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
