// src/services/curriculumCore.js
// ─────────────────────────────────────────────────────────────────────────────
// What a school teaches, and how it grades it. Pure; no Firebase, so the
// grading rules can be tested in tests/logic and shared with the server
// (api/parent/results.js) and every portal screen.
//
// A school runs one or more SECTIONS — Kindergarten, Primary, Secondary — and
// each section follows one CURRICULUM: the Malawian national curriculum
// (MANEB), Cambridge, or Abeka. One school can mix them: an Abeka
// kindergarten, a Cambridge primary and a MANEB secondary is a real shape
// among Malawi's private schools.
//
// The curriculum decides three defaults for its section — the class names
// (Standard 1 / Year 1 / Grade 1), the subjects, and the grading scale — and
// the school can then edit all three. They live on
// `school_settings/{schoolCode}.sections`:
//
//   [{ id: "primary", curriculum: "cambridge",
//      subjects: ["English", …],
//      grading: { bands: [{ label: "A*", min: 90, remark: "Outstanding", pass: true }, …] } }]
//
// A school that set up before sections existed has only `schoolLevel`. It is
// read as one Malawian section graded on MANEB — exactly what every screen
// showed it before — so nothing about an existing school changes until
// someone edits its sections.
// ─────────────────────────────────────────────────────────────────────────────

export const SECTIONS = [
  { id: "kindergarten", label: "Kindergarten", blurb: "Nursery and reception, before Standard 1 / Year 1 / Grade 1." },
  { id: "primary", label: "Primary", blurb: "The primary years." },
  { id: "secondary", label: "Secondary", blurb: "The secondary years." },
];

export const CURRICULA = [
  { id: "malawi", label: "Malawian (MANEB)", short: "Malawian" },
  { id: "cambridge", label: "Cambridge", short: "Cambridge" },
  { id: "abeka", label: "Abeka", short: "Abeka" },
];

export const sectionLabel = (id) => SECTIONS.find((s) => s.id === id)?.label || "Class";
export const curriculumLabel = (id) => CURRICULA.find((c) => c.id === id)?.label || "Malawian (MANEB)";

