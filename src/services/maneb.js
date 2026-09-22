// src/services/maneb.js
// The MANEB 1–9 grading scale, on its own so pure logic (exam analysis, tests)
// can use it without pulling in Firebase. examReadiness.js re-exports it, so
// every existing import keeps working.

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
