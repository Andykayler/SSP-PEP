// src/services/curriculum.js
// ─────────────────────────────────────────────────────────────────────────────
// Saving what curriculumCore.js describes: the school's sections, their
// subjects and grading scales, and renaming a class or subject everywhere.
// The rules themselves are in curriculumCore.js, which has no Firebase in it.
// ─────────────────────────────────────────────────────────────────────────────
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { validateScale, sectionKey, sectionName } from "./curriculumCore";

export * from "./curriculumCore";

/**
 * Saves the school's sections. `schoolLevel` is kept in step so screens that
 * still read it (promotion, older class filters) see the school's top section.
 */
export async function saveSections({ schoolCode, sections, actorId }) {
  if (!schoolCode) return { ok: false, error: "No school code." };
  if (!sections?.length) return { ok: false, error: "Choose at least one section." };
  const cleaned = [];
  for (const s of sections) {
    const subjects = [...new Set((s.subjects || []).map((x) => String(x).trim()).filter(Boolean))];
    if (subjects.length === 0) return { ok: false, error: `Add at least one subject to ${sectionName(s)}.` };
    const checked = validateScale(s.grading);
    if (!checked.ok) return { ok: false, error: `${sectionName(s)} grading: ${checked.error}` };
    cleaned.push({ id: s.id, curriculum: s.curriculum, key: sectionKey(s.id, s.curriculum), subjects, grading: checked.scale });
  }
  const top = cleaned.some((s) => s.id === "secondary") ? "Secondary" : "Primary";
  try {
    await setDoc(doc(db, "school_settings", schoolCode), {
      schoolCode,
      sections: cleaned,
      schoolLevel: top,
      updatedAt: serverTimestamp(),
      updatedBy: actorId || "",
    }, { merge: true });
    return { ok: true, sections: cleaned };
  } catch (err) {
    console.error("[curriculum] could not save sections:", err);
    return { ok: false, error: err.message };
  }
}

async function callRename(payload) {
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch("/api/staff/account?op=rename", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "The rename didn't go through." };
    return { ok: true, ...data };
  } catch (err) {
    console.error("[curriculum] rename failed:", err);
    return { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
  }
}

/** Renames a class and every record that carries its name. */
export const renameClass = (classId, to) => callRename({ kind: "class", classId, to });

/** Renames a subject across the whole school — classes, timetable, marks, teachers. */
export const renameSubject = (from, to) => callRename({ kind: "subject", from, to });