const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix} ${from + i}`);

/** The class ladder each curriculum uses for each section, youngest first. */
export const CLASS_LADDERS = {
  kindergarten: {
    malawi: ["Baby Class", "Middle Class", "Reception"],
    cambridge: ["Pre-Nursery", "Nursery", "Reception"],
    abeka: ["K2", "K3", "K4", "K5"],
  },
  primary: {
    malawi: range("Standard", 1, 8),
    cambridge: range("Year", 1, 6),
    abeka: range("Grade", 1, 6),
  },
  secondary: {
    malawi: range("Form", 1, 6),
    cambridge: range("Year", 7, 13),
    abeka: range("Grade", 7, 12),
  },
};

/** Which rungs of the ladder are pre-ticked when setting a section up (1-based). */
export const DEFAULT_RUNGS = {
  kindergarten: { malawi: [1, 2, 3], cambridge: [1, 2, 3], abeka: [2, 3, 4] },
  primary: { malawi: [1, 2, 3, 4, 5, 6, 7, 8], cambridge: [1, 2, 3, 4, 5, 6], abeka: [1, 2, 3, 4, 5, 6] },
  // Forms 5–6 and Cambridge A Level (Years 12–13) are offered but not ticked:
  // most schools stop at MSCE / IGCSE.
  secondary: { malawi: [1, 2, 3, 4], cambridge: [1, 2, 3, 4, 5], abeka: [1, 2, 3, 4, 5, 6] },
};

export const MALAWI_PRIMARY_SUBJECTS = ["Chichewa", "English", "Mathematics", "Science and Technology", "Social and Environmental Sciences", "Expressive Arts", "Agriculture", "Life Skills", "Religious and Moral Education"];
export const MALAWI_SECONDARY_SUBJECTS = ["English", "Chichewa", "Mathematics", "Biology", "Chemistry", "Physics", "Agriculture", "Geography", "History", "Social and Development Studies", "Life Skills", "Bible Knowledge"];

export const DEFAULT_SUBJECTS = {
  kindergarten: {
    malawi: ["Literacy", "Numeracy", "Chichewa", "English", "Creative Arts", "Life Skills", "Physical Development"],
    cambridge: ["Communication and Language", "Literacy", "Mathematics", "Personal, Social and Emotional", "Understanding the World", "Expressive Arts and Design", "Physical Development"],
    abeka: ["Phonics", "Reading", "Numbers", "Writing", "Bible", "Language", "Arts and Crafts", "Music"],
  },
  primary: {
    malawi: MALAWI_PRIMARY_SUBJECTS,
    cambridge: ["English", "Mathematics", "Science", "Global Perspectives", "Computing", "Chichewa", "Art and Design", "Music", "Physical Education"],
    abeka: ["Bible", "Phonics and Reading", "Language", "Spelling and Poetry", "Penmanship", "Arithmetic", "Science", "History and Geography", "Health"],
  },
  secondary: {
    malawi: MALAWI_SECONDARY_SUBJECTS,
    cambridge: ["English Language", "English Literature", "Mathematics", "Biology", "Chemistry", "Physics", "Computer Science", "Business Studies", "Accounting", "Economics", "Geography", "History", "French", "Art and Design"],
    abeka: ["Bible", "English", "Algebra", "Geometry", "Biology", "Chemistry", "Physics", "World History", "Government", "Economics", "Health", "Spanish"],
  },
};

// ─── Grading ─────────────────────────────────────────────────────────────────
// A scale is a list of bands, highest first. A score takes the first band
// whose `min` it reaches. `pass: false` marks the failing band(s).

/** The MANEB 1–9 scale — the one every screen used before scales were editable. */
export const MANEB_SCALE = {
  name: "MANEB 1–9",
  bands: [
    { label: "1", min: 80, remark: "Distinction", pass: true },
    { label: "2", min: 70, remark: "Distinction", pass: true },
    { label: "3", min: 65, remark: "Credit", pass: true },
    { label: "4", min: 60, remark: "Credit", pass: true },
    { label: "5", min: 55, remark: "Credit", pass: true },
    { label: "6", min: 50, remark: "Credit", pass: true },
    { label: "7", min: 45, remark: "Pass", pass: true },
    { label: "8", min: 40, remark: "Pass", pass: true },
    { label: "9", min: 0, remark: "Fail", pass: false },
  ],
};

export const MALAWI_PRIMARY_SCALE = {
  name: "Malawi primary A–F",
  bands: [
    { label: "A", min: 80, remark: "Excellent", pass: true },
    { label: "B", min: 65, remark: "Very good", pass: true },
    { label: "C", min: 50, remark: "Good", pass: true },
    { label: "D", min: 40, remark: "Pass", pass: true },
    { label: "F", min: 0, remark: "Fail", pass: false },
  ],
};

export const CAMBRIDGE_SCALE = {
  name: "Cambridge A*–U",
  bands: [
    { label: "A*", min: 90, remark: "Outstanding", pass: true },
    { label: "A", min: 80, remark: "Excellent", pass: true },
    { label: "B", min: 70, remark: "Very good", pass: true },
    { label: "C", min: 60, remark: "Good", pass: true },
    { label: "D", min: 50, remark: "Satisfactory", pass: true },
    { label: "E", min: 40, remark: "Pass", pass: true },
    { label: "F", min: 30, remark: "Weak", pass: true },
    { label: "G", min: 20, remark: "Poor", pass: true },
    { label: "U", min: 0, remark: "Ungraded", pass: false },
  ],
};

export const ABEKA_SCALE = {
  name: "Abeka A–F",
  bands: [
    { label: "A", min: 94, remark: "Excellent", pass: true },
    { label: "B", min: 86, remark: "Above average", pass: true },
    { label: "C", min: 77, remark: "Average", pass: true },
    { label: "D", min: 70, remark: "Below average", pass: true },
    { label: "F", min: 0, remark: "Failing", pass: false },
  ],
};

export const EARLY_YEARS_SCALE = {
  name: "Early years (descriptive)",
  bands: [
    { label: "EX", min: 80, remark: "Exceeding expectations", pass: true },
    { label: "ME", min: 60, remark: "Meeting expectations", pass: true },
    { label: "DV", min: 40, remark: "Developing", pass: true },
    { label: "NS", min: 0, remark: "Needs support", pass: false },
  ],
};

export const DEFAULT_SCALES = {
  kindergarten: { malawi: EARLY_YEARS_SCALE, cambridge: EARLY_YEARS_SCALE, abeka: EARLY_YEARS_SCALE },
  primary: { malawi: MALAWI_PRIMARY_SCALE, cambridge: CAMBRIDGE_SCALE, abeka: ABEKA_SCALE },
  secondary: { malawi: MANEB_SCALE, cambridge: CAMBRIDGE_SCALE, abeka: ABEKA_SCALE },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const isSection = (id) => SECTIONS.some((s) => s.id === id);
const isCurriculum = (id) => CURRICULA.some((c) => c.id === id);

/** A section with every default filled in for its curriculum. */
export function defaultSection(id, curriculum = "malawi") {
  return {
    id,
    curriculum,
    subjects: [...DEFAULT_SUBJECTS[id][curriculum]],
    grading: clone(DEFAULT_SCALES[id][curriculum]),
  };
}

/**
 * Checks a grading scale and returns it cleaned (sorted highest first,
 * numbers coerced), or the first problem found.
 * @returns {{ ok: true, scale: object } | { ok: false, error: string }}
 */
export function validateScale(scale) {
  const bands = (scale?.bands || []).map((b) => ({
    label: String(b.label ?? "").trim(),
    min: Number(b.min),
    remark: String(b.remark ?? "").trim(),
    pass: b.pass !== false,
  }));
  if (bands.length < 2) return { ok: false, error: "A grading scale needs at least two grades." };
  if (bands.some((b) => !b.label)) return { ok: false, error: "Every grade needs a name." };
  if (bands.some((b) => !Number.isFinite(b.min) || b.min < 0 || b.min > 100)) {
    return { ok: false, error: "Each grade's lowest mark must be between 0 and 100." };
  }
  const labels = new Set(bands.map((b) => b.label.toLowerCase()));
  if (labels.size !== bands.length) return { ok: false, error: "Two grades have the same name." };
  const mins = new Set(bands.map((b) => b.min));
  if (mins.size !== bands.length) return { ok: false, error: "Two grades start at the same mark." };
  bands.sort((a, b) => b.min - a.min);
  if (bands[bands.length - 1].min !== 0) {
    return { ok: false, error: "The lowest grade must start at 0, so every mark gets a grade." };
  }
  return { ok: true, scale: { name: String(scale?.name || "Custom").trim() || "Custom", bands } };
}

/**
 * The school's sections, each complete. Falls back to the legacy single
 * `schoolLevel` — graded on MANEB, as it always was — for a school that has
 * not saved sections yet.
 */
export function sectionsOf(settings) {
  const saved = Array.isArray(settings?.sections) ? settings.sections : [];
  const clean = saved
    .filter((s) => s && isSection(s.id))
    .map((s) => {
      const curriculum = isCurriculum(s.curriculum) ? s.curriculum : "malawi";
      const base = defaultSection(s.id, curriculum);
      const subjects = Array.isArray(s.subjects) && s.subjects.length ? s.subjects.filter(Boolean) : base.subjects;
      const checked = validateScale(s.grading);
      return { id: s.id, curriculum, subjects, grading: checked.ok ? checked.scale : base.grading };
    });
  if (clean.length) {
    return SECTIONS.map((s) => clean.find((c) => c.id === s.id)).filter(Boolean);
  }

  const legacy = settings?.schoolLevel || settings?.schoolType;
  const id = legacy === "Primary" ? "primary" : "secondary";
  return [{ ...defaultSection(id, "malawi"), grading: clone(MANEB_SCALE) }];
}

/** Which section a class belongs to. Classes made before sections read their old `level`. */
export function sectionIdOfClass(cls, sections = []) {
  if (isSection(cls?.section)) return cls.section;
  const level = String(cls?.level || "").toLowerCase();
  if (isSection(level)) return level;
  return sections[0]?.id || "secondary";
}

/** The full section record a class belongs to, falling back to the first one. */
export function sectionForClass(settings, cls) {
  const sections = sectionsOf(settings);
  const id = sectionIdOfClass(cls, sections);
  return sections.find((s) => s.id === id) || sections[0];
}

/** The grading scale that applies to a class. */
export function scaleForClass(settings, cls) {
  return sectionForClass(settings, cls)?.grading || MANEB_SCALE;
}

/**
 * The grade band for a score, plus its position and a display tone.
 * Returns null for a missing score.
 */
export function gradeFor(score, scale = MANEB_SCALE) {
  if (score === null || score === undefined || score === "") return null;
  const n = Number(score);
  if (Number.isNaN(n)) return null;
  const bands = scale?.bands?.length ? scale.bands : MANEB_SCALE.bands;
  const index = bands.findIndex((b) => n >= b.min);
  const i = index === -1 ? bands.length - 1 : index;
  return { ...bands[i], index: i, tone: toneFor(bands, i) };
}

/**
 * success / primary / warning / danger for a band, worked out from where it
 * sits among the passing grades — so a custom scale colours itself sensibly
 * without the school choosing colours.
 */
export function toneFor(bands, i) {
  const band = bands[i];
  if (!band || band.pass === false) return "danger";
  const passing = bands.filter((b) => b.pass !== false).length;
  if (passing <= 1) return "success";
  const pos = i / (passing - 1); // 0 = best pass, 1 = lowest pass
  if (pos < 0.34) return "success";
  if (pos < 0.75) return "primary";
  return "warning";
}

/** True when a scale is MANEB's own — only then do MSCE credit counts mean anything. */
export function isManebScale(scale) {
  const a = scale?.bands || [];
  const b = MANEB_SCALE.bands;
  return a.length === b.length && a.every((x, i) => x.label === b[i].label && x.min === b[i].min);
}

// ─── Classes ─────────────────────────────────────────────────────────────────

/** The class names a section offers, youngest first. */
export function ladderFor(sectionId, curriculum) {
  return CLASS_LADDERS[sectionId]?.[curriculum] || CLASS_LADDERS[sectionId]?.malawi || [];
}

/**
 * Document id for a generated class. Malawian primary/secondary keep the
 * original `${schoolCode}_form${n}${stream}` so existing schools re-running
 * setup update their classes instead of duplicating them; everything else is
 * prefixed with its section, so Standard 1 and Form 1 can never collide.
 */
export function classDocIdFor(schoolCode, sectionId, curriculum, rung, stream) {
  if (curriculum === "malawi" && sectionId !== "kindergarten") return `${schoolCode}_form${rung}${stream || ""}`;
  return `${schoolCode}_${sectionId}${rung}${stream || ""}`;
}

/**
 * @param {{ schoolCode: string, section: object, rungs: Record<number, number> }} input
 *   rungs maps ladder position (1-based) → stream count (0 = one class, no letter)
 * @returns {{ id: string, data: object }[]}
 */
export function planSectionClasses({ schoolCode, section, rungs = {}, capacity = 45 }) {
  const names = ladderFor(section.id, section.curriculum);
  const sectionOrder = SECTIONS.findIndex((s) => s.id === section.id) * 1000;
  const out = [];
  Object.keys(rungs)
    .map(Number)
    .filter((n) => n >= 1 && n <= names.length)
    .sort((a, b) => a - b)
    .forEach((rung) => {
      const label = names[rung - 1];
      const streams = Math.max(0, Math.min(8, Number(rungs[rung]) || 0));
      const slots = streams === 0
        ? [{ stream: null, name: label, order: sectionOrder + rung * 10 }]
        : Array.from({ length: streams }, (_, i) => {
          const letter = String.fromCharCode(65 + i);
          return { stream: letter, name: `${label}${letter}`, order: sectionOrder + rung * 10 + i };
        });
      slots.forEach(({ stream, name, order }) => out.push({
        id: classDocIdFor(schoolCode, section.id, section.curriculum, rung, stream),
        data: {
          schoolCode, name, formLevel: rung, stream, order,
          section: section.id,
          curriculum: section.curriculum,
          // `level` is what older screens filter on.
          level: section.id === "secondary" ? "Secondary" : section.id === "primary" ? "Primary" : "Kindergarten",
          subjects: [...section.subjects],
          capacity,
        },
      }));
    });
  return out;
}

/** Replaces one subject name in a list, without creating a duplicate. */
export function renameInList(list = [], from, to) {
  const out = list.map((s) => (s === from ? to : s));
  return [...new Set(out)];
}

/** Moves a subject's marks to its new name inside one ca_marks `marks` map. */
export function renameSubjectInMarks(marks = {}, from, to) {
  let changed = false;
  const out = {};
  for (const [sid, subjects] of Object.entries(marks)) {
    if (subjects && typeof subjects === "object" && from in subjects) {
      const { [from]: score, ...rest } = subjects;
      out[sid] = { ...rest, [to]: rest[to] ?? score };
      changed = true;
    } else {
      out[sid] = subjects;
    }
  }
  return { marks: out, changed };
}
