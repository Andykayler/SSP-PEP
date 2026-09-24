// Turns "which forms/standards, how many streams, which subjects" into class
// records. Pure; used by the setup wizard's second step and tested in
// tests/logic/classSetup.test.mjs.
//
// Same ids and names as the head teacher's "Set up classes"
// (headteacher/modules/ClassModule.jsx) — `${schoolCode}_form${level}${stream}`
// — so running either one later updates these classes instead of duplicating.

export const LEVEL_CLASSES = {
  Secondary: ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Form 6"],
  Primary: ["Standard 1", "Standard 2", "Standard 3", "Standard 4", "Standard 5", "Standard 6", "Standard 7", "Standard 8"],
};

/** What most schools of each level run, pre-ticked in the wizard. */
export const DEFAULT_SELECTION = {
  Secondary: [1, 2, 3, 4],
  Primary: [1, 2, 3, 4, 5, 6, 7, 8],
};

export const DEFAULT_CAPACITY = 45;

export const classDocId = (schoolCode, formLevel, stream) => `${schoolCode}_form${formLevel}${stream || ""}`;

/**
 * @param {{ schoolCode: string, level: "Primary"|"Secondary",
 *           forms: Record<number, number>, subjects: string[] }} input
 *   forms maps form number → stream count (0 = one class with no stream letter)
 * @returns {{ id: string, data: object }[]}
 */
export function planClasses({ schoolCode, level, forms = {}, subjects = [] }) {
  const names = LEVEL_CLASSES[level] || LEVEL_CLASSES.Secondary;
  const cleanSubjects = [...new Set(subjects.map((s) => String(s).trim()).filter(Boolean))];
  const out = [];
  Object.keys(forms)
    .map(Number)
    .filter((n) => n >= 1 && n <= names.length)
    .sort((a, b) => a - b)
    .forEach((formLevel) => {
      const label = names[formLevel - 1];
      const streams = Math.max(0, Math.min(8, Number(forms[formLevel]) || 0));
      const slots = streams === 0
        ? [{ stream: null, name: label, order: formLevel * 10 }]
        : Array.from({ length: streams }, (_, i) => {
          const letter = String.fromCharCode(65 + i);
          return { stream: letter, name: `${label}${letter}`, order: formLevel * 10 + i };
        });
      slots.forEach(({ stream, name, order }) => out.push({
        id: classDocId(schoolCode, formLevel, stream),
        data: {
          schoolCode, name, formLevel, stream, order, level,
          subjects: cleanSubjects, capacity: DEFAULT_CAPACITY,
        },
      }));
    });
  return out;
}
