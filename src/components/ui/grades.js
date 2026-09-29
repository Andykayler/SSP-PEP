// src/components/ui/grades.js
// ─────────────────────────────────────────────────────────────────────────────
// How a grade looks on screen. Which grade a score earns comes from the
// school's own scale (services/curriculumCore.js); this adds the colours, so
// every performance and report screen shows a custom scale the same way.
// ─────────────────────────────────────────────────────────────────────────────
import { gradeFor, toneFor, MANEB_SCALE } from "../../services/curriculumCore";

const TONE_STYLE = {
  success: { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", hex: "#10b981" },
  primary: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", hex: "#3b82f6" },
  warning: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", hex: "#f59e0b" },
  danger: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", hex: "#ef4444" },
};

/** "G1" for MANEB's numbered grades, the grade itself ("A*", "B") otherwise. */
export const gradeCode = (label) => (/^\d+$/.test(String(label)) ? `G${label}` : String(label));

/**
 * The grade a score earns on `scale`, with display styling:
 * { grade, code, remark, pass, tone, color, bg, border, hex } — or null.
 */
export function gradeInfo(score, scale = MANEB_SCALE) {
  const g = gradeFor(score, scale);
  if (!g) return null;
  return { ...g, grade: g.label, code: gradeCode(g.label), ...TONE_STYLE[g.tone] };
}

/** Every grade on a scale, best first, with its mark range — for legends and charts. */
export function scaleRows(scale = MANEB_SCALE) {
  const bands = scale?.bands?.length ? scale.bands : MANEB_SCALE.bands;
  return bands.map((b, i) => {
    const tone = toneFor(bands, i);
    return {
      ...b, grade: b.label, code: gradeCode(b.label), tone,
      max: i === 0 ? 100 : bands[i - 1].min - 1,
      ...TONE_STYLE[tone],
    };
  });
}

/** "80–100" / "0–39" for a legend row. */
export const rangeLabel = (row) => `${row.min}–${row.max}`;
