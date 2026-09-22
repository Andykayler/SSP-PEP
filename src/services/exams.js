// src/services/exams.js
// Reading and writing exam documents. The logic — seating, invigilation, paper
// clash checks, analysis — is in examsCore.js and re-exported here, so a module
// imports everything about exams from one place.
import { db } from "../firebase";
import {
  collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { EXAM_TYPES } from "./examsCore.js";

export * from "./examsCore.js";
export const EXAMS = "exams";

// ─── Persistence ─────────────────────────────────────────────────────────────
export async function fetchExams(schoolCode) {
  const snap = await getDocs(query(collection(db, EXAMS), where("schoolCode", "==", schoolCode)));
  return snap.docs
    .map((d) => ({ id: d.id, papers: [], rooms: [], duty: [], seating: {}, ...d.data() }))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
}

export async function createExam({ schoolCode, data, actor }) {
  const ref = await addDoc(collection(db, EXAMS), {
    schoolCode,
    name: data.name.trim(),
    term: data.term || "",
    type: data.type || EXAM_TYPES[2],
    classNames: data.classNames || [],
    startDate: data.startDate || "",
    endDate: data.endDate || data.startDate || "",
    papers: [], rooms: [], duty: [], seating: {},
    status: "draft",
    createdBy: actor?.id || "",
    createdByName: actor?.name || "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateExam = (id, patch) => updateDoc(doc(db, EXAMS, id), { ...patch, updatedAt: serverTimestamp() });
export const deleteExam = (id) => deleteDoc(doc(db, EXAMS, id));
