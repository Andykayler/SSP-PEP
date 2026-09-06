// src/services/admissions.js
// ─────────────────────────────────────────────────────────────────────────────
// The pipeline that produces students.
//
// Student Management holds children who are already enrolled. Everything
// before that — the selection list from the district, the applications that
// arrive at the office, the offers made and the places still open — happens on
// paper, which is why schools cannot answer how many places are left without
// counting.
//
// An application becomes a student exactly once, at enrolment, and the record
// keeps the link both ways so the office can trace where a child came from.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { normalisePhone } from "./phone";

export const ADMISSIONS = "admissions";

/**
 * The stages an application moves through, in order. Order matters: the board
 * is drawn from this array, and a stage's position is what makes "how far
 * along is this applicant" answerable at a glance.
 */
export const STAGES = [
  { id: "applied",     label: "Applied",     tone: "neutral", hint: "Received, not yet considered." },
  { id: "shortlisted", label: "Shortlisted", tone: "primary", hint: "Being considered for a place." },
  { id: "offered",     label: "Offered",     tone: "warning", hint: "A place has been offered." },
  { id: "accepted",    label: "Accepted",    tone: "success", hint: "The family has accepted." },
  { id: "enrolled",    label: "Enrolled",    tone: "success", hint: "Now a student on the roll." },
];

/** Outcomes that end an application rather than advancing it. */
export const CLOSED_STAGES = [
  { id: "waitlisted", label: "Waiting list", tone: "warning", hint: "No place now; may be offered later." },
  { id: "declined",   label: "Declined",     tone: "danger",  hint: "The family turned the place down." },
  { id: "rejected",   label: "Not offered",  tone: "danger",  hint: "The school did not offer a place." },
];

export const ALL_STAGES = [...STAGES, ...CLOSED_STAGES];

export function stageMeta(id) {
  return ALL_STAGES.find((s) => s.id === id) || STAGES[0];
}

/** How applicants reach a Malawian secondary school. */
export const SOURCES = [
  { id: "selection", label: "Government selection" },
  { id: "direct",    label: "Direct application" },
  { id: "transfer",  label: "Transfer from another school" },
  { id: "repeat",    label: "Repeating" },
];

export async function fetchApplications(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, ADMISSIONS),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  } catch (err) {
    console.error("[admissions] could not read applications:", err);
    return [];
  }
}

export async function saveApplication({ schoolCode, application, actor }) {
  const name = String(application?.applicantName || "").trim();
  if (!schoolCode || !name) return { ok: false, error: "The applicant needs a name." };
  if (!application.guardianPhone) {
    return { ok: false, error: "A guardian phone number is needed to make an offer." };
  }

  const payload = {
    schoolCode,
    applicantName: name,
    gender: application.gender || "",
    dateOfBirth: application.dateOfBirth || "",
    previousSchool: String(application.previousSchool || "").trim(),
    source: application.source || "direct",
    // PSLCE aggregate for selection entrants; blank for everyone else rather
    // than zero, which would sort as the best possible score.
    selectionScore: application.selectionScore === "" || application.selectionScore === undefined
      ? null
      : Number(application.selectionScore),
    appliedForClassId: application.appliedForClassId || "",
    appliedForClassName: application.appliedForClassName || "",
    guardianName: String(application.guardianName || "").trim(),
    guardianPhone: normalisePhone(application.guardianPhone),
    boarding: Boolean(application.boarding),
    notes: String(application.notes || "").trim(),
    status: application.status || "applied",
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (application.id) {
      await updateDoc(doc(db, ADMISSIONS, application.id), payload);
      return { ok: true, id: application.id };
    }
    const ref = await addDoc(collection(db, ADMISSIONS), {
      ...payload,
      createdAt: serverTimestamp(),
      // Milliseconds alongside the server timestamp so a list can sort before
      // the server value has resolved, which offline it has not.
      createdAtMs: Date.now(),
      createdBy: actor?.id || "",
      createdByName: actor?.name || "",
      enrolledStudentId: "",
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[admissions] could not save application:", err);
    return { ok: false, error: err.message };
  }
}

export async function setStage({ applicationId, status, note, actor }) {
  if (!stageMeta(status)) return { ok: false, error: "Unknown stage." };
  try {
    await updateDoc(doc(db, ADMISSIONS, applicationId), {
      status,
      decisionNote: String(note || "").trim(),
      decidedBy: actor?.id || "",
      decidedByName: actor?.name || "",
      decidedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error("[admissions] could not set stage:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteApplication(id) {
  try {
    await deleteDoc(doc(db, ADMISSIONS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Turns an accepted applicant into a student.
 *
 * Writes the student record and stamps the application, so the roll and the
 * pipeline agree. It deliberately does not delete the application: a school
 * asked in three years where a child came from should still be able to find
 * out, and the selection score is often the only record of it.
 */
export async function enrol({ schoolCode, application, actor }) {
  if (!application?.id) return { ok: false, error: "No application." };
  if (application.enrolledStudentId) {
    return { ok: false, error: "This applicant has already been enrolled." };
  }
  if (!application.appliedForClassId) {
    return { ok: false, error: "Assign a class before enrolling." };
  }

  try {
    const studentRef = await addDoc(collection(db, "students"), {
      schoolCode,
      fullName: application.applicantName,
      gender: application.gender || "",
      dateOfBirth: application.dateOfBirth || "",
      classId: application.appliedForClassId,
      className: application.appliedForClassName || "",
      guardianName: application.guardianName || "",
      guardianPhone: application.guardianPhone || "",
      boarder: Boolean(application.boarding),
      status: "active",
      admissionSource: application.source || "direct",
      admissionId: application.id,
      enrolledAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy: actor?.id || "",
    });

    await updateDoc(doc(db, ADMISSIONS, application.id), {
      status: "enrolled",
      enrolledStudentId: studentRef.id,
      enrolledAt: serverTimestamp(),
      enrolledBy: actor?.id || "",
    });

    return { ok: true, studentId: studentRef.id };
  } catch (err) {
    console.error("[admissions] enrolment failed:", err);
    return { ok: false, error: err.message };
  }
}

/** Counts per stage, plus places taken against an intake target. */
export function summarise(applications, target = 0) {
  const counts = {};
  ALL_STAGES.forEach((s) => { counts[s.id] = 0; });
  (applications || []).forEach((a) => {
    if (counts[a.status] !== undefined) counts[a.status] += 1;
  });
  const committed = counts.accepted + counts.enrolled;
  return {
    counts,
    total: applications?.length || 0,
    committed,
    target,
    placesLeft: target > 0 ? Math.max(0, target - committed) : null,
  };
}
