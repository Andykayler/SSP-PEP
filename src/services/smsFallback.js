// src/services/smsFallback.js
// ─────────────────────────────────────────────────────────────────────────────
// Which notifications fall back to SMS when a guardian has no app.
//
// ── The gap this closes ─────────────────────────────────────────────────────
// A guardian receives exactly one SMS today: the credentials sent at enrolment.
// Everything after that — results, fee balances, attendance — is written to
// `notifications` and delivered in-app plus by push. A guardian who never
// installs ACALink, or has no smartphone at all, therefore hears nothing from
// the school again. In a school where a good share of families are on feature
// phones, that is most of the parents the system was supposed to reach.
//
// ── Why it is a per-school setting and not simply "on" ──────────────────────
// SMS costs real money per message, and the volumes are not small: publishing
// results for one subject to a 600-pupil school is 600 messages if every
// guardian lacks the app. Left always-on, a school would discover the cost at
// the end of term rather than choosing it. So a school opts in per category
// and can price the decision first — see `estimateMessages` below.
//
// ── Where the decision is enforced ──────────────────────────────────────────
// Not here. This module owns the vocabulary and the read/write of the setting;
// the send happens in `functions/index.js`, because deciding whether to fall
// back requires knowing whether the guardian has a registered device, and
// `parent_devices` is `allow read: if false` — deliberately unreadable by any
// client, staff included. The Admin SDK in the function is the only thing that
// can see it, and it already computes exactly that fact before pushing.
//
// The setting lives on `school_settings/{schoolCode}` beside `currentTerm` and
// `schoolType`, so a school still has one settings document rather than four.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/** Field name on the settings document. Shared with functions/index.js. */
export const SMS_FALLBACK_FIELD = "smsFallbackCategories";

/**
 * Categories sent to EVERY guardian, whether or not they use the app.
 *
 * Only report cards qualify. Issuing them is a deliberate, once-a-term act by
 * the head teacher — the moment the term's result becomes official — and a
 * school that decides parents should be told does not mean "only the parents
 * who happen to have installed something". A guardian holding the app gets the
 * push and the SMS both; that duplication is the point, not a bug.
 *
 * Note this is emphatically NOT `performance`, which fires every time any
 * teacher publishes any subject's marks. Routing that to SMS would be roughly
 * a dozen messages per guardian per term to say the same thing repeatedly.
 *
 * ── Who sends these ─────────────────────────────────────────────────────────
 * The portal, directly, in headteacher/modules/reports.jsx — not the Cloud
 * Function. Because the message goes out irrespective of app installation,
 * deciding to send it needs nothing the browser cannot see, so this works with
 * no Firebase Functions deployment at all. The categories below are the ones
 * that DO need the function, since only the Admin SDK can read
 * `parent_devices` to find out who lacks the app.
 */
export const SMS_ALWAYS_CATEGORIES = [
  {
    id: "report",
    label: "Report cards issued",
    blurb:
      "Sent to every guardian when the head teacher issues report cards — " +
      "once a term, app or no app.",
    perTerm: 1,
  },
];

/**
 * Categories sent ONLY to guardians with no registered device, in the order
 * they are offered. A guardian using the app gets the free in-app push and
 * costs the school nothing.
 *
 * Deliberately a subset of CATEGORY_META: `message`, `mention` and `thread`
 * are conversations that only make sense inside the app, and `staff`/`system`
 * never address a guardian. `perTerm` is a rough number of sends per pupil per
 * term, used only to price the choice in the UI — it is an estimate a school
 * can sanity-check, not a billing figure.
 */
export const SMS_FALLBACK_CATEGORIES = [
  {
    id: "fees",
    label: "Fee balances and payments",
    blurb: "A receipt when money is recorded, and arrears notices.",
    perTerm: 3,
  },
  {
    id: "discipline",
    label: "Discipline incidents",
    blurb: "Rare, but the one a parent most wants to hear the same day.",
    perTerm: 1,
  },
  {
    id: "attendance",
    label: "Absence",
    blurb: "Sent when a child is marked absent. The highest-volume option.",
    perTerm: 8,
  },
  {
    id: "announcement",
    label: "School announcements",
    blurb: "Closures, meetings, and anything sent to all parents.",
    perTerm: 4,
  },
  {
    id: "homework",
    label: "Homework set",
    blurb: "Rarely worth an SMS — homework needs the app to be useful.",
    perTerm: 12,
  },
];

/**
 * Off for every category until a school says otherwise. Opting in is the
 * safe default when the wrong answer costs the school money silently.
 */
export const DEFAULT_SMS_FALLBACK = [];

/** Every category a school may switch on, both kinds together. */
export const SMS_CATEGORIES = [...SMS_ALWAYS_CATEGORIES, ...SMS_FALLBACK_CATEGORIES];

/** True when this category goes out regardless of whether the app is installed. */
export function isAlwaysCategory(id) {
  return SMS_ALWAYS_CATEGORIES.some((c) => c.id === id);
}

/**
 * The enabled category ids on a settings document, always an array.
 *
 * Unknown ids are dropped rather than trusted — `performance` was offered here
 * briefly and any school that ticked it should stop paying for a dozen
 * subject-publication messages a term the moment this deploys.
 */
export function smsFallbackCategories(settings) {
  const raw = settings?.[SMS_FALLBACK_FIELD];
  if (!Array.isArray(raw)) return DEFAULT_SMS_FALLBACK;
  const known = new Set(SMS_CATEGORIES.map((c) => c.id));
  return raw.filter((id) => known.has(id));
}

/** Whether one category is set to send SMS for this school. */
export function isSmsFallbackOn(settings, category) {
  return smsFallbackCategories(settings).includes(category);
}

/**
 * Rough messages per term for the chosen categories, so the settings screen
 * can show a cost before the school commits.
 *
 * `guardiansWithoutApp` is the multiplier that matters: a guardian holding the
 * app never triggers a fallback, so a school where everyone installs ACALink
 * pays nothing however many categories are ticked.
 */
export function estimateMessages(categories, guardiansWithoutApp = 0, totalGuardians = 0) {
  const enabled = new Set(categories || []);

  const fallbackPer = SMS_FALLBACK_CATEGORIES
    .filter((c) => enabled.has(c.id))
    .reduce((sum, c) => sum + c.perTerm, 0);

  // Always-categories reach the whole roll, so they scale with every guardian
  // rather than only the ones without a device.
  const alwaysPer = SMS_ALWAYS_CATEGORIES
    .filter((c) => enabled.has(c.id))
    .reduce((sum, c) => sum + c.perTerm, 0);

  return fallbackPer * Math.max(0, guardiansWithoutApp)
       + alwaysPer * Math.max(0, totalGuardians);
}

/**
 * Writes the school's choice. Merged, so it cannot clobber `currentTerm` or
 * `schoolType` living on the same document.
 */
export async function setSmsFallbackCategories({ schoolCode, categories, actorId = "" }) {
  if (!schoolCode) return { ok: false, error: "No school code." };

  const known = new Set(SMS_CATEGORIES.map((c) => c.id));
  const clean = [...new Set((categories || []).filter((id) => known.has(id)))];

  try {
    await setDoc(
      doc(db, "school_settings", schoolCode),
      {
        [SMS_FALLBACK_FIELD]: clean,
        smsFallbackUpdatedAt: serverTimestamp(),
        smsFallbackUpdatedBy: actorId || "",
      },
      { merge: true },
    );
    return { ok: true, categories: clean };
  } catch (err) {
    console.error("[smsFallback] save failed:", err);
    return { ok: false, error: err.message };
  }
}
