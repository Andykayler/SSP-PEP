// src/services/health.js
// ─────────────────────────────────────────────────────────────────────────────
// What a school needs to know about a child's health, and when one falls ill.
//
// Two different kinds of record, kept apart on purpose:
//
//   health_profiles/{studentId}   standing facts — allergies, conditions,
//                                 medication, emergency contact. Every teacher
//                                 can read them (the person who must know a
//                                 child is allergic to something is the one
//                                 standing in front of the class); only
//                                 leadership edits them.
//   sickbay_visits                events. Anyone on staff can log one when a
//                                 learner falls ill; only leadership reads the
//                                 log back. The same collection the Boarding
//                                 module's sick bay already writes, in the same
//                                 shape, so there is one record of visits.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, query, where, getDocs, addDoc, setDoc, serverTimestamp,
} from "firebase/firestore";

export const HEALTH = "health_profiles";
export const SICKBAY = "sickbay_visits";

export const BLOOD_GROUPS = ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** A profile with any of these filled in is one a teacher should be able to spot at a glance. */
export function needsAttention(p) {
  return Boolean(p && (String(p.allergies || "").trim() || String(p.conditions || "").trim() || String(p.medication || "").trim()));
}

export async function fetchProfiles(schoolCode) {
  const snap = await getDocs(query(collection(db, HEALTH), where("schoolCode", "==", schoolCode)));
  return new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
}

/** The profile is keyed by the student's id, so there is exactly one per learner. */
export async function saveProfile({ schoolCode, student, data, actor }) {
  await setDoc(doc(db, HEALTH, student.id), {
    schoolCode,
    studentId: student.id,
    studentName: student.fullName || "",
    className: student.className || "",
    allergies: (data.allergies || "").trim(),
    conditions: (data.conditions || "").trim(),
    medication: (data.medication || "").trim(),
    bloodGroup: data.bloodGroup || "Unknown",
    emergencyName: (data.emergencyName || "").trim(),
    emergencyPhone: (data.emergencyPhone || "").trim(),
    doctor: (data.doctor || "").trim(),
    notes: (data.notes || "").trim(),
    updatedBy: actor?.id || "",
    updatedByName: actor?.name || "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function fetchVisits(schoolCode) {
  const snap = await getDocs(query(collection(db, SICKBAY), where("schoolCode", "==", schoolCode)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.seenAtMs || 0) - (a.seenAtMs || 0));
}

/**
 * Records a visit, in the same shape the Boarding sick bay uses. Telling the
 * guardian is the caller's job (notifySickbayVisit), so the two can succeed or
 * fail independently — a note that is saved but not sent is recoverable, a
 * message that is sent about a visit that was not saved is not.
 */
export async function logVisit({ schoolCode, student, complaint, treatment, referredOut = false, sentHome = false, temperature = "", actor }) {
  if (!student?.id) throw new Error("Pick a learner.");
  if (!String(complaint || "").trim()) throw new Error("Record what was wrong.");
  const ref = await addDoc(collection(db, SICKBAY), {
    schoolCode,
    studentId: student.id,
    studentName: student.fullName || "",
    className: student.className || "",
    guardianPhone: student.guardianPhone || "",
    complaint: String(complaint).trim(),
    treatment: String(treatment || "").trim(),
    temperature: String(temperature || "").trim(),
    referredOut: Boolean(referredOut),
    sentHome: Boolean(sentHome),
    seenBy: actor?.id || "",
    seenByName: actor?.name || "",
    seenAt: serverTimestamp(),
    seenAtMs: Date.now(),
  });
  return ref.id;
}
