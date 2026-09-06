// src/services/examReadiness.js
// ─────────────────────────────────────────────────────────────────────────────
// How many of this school's candidates are on course to pass the MSCE.
//
// A Malawian secondary school's reputation is its MSCE pass rate, and the
// certificate turns on a threshold rather than an average: six credits,
// English among them. A student averaging 58% looks respectable on a report
// card and can still leave without a certificate, because the average hides
// which subjects are credits and which are passes.
//
// This module projects each candidate's standing against that threshold from
// the continuous assessment already recorded, so a head teacher sees the gap
// in Form 3 while there is a year left to close it — rather than in the
// results letter, when there is not.
//
// Projection, not prophecy: it says where a student stands today on the marks
// the school itself has entered. It cannot know what they will do in the hall.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

/**
 * Component weights, matching the teacher's mark entry. Duplicated from
 * PerformanceModule rather than imported, because that file is a 1,100-line
 * React component and pulling it into an analytics path would drag the whole
 * mark-entry UI along with it.
 */
export const ASSESSMENT_WEIGHTS = { CA1: 0.10, CA2: 0.10, MidTerm: 0.20, EndTerm: 0.60 };

/** The MANEB 1–9 scale. Grades 1–6 are credits; 7–8 pass; 9 fails. */
export const MANEB = [
  { grade: 1, min: 80, remark: "Distinction" },
  { grade: 2, min: 70, remark: "Distinction" },
  { grade: 3, min: 65, remark: "Credit" },
  { grade: 4, min: 60, remark: "Credit" },
  { grade: 5, min: 55, remark: "Credit" },
  { grade: 6, min: 50, remark: "Credit" },
  { grade: 7, min: 45, remark: "Pass" },
  { grade: 8, min: 40, remark: "Pass" },
  { grade: 9, min: 0,  remark: "Fail" },
];

export const CREDIT_GRADE_CEILING = 6;
export const CREDITS_REQUIRED = 6;

export function gradeFor(score) {
  if (score === null || score === undefined || score === "") return null;
  const n = Number(score);
  if (Number.isNaN(n)) return null;
  return MANEB.find((g) => n >= g.min) || MANEB[MANEB.length - 1];
}

export function isCredit(score) {
  const g = gradeFor(score);
  return Boolean(g) && g.grade <= CREDIT_GRADE_CEILING;
}

/** English is compulsory for the certificate, so it is matched by name. */
export function isEnglish(subject) {
  return /english/i.test(String(subject || ""));
}

/** Pulls the form number out of "Form 3A", "Form 4 Blue", "F3" and so on. */
export function formNumber(className = "") {
  const m = /(?:form|f)\s*([1-6])/i.exec(String(className));
  return m ? Number(m[1]) : null;
}

// ─── Reading marks ───────────────────────────────────────────────────────────

/**
 * Every mark sheet for a term.
 *
 * `ca_marks` documents are keyed per teacher per assessment component, so one
 * class in one term is spread across several documents that have to be merged.
 * Filtered on schoolCode and term only — equality filters, no composite index.
 */
