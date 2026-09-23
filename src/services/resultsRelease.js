// The bursar's releases: showing a family their child's results for a term
// even though fees are still owed. Rules are in resultsAccessCore.js.
import { db } from "../firebase";
import { collection, doc, getDocs, query, setDoc, where, serverTimestamp } from "firebase/firestore";
import { notifyGuardians } from "./notifications";
import { RELEASES, releaseId } from "./resultsAccessCore";

export { resultsAccess, releaseActive, withheldMessage } from "./resultsAccessCore";

/** Every release decision for a term, keyed by studentId. */
export async function fetchReleases(schoolCode, term) {
  if (!schoolCode || !term) return new Map();
  const snap = await getDocs(query(
    collection(db, RELEASES),
    where("schoolCode", "==", schoolCode),
    where("term", "==", term),
  ));
  return new Map(snap.docs.map((d) => [d.data().studentId, { id: d.id, ...d.data() }]));
}

/**
 * Release (approve = true) or withdraw a release. Releasing tells the family
 * their child's results are now available.
 */
export async function setResultsRelease({ schoolCode, student, term, approve, actor, note = "" }) {
  await setDoc(doc(db, RELEASES, releaseId(schoolCode, student.id, term)), {
    schoolCode,
    studentId: student.id,
    studentName: student.fullName || "",
    className: student.className || "",
    term,
    status: approve ? "approved" : "revoked",
    balanceAtDecision: Number(student.balance) || 0,
    note: String(note || "").trim(),
    decidedBy: actor?.id || "",
    decidedByName: actor?.name || "",
    decidedAt: serverTimestamp(),
  });

  if (approve) {
    await notifyGuardians({
      students: [student],
      schoolCode,
      title: `Results available — ${student.fullName || "your child"}`,
      body: `${student.fullName || "Your child"}'s ${term} results are now available in ACALink.`,
      category: "performance",
      actorId: actor?.id || "",
      actorName: actor?.name || "Finance Office",
      actorRole: actor?.role || "bursar",
      tab: "Results",
      entityType: "results_release",
    }).catch((err) => console.error("[results] release notice failed:", err));
  }
}
