// Reads for the bursar's overview. The arithmetic is in financePulseCore.js.
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { computeFinancePulse } from "./financePulseCore";
import { loadPaymentsForYear } from "./paymentsLoad";

async function loadAll(schoolCode, name, extra = []) {
  const snap = await getDocs(query(collection(db, name), where("schoolCode", "==", schoolCode), ...extra));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** This academic year's fee position; the whole ledger when no year is set yet. */
export async function loadFinancePulse({ schoolCode, academicYear = "" }) {
  const yearFilter = academicYear ? [where("academicYear", "==", academicYear)] : [];
  const [students, assignments, payments] = await Promise.all([
    loadAll(schoolCode, "students"),
    loadAll(schoolCode, "fee_assignments", yearFilter),
    loadPaymentsForYear(schoolCode, academicYear),
  ]);
  return computeFinancePulse({
    students, assignments, payments, today: new Date().toISOString().slice(0, 10),
  });
}
