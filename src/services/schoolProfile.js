// src/services/schoolProfile.js
// ─────────────────────────────────────────────────────────────────────────────
// Whether the school boards its students, and whether setup has been done.
//
// This is asked once, during setup, before anything else — because it changes
// what the rest of the system should even show. A day school has no dormitory
// to allocate, no sign-out register to keep and no matron to notify; putting
// those modules in front of a day school's staff is noise they have to learn
// to ignore. A boarding school that never records it gets the opposite
// problem: the modules that would tell them which children are on site are
// hidden behind a setting nobody knew to look for.
//
// It lives on `school_settings/{schoolCode}` beside `currentTerm`, so a school
// has one settings document rather than several.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/** The three shapes a Malawian secondary school actually takes. */
export const SCHOOL_TYPES = [
  {
    id: "day",
    label: "Day school",
    blurb: "All students go home at the end of the day.",
  },
  {
    id: "boarding",
    label: "Boarding school",
    blurb: "All students live at the school during term.",
  },
  {
    id: "both",
    label: "Both day and boarding",
    blurb: "Some students board, others come in daily.",
  },
];

export function schoolTypeLabel(type) {
  return SCHOOL_TYPES.find((t) => t.id === type)?.label || "Not set";
}

/**
 * Primary ("Standard 1–8") or Secondary ("Form 1–6") — which classes a school
 * has. Its own field, `schoolLevel`: it used to share `schoolType` with the
 * day/boarding answer, so setting up classes quietly overwrote "boarding" with
 * "Secondary" and hid every boarding tool. Older documents that only have the
 * level in `schoolType` are still read correctly.
 */
export const SCHOOL_LEVELS = ["Secondary", "Primary"];
export function schoolLevelOf(settings) {
  if (SCHOOL_LEVELS.includes(settings?.schoolLevel)) return settings.schoolLevel;
  if (SCHOOL_LEVELS.includes(settings?.schoolType)) return settings.schoolType;
  return "Secondary";
}

/** True when the school keeps students overnight, so boarding tools apply. */
export function boards(settings) {
  return settings?.schoolType === "boarding" || settings?.schoolType === "both";
}

/**
 * True once someone has answered the setup questions. Read from the same
 * settings document the term lives on, so one fetch answers both.
 *
 * Deliberately keyed on schoolType rather than a separate flag: a school that
 * somehow has a type but no completion stamp is set up in every way that
 * matters, and blocking it on a missing bookkeeping field would be perverse.
 */
export function isSetUp(settings) {
  return Boolean(settings?.schoolType);
}

/** What still needs answering before the school is considered configured. */
export function setupGaps(settings) {
  const gaps = [];
  if (!settings?.schoolType) gaps.push("school type");
  if (!settings?.currentTerm) gaps.push("current term");
  return gaps;
}

/**
 * Records the school type. Merges, because this document also holds the term,
 * the promotion threshold and the class setup — none of which belong here.
 */
export async function setSchoolType({ schoolCode, schoolType, actorId }) {
  if (!schoolCode) return { ok: false, error: "No school code." };
  if (!SCHOOL_TYPES.some((t) => t.id === schoolType)) {
    return { ok: false, error: "Choose whether the school is day, boarding, or both." };
  }
  try {
    await setDoc(doc(db, "school_settings", schoolCode), {
      schoolCode,
      schoolType,
      schoolTypeSetAt: serverTimestamp(),
      schoolTypeSetBy: actorId || "",
    }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error("[profile] could not set school type:", err);
    return { ok: false, error: err.message };
  }
}

/** Stamps setup as finished. Separate from setSchoolType so the wizard can
 *  save each answer as it goes and only close the gate at the end. */
export async function completeSetup({ schoolCode, actorId }) {
  if (!schoolCode) return { ok: false, error: "No school code." };
  try {
    await setDoc(doc(db, "school_settings", schoolCode), {
      schoolCode,
      setupCompletedAt: serverTimestamp(),
      setupCompletedBy: actorId || "",
    }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error("[profile] could not complete setup:", err);
    return { ok: false, error: err.message };
  }
}