export async function fetchMarkSheets(schoolCode, term) {
  if (!schoolCode || !term) return [];
  try {
    const snap = await getDocs(query(
      collection(db, "ca_marks"),
      where("schoolCode", "==", schoolCode),
      where("term", "==", term),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[readiness] could not read mark sheets:", err);
    return [];
  }
}

/**
 * Collapses the scattered mark sheets into one score per student per subject.
 *
 * Components are weighted by what has actually been entered rather than by the
 * full scale. Two months into a term only CA1 exists, and dividing a CA1 score
 * by the full weighting would report every candidate as failing — an alarm
 * that is wrong every time would train people to ignore a real one.
 */
export function mergeMarks(sheets) {
  // studentId -> subject -> { CA1, CA2, MidTerm, EndTerm }
  const byStudent = new Map();

  (sheets || []).forEach((sheet) => {
    const component = sheet.assessmentType;
    if (!ASSESSMENT_WEIGHTS[component]) return;
    Object.entries(sheet.marks || {}).forEach(([studentId, subjects]) => {
      if (!byStudent.has(studentId)) byStudent.set(studentId, new Map());
      const subjectMap = byStudent.get(studentId);
      Object.entries(subjects || {}).forEach(([subject, score]) => {
        if (score === "" || score === null || score === undefined) return;
        if (!subjectMap.has(subject)) subjectMap.set(subject, {});
        subjectMap.get(subject)[component] = Number(score);
      });
    });
  });

  const out = new Map();
  byStudent.forEach((subjectMap, studentId) => {
    const subjects = {};
    subjectMap.forEach((components, subject) => {
      let sum = 0;
      let weight = 0;
      Object.entries(ASSESSMENT_WEIGHTS).forEach(([id, w]) => {
        const v = components[id];
        if (v !== undefined && !Number.isNaN(v)) { sum += v * w; weight += w; }
      });
      if (weight === 0) return;
      subjects[subject] = {
        score: Math.round((sum / weight) * 10) / 10,
        // A projection built on 10% of the term's assessment deserves less
        // trust than one built on all of it, and the UI says which it has.
        completeness: Math.round(weight * 100),
      };
    });
    out.set(studentId, subjects);
  });
  return out;
}

// ─── Standing ────────────────────────────────────────────────────────────────

export const RISK_BANDS = [
  {
    id: "onTrack", label: "On track", tone: "success",
    describe: "Six or more credits including English.",
  },
  {
    id: "borderline", label: "Borderline", tone: "warning",
    describe: "Within two credits of the threshold, or short only of English.",
  },
  {
    id: "atRisk", label: "At risk", tone: "danger",
    describe: "Three or more credits short.",
  },
  {
    id: "noData", label: "No marks yet", tone: "neutral",
    describe: "Nothing has been entered for this student this term.",
  },
];

export function bandMeta(id) {
  return RISK_BANDS.find((b) => b.id === id) || RISK_BANDS[3];
}

/**
 * Where one candidate stands.
 *
 * A student with six credits but no English credit is *not* on track — that is
 * the case the average conceals and the one worth surfacing loudest, so it
 * gets its own flag rather than being folded into a count.
 */
export function standingFor(subjects) {
  const entries = Object.entries(subjects || {});
  if (entries.length === 0) {
    return {
      band: "noData", credits: 0, englishCredit: false, englishScore: null,
      subjectCount: 0, shortfall: CREDITS_REQUIRED, weakest: [], completeness: 0,
    };
  }

  const credits = entries.filter(([, v]) => isCredit(v.score)).length;
  const englishEntry = entries.find(([subject]) => isEnglish(subject));
  const englishScore = englishEntry ? englishEntry[1].score : null;
  const englishCredit = englishEntry ? isCredit(englishScore) : false;
  const shortfall = Math.max(0, CREDITS_REQUIRED - credits);

  const weakest = entries
    .filter(([, v]) => !isCredit(v.score))
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 3)
    .map(([subject, v]) => ({ subject, score: v.score, grade: gradeFor(v.score)?.grade }));

  const completeness = Math.round(
    entries.reduce((s, [, v]) => s + (v.completeness || 0), 0) / entries.length,
  );

  let band;
  if (credits >= CREDITS_REQUIRED && englishCredit) band = "onTrack";
  else if (shortfall <= 2 || (credits >= CREDITS_REQUIRED && !englishCredit)) band = "borderline";
  else band = "atRisk";

  return {
    band, credits, englishCredit, englishScore, shortfall,
    subjectCount: entries.length, weakest, completeness,
    // Named separately because it is the single most actionable fact here: a
    // student one English credit away from a certificate needs one thing.
    englishOnly: credits >= CREDITS_REQUIRED && !englishCredit,
  };
}

/** Standing for every student handed in, newest marks first in the table. */
export function buildReadiness({ students, sheets, formFilter = null }) {
  const merged = mergeMarks(sheets);
  return (students || [])
    .filter((s) => {
      if (formFilter === null) return true;
      return formNumber(s.className) === formFilter;
    })
    .map((s) => ({ ...s, ...standingFor(merged.get(s.id) || {}), subjects: merged.get(s.id) || {} }))
    .sort((a, b) => {
      // At-risk candidates first — this list exists to be acted on from the
      // top, not browsed alphabetically.
      const order = { atRisk: 0, borderline: 1, onTrack: 2, noData: 3 };
      const d = order[a.band] - order[b.band];
      return d !== 0 ? d : (a.fullName || "").localeCompare(b.fullName || "");
    });
}

/**
 * Where the school as a whole is losing credits.
 *
 * Reported as the share of candidates failing to reach a credit in each
 * subject. A subject where two thirds of the form miss a credit is a teaching
 * or staffing problem, not sixty individual student problems, and it is
 * invisible from any one report card.
 */
export function subjectWeakness(rows) {
  const tally = new Map();
  (rows || []).forEach((row) => {
    Object.entries(row.subjects || {}).forEach(([subject, v]) => {
      if (!tally.has(subject)) tally.set(subject, { subject, entered: 0, credits: 0, total: 0 });
      const t = tally.get(subject);
      t.entered += 1;
      t.total += v.score;
      if (isCredit(v.score)) t.credits += 1;
    });
  });

  return [...tally.values()]
    .map((t) => ({
      subject: t.subject,
      entered: t.entered,
      creditRate: Math.round((t.credits / t.entered) * 100),
      average: Math.round((t.total / t.entered) * 10) / 10,
    }))
    .sort((a, b) => a.creditRate - b.creditRate);
}

/** Headline counts for the summary strip. */
export function summarise(rows) {
  const counts = { onTrack: 0, borderline: 0, atRisk: 0, noData: 0 };
  (rows || []).forEach((r) => { counts[r.band] += 1; });
  const assessed = rows.length - counts.noData;
  return {
    ...counts,
    total: rows.length,
    assessed,
    projectedPassRate: assessed > 0 ? Math.round((counts.onTrack / assessed) * 100) : 0,
    englishOnly: rows.filter((r) => r.englishOnly).length,
  };
}
