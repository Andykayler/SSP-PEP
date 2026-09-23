// Pure rules for which class/subject assignments on a staff member are valid.
// No Firebase here, so tests/logic can exercise it directly.
//
// The school's register is its `school_classes` documents: a class exists when
// it has a document, and a subject exists when at least one registered class
// offers it. Anything on a user's `assignedClasses` / `assignedSubjects` that
// is not in that register is stale — typically a class that was closed or
// renamed after the teacher was assigned to it.

/** Every subject offered by at least one registered class, A–Z. */
export function registeredSubjects(classes = []) {
  return [...new Set(classes.flatMap((c) => c.subjects || []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Split a staff member's assignments into what the school still has and what
 * it no longer has. Order of the kept lists follows the user's own order.
 */
export function cleanAssignments(member = {}, classes = []) {
  const classNames = new Set(classes.map((c) => c.name));
  const subjects = new Set(registeredSubjects(classes));
  const assignedClasses = member.assignedClasses || [];
  const assignedSubjects = member.assignedSubjects || [];
  return {
    classes: assignedClasses.filter((n) => classNames.has(n)),
    subjects: assignedSubjects.filter((s) => subjects.has(s)),
    staleClasses: assignedClasses.filter((n) => !classNames.has(n)),
    staleSubjects: assignedSubjects.filter((s) => !subjects.has(s)),
  };
}

/** True when `cleanAssignments` would drop anything. */
export function hasStaleAssignments(member, classes) {
  const r = cleanAssignments(member, classes);
  return r.staleClasses.length > 0 || r.staleSubjects.length > 0;
}

/**
 * Apply a class rename to an assignment list before cleaning, so renaming
 * "Form 3" to "Form 3A" moves the teacher across instead of dropping them.
 * `renames` maps old name → new name.
 */
export function applyRenames(names = [], renames = {}) {
  const out = names.map((n) => renames[n] ?? n);
  return [...new Set(out)];
}
