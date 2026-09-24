// src/services/campuses.js
// ─────────────────────────────────────────────────────────────────────────────
// Campuses: one school, several sites, one roll that does not silently merge.
//
// A Malawian school group is frequently one legal school with two or three
// physical sites — a town campus and a rural one, or a junior and a senior
// site under the same board. Before this, the only unit was `schoolCode`, so
// those sites had exactly two options, both wrong: register as separate
// schools (and lose the shared board, shared billing and shared reporting), or
// share one school code (and have every class list, register and fee ledger
// silently mix children who have never met).
//
// The model here keeps the school as the unit of ownership and adds the campus
// as the unit of *operation*:
//
//   • A campus belongs to exactly one school and cannot be moved.
//   • Staff are scoped to campuses. A teacher is usually attached to one; a
//     bursar or head may be attached to several; a director or administrator
//     is normally school-wide (`allCampuses`).
//   • A student belongs to exactly one campus, and their record does NOT move
//     between campuses on a whim. Moving one is a request that someone with
//     authority over both sides approves — the same discipline the product
//     already applies to a transfer between schools, applied within the school.
//
// The last point is the one worth defending. Two campuses often run different
// fee structures, different class names and different terms of admission, so a
// record dragged across without review arrives attached to a class that does
// not exist and a fee assignment that no longer applies. Requiring approval
// makes the move a decision with a name and a date on it, which is also what
// an auditor asks for.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc,
  query, where, onSnapshot, serverTimestamp,
} from "firebase/firestore";

export const CAMPUSES = "campuses";
export const CAMPUS_TRANSFERS = "campus_transfer_requests";

/** Status a campus transfer request moves through. */
export const TRANSFER_PENDING  = "pending";
export const TRANSFER_APPROVED = "approved";
export const TRANSFER_REJECTED = "rejected";

/**
 * Roles that may approve a move between campuses.
 *
 * Deliberately narrow: the whole point of the approval is that someone with
 * sight of BOTH campuses signs it off. A head teacher runs one site, so they
 * can raise the request but not grant it.
 */
export const APPROVER_ROLES = ["admin", "director"];

export function canApproveTransfers(user) {
  return APPROVER_ROLES.includes(user?.role);
}

// ─── Codes ───────────────────────────────────────────────────────────────────

/**
 * A short, human-sayable campus code, unique within the school.
 * "Blantyre Main" at school BT-4821 becomes "BT-4821-BM".
 */
