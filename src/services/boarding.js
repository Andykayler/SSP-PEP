// src/services/boarding.js
// ─────────────────────────────────────────────────────────────────────────────
// Where boarders sleep, and whether they are on site.
//
// The question a boarding school has to be able to answer instantly, usually
// at night and usually to a worried parent, is "where is my child". A paper
// sign-out book at the gate answers it only if you are standing at the gate.
//
// Three records, because they answer three different questions: `dormitories`
// is capacity, `boarding_allocations` is who sleeps where, and
// `boarding_signouts` is who is currently off site. The sick bay log sits here
// too — it is the other reason a boarder is not in their dormitory.
//
// Every module here is hidden unless the school's type says it boards; see
// `schoolProfile.boards`.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, addDoc, updateDoc, setDoc,
  deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { notifyGuardians } from "./notifications";

export const DORMS = "dormitories";
export const ALLOCATIONS = "boarding_allocations";
export const SIGNOUTS = "boarding_signouts";
export const SICKBAY = "sickbay_visits";

// ─── Dormitories ─────────────────────────────────────────────────────────────

export async function fetchDormitories(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, DORMS),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    console.error("[boarding] could not read dormitories:", err);
    return [];
  }
}

export async function saveDormitory({ schoolCode, dormitory, actor }) {
  const name = String(dormitory?.name || "").trim();
  const capacity = Number(dormitory?.capacity) || 0;
  if (!schoolCode || !name) return { ok: false, error: "A dormitory needs a name." };
  if (capacity <= 0) return { ok: false, error: "Enter how many beds it holds." };

  const payload = {
    schoolCode,
    name,
    gender: dormitory.gender || "mixed",
    capacity,
    matronName: String(dormitory.matronName || "").trim(),
    matronPhone: String(dormitory.matronPhone || "").trim(),
    notes: String(dormitory.notes || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (dormitory.id) {
      await updateDoc(doc(db, DORMS, dormitory.id), payload);
      return { ok: true, id: dormitory.id };
    }
    const ref = await addDoc(collection(db, DORMS), { ...payload, createdAt: serverTimestamp() });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[boarding] could not save dormitory:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteDormitory(id) {
  try {
    await deleteDoc(doc(db, DORMS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Allocations ─────────────────────────────────────────────────────────────

export async function fetchAllocations(schoolCode, term) {
  if (!schoolCode) return [];
  try {
    const filters = [where("schoolCode", "==", schoolCode)];
    if (term) filters.push(where("term", "==", term));
    const snap = await getDocs(query(collection(db, ALLOCATIONS), ...filters));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[boarding] could not read allocations:", err);
    return [];
  }
}

/**
 * Puts a student in a dormitory for a term.
 *
 * One allocation per student per term, enforced by the document id — a child
 * cannot be in two dormitories at once, and re-allocating moves them rather
 * than creating a second bed that makes the occupancy count wrong.
 */
export async function allocate({ schoolCode, student, dormitory, bedNumber, term, actor }) {
  if (!schoolCode || !student?.id || !dormitory?.id || !term) {
    return { ok: false, error: "Pick a student, a dormitory and a term." };
  }
  try {
    await setDoc(doc(db, ALLOCATIONS, `${schoolCode}__${student.id}__${term}`), {
      schoolCode,
      studentId: student.id,
      studentName: student.fullName || "",
      classId: student.classId || "",
      className: student.className || "",
      guardianPhone: student.guardianPhone || "",
      dormitoryId: dormitory.id,
      dormitoryName: dormitory.name || "",
      bedNumber: String(bedNumber || "").trim(),
      term,
      allocatedBy: actor?.id || "",
      allocatedByName: actor?.name || "",
      allocatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error("[boarding] allocation failed:", err);
    return { ok: false, error: err.message };
  }
}

export async function removeAllocation(id) {
  try {
    await deleteDoc(doc(db, ALLOCATIONS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Occupancy per dormitory, so a full one cannot be filled again by accident. */
export function occupancy(dormitories, allocations) {
  const counts = new Map();
  (allocations || []).forEach((a) => {
    counts.set(a.dormitoryId, (counts.get(a.dormitoryId) || 0) + 1);
  });
  return (dormitories || []).map((d) => {
    const used = counts.get(d.id) || 0;
    return {
      ...d,
      used,
      free: Math.max(0, (d.capacity || 0) - used),
      // Over-capacity is reported rather than prevented: schools do overfill
      // dormitories, and a system that refuses to record reality gets a
      // parallel paper list instead.
      over: used > (d.capacity || 0),
      percent: d.capacity > 0 ? Math.round((used / d.capacity) * 100) : 0,
    };
  });
}

// ─── Sign-out register ───────────────────────────────────────────────────────

export async function fetchSignouts(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, SIGNOUTS),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.outAtMs || 0) - (a.outAtMs || 0));
  } catch (err) {
    console.error("[boarding] could not read sign-outs:", err);
    return [];
  }
}

/**
 * Signs a boarder off site, and tells their guardian.
 *
 * The notification is the point. A child leaving school grounds is exactly the
 * event a family should hear about without having to ask, and it is the one
 * a paper gate book can never tell them.
 */
export async function signOut({ schoolCode, student, reason, expectedBack, authorisedBy, actor }) {
  if (!schoolCode || !student?.id) return { ok: false, error: "Pick a student." };
  if (!String(reason || "").trim()) return { ok: false, error: "Say why they are leaving." };

  try {
    const ref = await addDoc(collection(db, SIGNOUTS), {
      schoolCode,
      studentId: student.id,
      studentName: student.fullName || "",
      className: student.className || "",
      guardianPhone: student.guardianPhone || "",
      reason: String(reason).trim(),
      expectedBack: expectedBack || "",
      authorisedBy: String(authorisedBy || actor?.name || "").trim(),
      outAt: serverTimestamp(),
      outAtMs: Date.now(),
      returnedAt: null,
      recordedBy: actor?.id || "",
    });

    await notifyGuardians({
      students: [student],
      schoolCode,
      title: `${student.fullName} signed out`,
      body: expectedBack
        ? `${String(reason).trim()} · expected back ${expectedBack}`
        : String(reason).trim(),
      category: "attendance",
      priority: "high",
      actorId: actor?.id || "",
      actorName: actor?.name || "Boarding Office",
      actorRole: actor?.role || "head_teacher",
      tab: "Attendance",
      entityType: "boarding_signout",
      entityId: ref.id,
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[boarding] sign-out failed:", err);
    return { ok: false, error: err.message };
  }
}

export async function signIn({ signoutId }) {
  try {
    await updateDoc(doc(db, SIGNOUTS, signoutId), {
      returnedAt: serverTimestamp(),
      returnedAtMs: Date.now(),
    });
    return { ok: true };
  } catch (err) {
    console.error("[boarding] sign-in failed:", err);
    return { ok: false, error: err.message };
  }
}

/** Still off site — the list a duty teacher checks at lights out. */
export function stillOut(signouts) {
  return (signouts || []).filter((s) => !s.returnedAt);
}

/** Off site past the time they said they would return. */
export function overdue(signouts, now = new Date()) {
  const iso = now.toISOString().slice(0, 16);
  return stillOut(signouts).filter((s) => s.expectedBack && s.expectedBack < iso);
}

// ─── Sick bay ────────────────────────────────────────────────────────────────

export async function fetchSickbay(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, SICKBAY),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.seenAtMs || 0) - (a.seenAtMs || 0));
  } catch (err) {
    console.error("[boarding] could not read sick bay log:", err);
    return [];
  }
}

/**
 * Records a sick bay visit and tells the guardian.
 *
 * Referral out to a clinic or hospital is marked high priority, because that
 * is the case where a family needs to know now rather than at the end of term.
 */
export async function logSickbay({ schoolCode, student, complaint, treatment, referredOut, actor }) {
  if (!schoolCode || !student?.id) return { ok: false, error: "Pick a student." };
  if (!String(complaint || "").trim()) return { ok: false, error: "Record the complaint." };

  try {
    const ref = await addDoc(collection(db, SICKBAY), {
      schoolCode,
      studentId: student.id,
      studentName: student.fullName || "",
      className: student.className || "",
      guardianPhone: student.guardianPhone || "",
      complaint: String(complaint).trim(),
      treatment: String(treatment || "").trim(),
      referredOut: Boolean(referredOut),
      seenBy: actor?.id || "",
      seenByName: actor?.name || "",
      seenAt: serverTimestamp(),
      seenAtMs: Date.now(),
    });

    await notifyGuardians({
      students: [student],
      schoolCode,
      title: referredOut
        ? `${student.fullName} referred to a clinic`
        : `${student.fullName} seen at the sick bay`,
      body: referredOut
        ? `${String(complaint).trim()} — the school has referred them for treatment. Please contact the office.`
        : `${String(complaint).trim()}${treatment ? ` · ${String(treatment).trim()}` : ""}`,
      category: "attendance",
      priority: referredOut ? "high" : "normal",
      actorId: actor?.id || "",
      actorName: actor?.name || "Sick Bay",
      actorRole: actor?.role || "head_teacher",
      tab: "Attendance",
      entityType: "sickbay_visit",
      entityId: ref.id,
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[boarding] sick bay log failed:", err);
    return { ok: false, error: err.message };
  }
}
