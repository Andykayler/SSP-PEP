// api/_lib/feeBalance.js
// ─────────────────────────────────────────────────────────────────────────────
// "What does this student owe, right now" — for the WhatsApp bot.
//
// Computed with the exact same allocation rule as the bursar's Arrears screen
// (src/services/feeAllocationCore.js — oldest charge paid down first,
// resolved against the school's currentTerm), reading the same collections
// (`fee_assignments`, `payments`, `school_settings`) via the Admin SDK. This
// is deliberately NOT a second definition of "balance" — a WhatsApp bot that
// disagreed with the bursar's own screen about what a family owes would be
// worse than not existing.
//
// Only confirmed money counts, same as the Arrears screen: a `payments` row
// with `status !== "verified"` is a family's unconfirmed claim, not money the
// school has, and counting it would tell a parent over WhatsApp that they are
// paid up when they are not.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb } from "./firebaseAdmin.js";
import { allocate, buildArrears } from "../../src/services/feeAllocationCore.js";

/** The term a school is currently running, or "" if never set. */
export async function getCurrentTerm(schoolCode) {
  if (!schoolCode) return "";
  const snap = await adminDb.collection("school_settings").doc(schoolCode).get();
  return snap.exists ? (snap.data().currentTerm || "") : "";
}

/**
 * Every student record whose guardian phone matches — normalised numbers only,
 * so the caller must pass the same spelling `guardianPhone` is stored in
 * (see api/_lib/waapi.js, which normalises the WhatsApp sender number the
 * same way src/services/phone.js does everywhere else in the product).
 */
export async function findStudentsByGuardianPhone(phone) {
  if (!phone) return [];
  const snap = await adminDb.collection("students").where("guardianPhone", "==", phone).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => (s.status || "active") === "active");
}

/**
 * A single student's balance, computed the same way the Arrears screen does.
 * Returns null if the school has never set a current term — there is nothing
 * sortable to allocate against yet.
 */
export async function computeStudentBalance(student) {
  const schoolCode = student.schoolCode;
  const currentTerm = await getCurrentTerm(schoolCode);
  if (!currentTerm) return null;

  const [chargeSnap, paySnap] = await Promise.all([
    adminDb.collection("fee_assignments").where("studentId", "==", student.id).get(),
    adminDb.collection("payments").where("studentId", "==", student.id).get(),
  ]);

  const charges = chargeSnap.docs.map((d) => d.data());
  const payments = paySnap.docs
    .map((d) => d.data())
    .filter((p) => p.status === "verified");

  return { currentTerm, ...allocate(charges, payments, currentTerm) };
}

/**
 * Every active student in a school with their balance attached — the same
 * shape src/components/fees/ArrearsModule.jsx builds client-side, computed
 * server-side for the WhatsApp bulk reminder sender so it does not have to
 * trust a list of "who owes what" handed to it by the browser.
 *
 * One set of school-wide reads rather than N per-student reads — cheap for a
 * whole school, unlike calling computeStudentBalance in a loop.
 */
export async function computeSchoolArrears(schoolCode) {
  if (!schoolCode) return { currentTerm: "", rows: [] };
  const currentTerm = await getCurrentTerm(schoolCode);
  if (!currentTerm) return { currentTerm: "", rows: [] };

  const [studentSnap, chargeSnap, paySnap] = await Promise.all([
    adminDb.collection("students").where("schoolCode", "==", schoolCode).get(),
    adminDb.collection("fee_assignments").where("schoolCode", "==", schoolCode).get(),
    adminDb.collection("payments").where("schoolCode", "==", schoolCode).get(),
  ]);

  const students = studentSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => (s.status || "active") === "active");
  const charges = chargeSnap.docs.map((d) => d.data());
  const payments = paySnap.docs.map((d) => d.data()).filter((p) => p.status === "verified");

  return { currentTerm, rows: buildArrears({ students, charges, payments, currentTerm }) };
}
