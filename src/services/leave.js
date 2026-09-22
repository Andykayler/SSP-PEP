// src/services/leave.js
// ─────────────────────────────────────────────────────────────────────────────
// Staff leave, and the cover that keeps lessons going while someone is away.
//
// The two are one workflow: a leave request is approved, the timetable says
// which lessons that teacher was going to take on those dates, and each of
// those lessons needs someone. Doing the second half by hand — scanning the
// whole timetable for a free teacher, class by class — is what makes leave
// hard for a head teacher to approve. So this works it out: the lessons
// affected, and for each, the teachers who are actually free, best fit first.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, query, where, getDocs, addDoc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { workingDays, subId } from "./leaveCore.js";

export * from "./leaveCore.js";
export const LEAVE = "leave_requests";
export const SUBS = "substitutions";

// ─── Leave requests ──────────────────────────────────────────────────────────
export async function submitLeave({ schoolCode, staff, type, startDate, endDate, reason }) {
  const days = workingDays(startDate, endDate);
  if (days < 1) throw new Error("Those dates contain no school days. Pick a weekday range.");
  const ref = await addDoc(collection(db, LEAVE), {
    schoolCode,
    staffId: staff.id,
    staffName: staff.name,
    type, startDate, endDate, days,
    reason: (reason || "").trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, days };
}

const byNewest = (a, b) => (b.startDate || "").localeCompare(a.startDate || "");

export async function fetchMyLeave(uid) {
  const snap = await getDocs(query(collection(db, LEAVE), where("staffId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest);
}

export async function fetchSchoolLeave(schoolCode) {
  const snap = await getDocs(query(collection(db, LEAVE), where("schoolCode", "==", schoolCode)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest);
}

export async function decideLeave({ request, approved, note, actor }) {
  await updateDoc(doc(db, LEAVE, request.id), {
    status: approved ? "approved" : "rejected",
    decidedBy: actor?.id || "",
    decidedByName: actor?.name || "",
    decidedAt: serverTimestamp(),
    decisionNote: (note || "").trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function cancelLeave(id) {
  await updateDoc(doc(db, LEAVE, id), { status: "cancelled", updatedAt: serverTimestamp() });
}

// ─── Cover assignments ───────────────────────────────────────────────────────
export async function fetchSubstitutions(schoolCode) {
  const snap = await getDocs(query(collection(db, SUBS), where("schoolCode", "==", schoolCode)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.periodNumber - b.periodNumber);
}

export async function assignCover({ schoolCode, lesson, substitute, actor }) {
  const id = subId(schoolCode, lesson);
  const data = {
    schoolCode,
    date: lesson.date, day: lesson.day,
    classId: lesson.classId, className: lesson.className,
    periodNumber: lesson.periodNumber, startTime: lesson.startTime || "", endTime: lesson.endTime || "",
    subject: lesson.subject, venue: lesson.venue || "",
    originalTeacherId: lesson.originalTeacherId, originalTeacherName: lesson.originalTeacherName,
    substituteId: substitute.id, substituteName: substitute.name || "",
    leaveId: lesson.leaveId || "",
    status: "assigned",
    assignedBy: actor?.id || "", assignedByName: actor?.name || "",
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, SUBS, id), data);
  return { id, ...data };
}

export async function respondToCover(id, accepted) {
  await updateDoc(doc(db, SUBS, id), {
    status: accepted ? "confirmed" : "declined",
    respondedAt: serverTimestamp(),
  });
}
