// src/services/schoolOverview.js
// ─────────────────────────────────────────────────────────────────────────────
// The whole school, on one screen, broken down by campus.
//
// Every other module in the product answers a question about one campus, one
// class or one child. The director's question is different and nothing existed
// to answer it: *is the group healthy, and which site is dragging?* That means
// the same handful of measures computed identically for each campus, so two
// campuses can actually be compared — a figure computed one way for the town
// site and another way for the rural one is worse than no figure at all.
//
// Everything is derived from collections that already exist. There is no
// summary document to keep in step, because a stale summary is the failure
// mode leadership dashboards die of: the number on the director's screen and
// the number in the bursar's ledger disagree, and nobody can say which is
// right. The cost is a handful of collection reads per load, which for a
// school of a few thousand records is cheaper than the reconciliation.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { isDeactivated } from "./staffAccountCore";
import { loadPaymentsForYear } from "./paymentsLoad";

/** Roles that count as staff on the establishment, in the order they are shown. */
const STAFF_ROLES = ["head_teacher", "class_teacher", "bursar", "librarian", "director"];

async function loadAll(schoolCode, name, extra = []) {
  const snap = await getDocs(query(collection(db, name), where("schoolCode", "==", schoolCode), ...extra));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Everything the director's screens need, in one pass.
 *
 * `campusId` on a record may be missing — every school predates this feature —
 * so records without one are attributed to the primary campus rather than
 * dropped. A director whose totals silently exclude the school's own history
 * would reasonably conclude the product is broken.
 */
export async function loadSchoolOverview({ schoolCode, campuses = [], academicYear = "" }) {
  if (!schoolCode) return emptyOverview();

  const primaryId = campuses.find((c) => c.isPrimary)?.id || campuses[0]?.id || "";
  const attributed = (row) => row.campusId || primaryId || "unassigned";

  const feeFilters = academicYear ? [where("academicYear", "==", academicYear)] : [];

  const [students, users, payments, assignments] = await Promise.all([
    loadAll(schoolCode, "students"),
    loadAll(schoolCode, "users"),
    loadPaymentsForYear(schoolCode, academicYear),
    loadAll(schoolCode, "fee_assignments", feeFilters),
  ]);

  const activeStudents = students.filter((s) => (s.status || "active") === "active");
  // A deactivated account is no longer on the establishment.
  const staffNow = users.filter((u) => !isDeactivated(u));

  // Fees are summed against the student, then rolled up to that student's
  // campus. Payments carry a campusId only from the point this feature shipped,
  // whereas the student always has one — so going through the student keeps
  // historic payments on the right site instead of stranding them.
  const campusOfStudent = new Map(activeStudents.map((s) => [s.id, attributed(s)]));

  const billed = new Map();
  for (const a of assignments) {
    // Optional fees (bus, uniform…) are not part of what families owe.
    if (a.optional) continue;
    const key = campusOfStudent.get(a.studentId);
    if (!key) continue;
    billed.set(key, (billed.get(key) || 0) + Number(a.amount || a.totalAmount || 0));
  }

  const collected = new Map();
  let unverified = 0;
  for (const p of payments) {
    // A parent-app claim is not money in the bank. Counting it as collected is
    // exactly the error the payment-integrity note in firestore.rules warns
    // about, and it would show up first on this screen.
    if (p.status === "unverified") { unverified += 1; continue; }
    // A payment the bursar turned down never became money either.
    if (p.status === "rejected") continue;
    const key = campusOfStudent.get(p.studentId) || attributed(p);
    collected.set(key, (collected.get(key) || 0) + Number(p.amount || 0));
  }

  const rows = (campuses.length ? campuses : [{ id: primaryId || "unassigned", name: "Main campus", isPrimary: true }])
    .filter((c) => c.status !== "archived")
    .map((c) => {
      const roll = activeStudents.filter((s) => attributed(s) === c.id);
      const staff = staffNow.filter((u) => STAFF_ROLES.includes(u.role) && servesCampus(u, c.id, primaryId));
      const due = billed.get(c.id) || 0;
      const paid = collected.get(c.id) || 0;
      return {
        campusId: c.id,
        campusName: c.name,
        isPrimary: !!c.isPrimary,
        district: c.district || "",
        learners: roll.length,
        boarders: roll.filter((s) => String(s.residence || "").toLowerCase() === "boarding").length,
        girls: roll.filter((s) => String(s.gender || "").toLowerCase() === "female").length,
        boys: roll.filter((s) => String(s.gender || "").toLowerCase() === "male").length,
        staff: staff.length,
        teachers: staff.filter((u) => u.role === "class_teacher").length,
        ratio: staff.filter((u) => u.role === "class_teacher").length
          ? Math.round(roll.length / staff.filter((u) => u.role === "class_teacher").length)
          : null,
        billed: due,
        collected: paid,
        outstanding: Math.max(0, due - paid),
        collectionRate: due > 0 ? Math.round((paid / due) * 100) : null,
      };
    });

  const totals = rows.reduce((acc, r) => ({
    learners: acc.learners + r.learners,
    boarders: acc.boarders + r.boarders,
    staff: acc.staff + r.staff,
    teachers: acc.teachers + r.teachers,
    billed: acc.billed + r.billed,
    collected: acc.collected + r.collected,
    outstanding: acc.outstanding + r.outstanding,
  }), { learners: 0, boarders: 0, staff: 0, teachers: 0, billed: 0, collected: 0, outstanding: 0 });

  totals.collectionRate = totals.billed > 0 ? Math.round((totals.collected / totals.billed) * 100) : null;
  totals.ratio = totals.teachers ? Math.round(totals.learners / totals.teachers) : null;

  return {
    loading: false,
    campuses: rows,
    totals,
    unverifiedPayments: unverified,
    staffByRole: STAFF_ROLES.map((role) => ({
      role,
      count: staffNow.filter((u) => u.role === role).length,
    })),
  };
}

/**
 * Whether a staff member counts against a campus.
 *
 * Someone school-wide counts everywhere, which does inflate a per-campus staff
 * figure — but the alternative, leaving them out, makes a two-campus school
 * look like it employs nobody in finance. The ratio that matters for planning
 * is teachers to learners, and teachers are campus-scoped in practice.
 */
function servesCampus(user, campusId, primaryId) {
  if (user.allCampuses) return true;
  const ids = user.campusIds || [];
  if (ids.length === 0) return campusId === primaryId;
  return ids.includes(campusId);
}

export function emptyOverview() {
  return {
    loading: false,
    campuses: [],
    totals: { learners: 0, boarders: 0, staff: 0, teachers: 0, billed: 0, collected: 0, outstanding: 0, collectionRate: null, ratio: null },
    unverifiedPayments: 0,
    staffByRole: [],
  };
}
