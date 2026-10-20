// src/services/paymentsLoad.js
// ─────────────────────────────────────────────────────────────────────────────
// Loads a school's payments for one academic year.
//
// The ledger screens ask for `academicYear == <this year>`, which silently drops
// any payment saved WITHOUT a year — and those exist: payments taken through
// WhatsApp (before the server filled the year in) carried a blank one, so the
// bursar's list showed nothing for money that had really arrived and been
// receipted. A payment with no year belongs to no year, so it is shown with
// whichever year is open rather than hidden from all of them.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";

const millis = (p) => p.createdAt?.toMillis?.() || 0;

/** @returns {Promise<object[]>} newest first; the whole ledger when no year is set. */
export async function loadPaymentsForYear(schoolCode, academicYear = "") {
  const base = [collection(db, "payments"), where("schoolCode", "==", schoolCode)];
  if (!academicYear) {
    const snap = await getDocs(query(...base));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b) - millis(a));
  }
  const [year, blank] = await Promise.all([
    getDocs(query(...base, where("academicYear", "==", academicYear), orderBy("createdAt", "desc"))),
    getDocs(query(...base, where("academicYear", "==", ""), orderBy("createdAt", "desc"))),
  ]);
  const seen = new Set();
  return [...year.docs, ...blank.docs]
    .filter((d) => (seen.has(d.id) ? false : seen.add(d.id)))
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => millis(b) - millis(a));
}