export function suggestCampusCode(schoolCode, name, taken = []) {
  const letters = String(name || "")
    .split(/\s+/).filter(Boolean).slice(0, 3)
    .map((w) => w[0]).join("").toUpperCase() || "C1";

  let candidate = `${schoolCode}-${letters}`;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${schoolCode}-${letters}${n++}`;
  return candidate;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function sortCampuses(list) {
  return list.sort((a, b) => {
    if (!!b.isPrimary !== !!a.isPrimary) return b.isPrimary ? 1 : -1;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

/**
 * Every campus of a school, primary site first then alphabetical.
 *
 * Ordering is done here rather than in the query because a school has a
 * handful of campuses, and an orderBy would demand a composite index for the
 * sake of sorting three rows.
 */
export async function fetchCampuses(schoolCode) {
  if (!schoolCode) return [];
  const snap = await getDocs(
    query(collection(db, CAMPUSES), where("schoolCode", "==", schoolCode))
  );
  return sortCampuses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/** Live version of `fetchCampuses`, for shells that keep the picker in sync. */
export function subscribeCampuses(schoolCode, cb) {
  if (!schoolCode) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, CAMPUSES), where("schoolCode", "==", schoolCode)),
    (snap) => cb(sortCampuses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    (err) => { console.error("[campuses] subscribe failed:", err); cb([]); }
  );
}

export async function fetchCampus(campusId) {
  if (!campusId) return null;
  const snap = await getDoc(doc(db, CAMPUSES, campusId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function campusName(campuses, campusId) {
  if (!campusId) return "Unassigned";
  return campuses.find((c) => c.id === campusId)?.name || "Unknown campus";
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Adds a campus. The first one created for a school becomes the primary site,
 * which is what unassigned records fall back to — so a school that never
 * thinks about campuses still has exactly one, and nothing is orphaned.
 */
export async function createCampus({ schoolCode, name, district = "", address = "", phone = "", actorId = "" }) {
  if (!schoolCode) return { ok: false, error: "No school code." };
  if (!String(name || "").trim()) return { ok: false, error: "Give the campus a name." };

  try {
    const existing = await fetchCampuses(schoolCode);
    if (existing.some((c) => (c.name || "").trim().toLowerCase() === name.trim().toLowerCase())) {
      return { ok: false, error: "A campus with that name already exists." };
    }

    const code = suggestCampusCode(schoolCode, name, existing.map((c) => c.code));
    const ref = await addDoc(collection(db, CAMPUSES), {
      schoolCode,
      name: name.trim(),
      code,
      district: district.trim(),
      address: address.trim(),
      phone: phone.trim(),
      isPrimary: existing.length === 0,
      status: "active",
      createdAt: serverTimestamp(),
      createdBy: actorId,
    });
    return { ok: true, id: ref.id, code };
  } catch (err) {
    console.error("[campuses] create failed:", err);
    return { ok: false, error: err.message };
  }
}

export async function updateCampus(campusId, patch) {
  if (!campusId) return { ok: false, error: "No campus." };
  try {
    await updateDoc(doc(db, CAMPUSES, campusId), { ...patch, updatedAt: serverTimestamp() });
    return { ok: true };
  } catch (err) {
    console.error("[campuses] update failed:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Moves the "primary" flag. Exactly one campus holds it, so this clears the
 * others in the same pass rather than leaving two sites both claiming to be
 * the fallback.
 */
export async function setPrimaryCampus({ schoolCode, campusId }) {
  try {
    const all = await fetchCampuses(schoolCode);
    await Promise.all(all.map((c) =>
      updateDoc(doc(db, CAMPUSES, c.id), { isPrimary: c.id === campusId })
    ));
    return { ok: true };
  } catch (err) {
    console.error("[campuses] primary failed:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Retires a campus without deleting it.
 *
 * Deletion is not offered: attendance, marks and fee records all carry a
 * campusId, and removing the document those point at turns years of history
 * into rows labelled "Unknown campus". Archiving keeps the label and takes the
 * site out of every picker.
 */
export async function archiveCampus(campusId) {
  return updateCampus(campusId, { status: "archived" });
}

export async function restoreCampus(campusId) {
  return updateCampus(campusId, { status: "active" });
}

// ─── Access ──────────────────────────────────────────────────────────────────
//
// The rule the whole feature rests on: a staff member sees the campuses they
// are attached to and no others. Two fields express it, because "all" and
// "these three" are genuinely different claims — an `allCampuses` director
// keeps school-wide sight when a fourth campus opens, whereas someone listed
// against three campus ids should NOT silently gain the new one.

/** True when this user may see and act on `campusId`. */
export function canAccessCampus(user, campusId, primaryId = "") {
  if (!user) return false;
  if (user.allCampuses) return true;
  if (!campusId) return true;              // unscoped legacy records stay visible
  const ids = user.campusIds || [];
  // Nobody assigned a campus yet works at the primary site — the same rule as
  // visibleCampuses() below. Without this, a head teacher created before
  // campuses existed saw a student COUNT on their dashboard but an empty
  // Student Management list, because every record is tagged with the primary
  // campus and their (empty) campus list matched none of them. A school with
  // no campuses set up at all has no primary, and everyone sees everything.
  if (ids.length === 0) return !primaryId || campusId === primaryId;
  return ids.includes(campusId);
}

/** The campuses this user may work in, as full campus objects. */
export function visibleCampuses(user, campuses = []) {
  const active = campuses.filter((c) => c.status !== "archived");
  if (!user || user.allCampuses) return active;
  const ids = user.campusIds || [];
  // Nobody assigned a campus yet falls back to the primary site rather than to
  // nothing — an unassigned teacher seeing an empty product looks like a bug,
  // and the primary site is where a single-campus school keeps everything.
  if (ids.length === 0) return active.filter((c) => c.isPrimary);
  return active.filter((c) => ids.includes(c.id));
}

/**
 * Filters any campus-tagged collection down to what this user may see.
 *
 * Applied client-side on purpose. Firestore rules enforce the school boundary,
 * because that is a security boundary — one school must never read another's
 * children. The campus boundary inside a school is an operational one: staff
 * of the same school, under the same head, working on records they are not
 * responsible for. Enforcing it in rules would cost a `users` document read
 * per row on every list, against a hard budget of ten document accesses per
 * query, and would silently break every list the moment a campus is
 * reassigned. See the CAMPUS SCOPING note in firestore.rules.
 */
export function scopeToCampus(rows, user, campusId = null, primaryId = "") {
  return rows.filter((r) => {
    if (campusId) return r.campusId === campusId;
    return canAccessCampus(user, r.campusId, primaryId);
  });
}

/** The campus a new record should default to for this user. */
export function defaultCampusId(user, campuses = []) {
  const mine = visibleCampuses(user, campuses);
  if (mine.length === 1) return mine[0].id;
  return mine.find((c) => c.isPrimary)?.id || mine[0]?.id || "";
}

/** How a user's campus scope reads on screen. */
export function describeScope(user, campuses = []) {
  if (user?.allCampuses) return "All campuses";
  const ids = user?.campusIds || [];
  if (ids.length === 0) return "No campus assigned";
  if (ids.length === 1) return campusName(campuses, ids[0]);
  return `${ids.length} campuses`;
}

// ─── Moving a student between campuses ───────────────────────────────────────

/**
 * Raises a request to move one student to another campus.
 *
 * Nothing about the student changes here. The record stays where it is, and
 * stays visible only to the campus it is on, until an approver acts — which is
 * the entire point: a head teacher cannot quietly walk a roll across to
 * flatter their own numbers, and the receiving campus is not handed a child
 * they have no place for.
 */
export async function requestCampusTransfer({
  schoolCode, student, toCampusId, toCampusName, reason, requestedBy,
}) {
  if (!student?.id) return { ok: false, error: "No student selected." };
  if (!toCampusId) return { ok: false, error: "Choose the campus to move to." };
  if (student.campusId === toCampusId) {
    return { ok: false, error: "The student is already on that campus." };
  }

  try {
    // One open request per student. Without this a form submitted twice
    // produces two approvals for the same move, and the second one moves a
    // child who is already there.
    const open = await getDocs(query(
      collection(db, CAMPUS_TRANSFERS),
      where("studentId", "==", student.id),
      where("status", "==", TRANSFER_PENDING),
    ));
    if (!open.empty) {
      return { ok: false, error: "A transfer request for this student is already awaiting approval." };
    }

    const ref = await addDoc(collection(db, CAMPUS_TRANSFERS), {
      schoolCode,
      studentId: student.id,
      studentName: student.fullName || "",
      studentCode: student.studentCode || "",
      className: student.className || "",
      fromCampusId: student.campusId || "",
      fromCampusName: student.campusName || "",
      toCampusId,
      toCampusName: toCampusName || "",
      reason: String(reason || "").trim(),
      status: TRANSFER_PENDING,
      requestedById: requestedBy?.id || "",
      requestedByName: requestedBy?.name || "",
      requestedByRole: requestedBy?.role || "",
      requestedAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[campuses] transfer request failed:", err);
    return { ok: false, error: err.message };
  }
}

export async function fetchTransferRequests(schoolCode, status = null) {
  if (!schoolCode) return [];
  const clauses = [where("schoolCode", "==", schoolCode)];
  if (status) clauses.push(where("status", "==", status));
  const snap = await getDocs(query(collection(db, CAMPUS_TRANSFERS), ...clauses));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
}

export function subscribeTransferRequests(schoolCode, cb) {
  if (!schoolCode) { cb([]); return () => {}; }
  return onSnapshot(
    query(collection(db, CAMPUS_TRANSFERS), where("schoolCode", "==", schoolCode)),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(rows.sort((a, b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0)));
    },
    (err) => { console.error("[campuses] transfer subscribe failed:", err); cb([]); }
  );
}

/**
 * Approves a move, and only then does the student record change campus.
 *
 * The class is cleared as part of the move rather than carried over. Class
 * names repeat across campuses — both sites have a "Form 2A" — so keeping the
 * old value would leave the child listed in a class on a campus where that
 * register is taken by different staff, for different children. The receiving
 * campus places them, which is a deliberate step, not an oversight.
 */
export async function approveCampusTransfer({ request, approver }) {
  if (!request?.id) return { ok: false, error: "No request." };
  if (!canApproveTransfers(approver)) {
    return { ok: false, error: "Only an administrator or director can approve a campus transfer." };
  }

  try {
    await updateDoc(doc(db, "students", request.studentId), {
      campusId: request.toCampusId,
      campusName: request.toCampusName || "",
      classId: "",
      className: "",
      campusTransferredAt: serverTimestamp(),
    });

    await updateDoc(doc(db, CAMPUS_TRANSFERS, request.id), {
      status: TRANSFER_APPROVED,
      decidedById: approver?.id || "",
      decidedByName: approver?.name || "",
      decidedAt: serverTimestamp(),
    });

    return { ok: true };
  } catch (err) {
    console.error("[campuses] approve failed:", err);
    return { ok: false, error: err.message };
  }
}

export async function rejectCampusTransfer({ request, approver, note = "" }) {
  if (!request?.id) return { ok: false, error: "No request." };
  if (!canApproveTransfers(approver)) {
    return { ok: false, error: "Only an administrator or director can decide a campus transfer." };
  }
  try {
    await updateDoc(doc(db, CAMPUS_TRANSFERS, request.id), {
      status: TRANSFER_REJECTED,
      decisionNote: String(note || "").trim(),
      decidedById: approver?.id || "",
      decidedByName: approver?.name || "",
      decidedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error("[campuses] reject failed:", err);
    return { ok: false, error: err.message };
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * Records how many sites the school runs, on the settings document the setup
 * wizard already writes to. A single-campus school never sees a campus picker
 * anywhere in the product; this flag is what suppresses it.
 */
export async function setCampusMode({ schoolCode, multiCampus, actorId }) {
  if (!schoolCode) return { ok: false, error: "No school code." };
  try {
    await setDoc(doc(db, "school_settings", schoolCode), {
      schoolCode,
      multiCampus: Boolean(multiCampus),
      campusModeSetAt: serverTimestamp(),
      campusModeSetBy: actorId || "",
    }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error("[campuses] campus mode failed:", err);
    return { ok: false, error: err.message };
  }
}

/** True when this school runs more than one site. */
export function isMultiCampus(settings, campuses = []) {
  return Boolean(settings?.multiCampus) ||
         campuses.filter((c) => c.status !== "archived").length > 1;
}
