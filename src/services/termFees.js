// Brings a term's billing up to date: every active student carries their
// class's fees for the term. The decisions are in termFeesCore.js; this does
// the reads and writes. Safe to run as often as you like.
import { db } from "../firebase";
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { planTermFees } from "./termFeesCore";

const CHUNK = 400;

async function loadAll(schoolCode, name) {
  const snap = await getDocs(query(collection(db, name), where("schoolCode", "==", schoolCode)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * @returns {Promise<{ created: number, updated: number, removed: number, billed: number }>}
 */
export async function syncTermFees({ schoolCode, term }) {
  if (!schoolCode || !term) return { created: 0, updated: 0, removed: 0, billed: 0 };
  const [students, structures, assignments] = await Promise.all([
    loadAll(schoolCode, "students"),
    loadAll(schoolCode, "fee_structures"),
    loadAll(schoolCode, "fee_assignments"),
  ]);
  const plan = planTermFees({ schoolCode, term, students, structures, assignments });

  const ops = [
    ...plan.create.map((c) => (b) => b.set(doc(db, "fee_assignments", c.id), { ...c.data, createdAt: serverTimestamp() })),
    ...plan.update.map((u) => (b) => b.update(doc(db, "fee_assignments", u.id), { ...u.data, updatedAt: serverTimestamp() })),
    ...plan.remove.map((id) => (b) => b.delete(doc(db, "fee_assignments", id))),
  ];
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }

  const billedStudents = new Set([
    ...assignments.filter((a) => a.term === term).map((a) => a.studentId),
    ...plan.create.map((c) => c.data.studentId),
  ]);
  return {
    created: plan.create.length,
    updated: plan.update.length,
    removed: plan.remove.length,
    billed: billedStudents.size,
  };
}
