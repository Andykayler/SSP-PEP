// src/services/studentLookup.js
// ─────────────────────────────────────────────────────────────────────────────
// The two lookups that reach across schools, asked of the server instead of
// Firestore.
//
// Both used to be direct client queries, and between them they were the only
// reason firestore.rules granted administrators and head teachers read access
// to every child at every other school. That branch is gone; these calls
// replace it. See api/students/lookup.js for the full reasoning.
//
// Everything else about a student is still read straight from Firestore, from
// the school's own roll — nothing here changes how a school reads its own
// records.
// ─────────────────────────────────────────────────────────────────────────────
import { auth } from "../firebase";

async function post(payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to continue.");

  const res = await fetch("/api/students/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = "Lookup failed.";
    try { message = (await res.json())?.error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  return res.json();
}

/**
 * Finds one student anywhere on the platform by their student code.
 * Returns null when there is no such code — which is a normal answer, not an
 * error, because a mistyped code is the common case.
 */
export async function lookupStudentByCode(studentCode) {
  const { student } = await post({ studentCode });
  return student || null;
}

/**
 * Students already attached to these guardian phone numbers, at any school,
 * keyed by phone. Used to decide whether an enrolling child joins an account
 * the family already has.
 */
export async function lookupSiblingsByPhone(phones) {
  const list = Array.isArray(phones) ? phones : [phones];
  const { siblings } = await post({ phones: list });
  return siblings || {};
}
