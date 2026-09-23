import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { applyRenames, cleanAssignments, hasStaleAssignments } from "./staffAssignmentsCore";

export { cleanAssignments, hasStaleAssignments, registeredSubjects } from "./staffAssignmentsCore";

/** The school's registered classes, in the order the admin set. */
export async function fetchSchoolClasses(schoolCode) {
  const snap = await getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * A teacher's assignments resolved against the register. `classes` are the
 * school_classes documents they teach; `subjects` are only subjects the school
 * still offers. Stale entries on the user document are ignored here — Staff
 * Management removes them from the document itself.
 */
export async function fetchMyAssignments(userId, schoolCode) {
  const [userSnap, schoolClasses] = await Promise.all([
    getDoc(doc(db, "users", userId)),
    fetchSchoolClasses(schoolCode),
  ]);
  const clean = cleanAssignments(userSnap.exists() ? userSnap.data() : {}, schoolClasses);
  const mine = new Set(clean.classes);
  return {
    classes: schoolClasses.filter((c) => mine.has(c.name)),
    classNames: schoolClasses.filter((c) => mine.has(c.name)).map((c) => c.name),
    subjects: clean.subjects,
  };
}

/**
 * Remove stale assignments from the given staff documents in one batch.
 * Returns what was removed, per member, so the caller can say so.
 */
export async function pruneStaleAssignments(staff, classes) {
  const changed = staff.filter((m) => hasStaleAssignments(m, classes));
  if (changed.length === 0) return [];
  const batch = writeBatch(db);
  const report = changed.map((m) => {
    const r = cleanAssignments(m, classes);
    batch.update(doc(db, "users", m.id), {
      assignedClasses: r.classes,
      assignedSubjects: r.subjects,
      updatedAt: serverTimestamp(),
    });
    return { id: m.id, name: m.name, ...r };
  });
  await batch.commit();
  return report;
}

/**
 * Bring every staff member at a school back in line with the register after
 * a class is added, renamed, re-subjected or deleted. `renames` (old → new)
 * carries teachers across a rename instead of dropping them.
 */
export async function syncAssignmentsWithClasses(schoolCode, renames = {}) {
  const [classes, staffSnap] = await Promise.all([
    fetchSchoolClasses(schoolCode),
    getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
  ]);
  const staff = staffSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      assignedClasses: applyRenames(data.assignedClasses || [], renames),
    };
  });
  const renamed = staffSnap.docs.filter((d) =>
    (d.data().assignedClasses || []).some((n) => n in renames)
  ).map((d) => d.id);
  // A rename with nothing stale afterwards still has to be written.
  const toWrite = staff.filter((m) => renamed.includes(m.id) || hasStaleAssignments(m, classes));
  if (toWrite.length === 0) return [];
  const batch = writeBatch(db);
  toWrite.forEach((m) => {
    const r = cleanAssignments(m, classes);
    batch.update(doc(db, "users", m.id), {
      assignedClasses: r.classes,
      assignedSubjects: r.subjects,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return toWrite.map((m) => m.id);
}
