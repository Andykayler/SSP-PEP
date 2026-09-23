// One child's results from a class's published mark sheets. Pure; used by
// api/parent/results.js so the parent app receives only its own child's marks.
//
// Mirrors acalink/lib/services/performance_service.dart exactly — same
// component weights, same rounding, same ranking — so moving the calculation
// server-side changes nothing a parent sees except that it is now gated.

export const COMPONENT_WEIGHTS = { CA1: 0.10, CA2: 0.10, MidTerm: 0.20, EndTerm: 0.60 };

function weighted(perComponent) {
  let sum = 0;
  let used = 0;
  for (const [component, score] of Object.entries(perComponent)) {
    const w = COMPONENT_WEIGHTS[component];
    if (w == null || typeof score !== "number") continue;
    sum += score * w;
    used += w;
  }
  return used > 0 ? Math.round((sum / used) * 10) / 10 : null;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * @param {object[]} markDocs  ca_marks documents for one class and term
 * @param {string} studentId
 */
export function childResults(markDocs = [], studentId) {
  // studentId -> subject -> component -> score, published sheets only.
  const raw = new Map();
  for (const d of markDocs) {
    if (!d.publishedAt) continue;
    const component = d.assessmentType || "EndTerm";
    for (const [sid, subjects] of Object.entries(d.marks || {})) {
      if (!subjects || typeof subjects !== "object") continue;
      if (!raw.has(sid)) raw.set(sid, {});
      const per = raw.get(sid);
      for (const [subject, score] of Object.entries(subjects)) {
        if (typeof score !== "number") continue;
        (per[subject] ||= {})[component] = score;
      }
    }
  }

  const averages = [];
  let mine = null;
  for (const [sid, per] of raw) {
    const subjectScores = Object.values(per).map(weighted).filter((v) => v != null);
    const avg = mean(subjectScores);
    if (avg != null) averages.push(avg);
    if (sid === studentId) mine = per;
  }

  const subjects = Object.entries(mine || {})
    .map(([subject, components]) => ({ subject, components, weighted: weighted(components) }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const overallAverage = mean(subjects.map((s) => s.weighted).filter((v) => v != null));
  let rank = null;
  if (overallAverage != null) {
    const sorted = [...averages].sort((a, b) => b - a);
    const idx = sorted.findIndex((v) => Math.abs(v - overallAverage) < 0.001);
    rank = idx >= 0 ? idx + 1 : null;
  }

  return { subjects, overallAverage, rank };
}
