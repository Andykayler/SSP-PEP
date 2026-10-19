// src/services/connectRequests.js
// ─────────────────────────────────────────────────────────────────────────────
// A school asking to receive online fee payments in its OWN PayChangu account
// rather than through Acalink's.
//
// Until a school asks, and until the link is made, it is paid the way every
// school is today: the family's payment lands in Acalink's PayChangu account and
// the school's share is paid out to its mobile money number. A request changes
// nothing about that by itself — it only tells Acalink the school wants to move.
//
// One document per school (id = schoolCode), so a second click is the same
// request rather than a second one. It is created by an administrator and
// never edited by the browser; whoever links the account does that server-side.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export const CONNECT_REQUESTED = "requested";

/** The school's request, or null if it has never asked. */
export async function fetchConnectRequest(schoolCode) {
  if (!schoolCode) return null;
  const snap = await getDoc(doc(db, "connect_requests", schoolCode));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Records the request. Safe to call twice: the document id is the school. */
export async function requestOwnAccount({ schoolCode, user, note = "" }) {
  if (!schoolCode) throw new Error("No school selected.");
  await setDoc(doc(db, "connect_requests", schoolCode), {
    schoolCode,
    status: CONNECT_REQUESTED,
    requestedById: user?.uid || "",
    requestedByName: user?.displayName || user?.email || "",
    note: String(note).slice(0, 500),
    requestedAt: serverTimestamp(),
  });
}
