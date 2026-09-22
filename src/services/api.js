// src/services/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Calling our own serverless endpoints (/api/...) as the signed-in person.
//
// The endpoint decides what the caller may do from the ID token and their
// `users` profile; nothing the browser sends about who it is, or what it is
// allowed to do, is trusted. Errors carry the server's own message, which the
// endpoints write to be shown to a person.
// ─────────────────────────────────────────────────────────────────────────────
import { auth } from "../firebase";

export async function apiPost(path, body = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in first.");

  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}
