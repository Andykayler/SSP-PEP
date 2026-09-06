// src/services/offlineWrite.js
//
// Firestore's local cache makes writes durable the instant they are issued,
// but the promise a write returns does not settle until the server has
// acknowledged it. Offline that promise never settles at all. Any `await
// setDoc(...)` therefore hangs indefinitely rather than throwing — the data is
// perfectly safe, but the person who pressed Save has no way to know that and
// is left watching a spinner.
//
// `commitWithGrace` resolves that by racing the write against a short timer
// and reporting three distinct outcomes instead of two:
//
//   "saved"  — the server has it.
//   "queued" — it is durable on this device and will sync on its own.
//   "failed" — genuinely refused, e.g. a security rule denial.
//
// Callers should treat "queued" as a success and say so plainly; it is the
// normal outcome in a school with one dongle and intermittent power.

/** How long to wait for the server before calling a write queued. */
export const SYNC_GRACE_MS = 2500;

/**
 * Race a Firestore write against the grace period.
 *
 * @param {Promise<unknown>} write     the promise returned by setDoc/updateDoc/batch.commit
 * @param {object}  [opts]
 * @param {number}  [opts.graceMs]     override the wait before reporting "queued"
 * @param {(err: unknown) => void} [opts.onLateFailure]
 *        Called if a write reported as "queued" is later refused outright —
 *        a rules denial rather than a slow network. Use it to correct the UI,
 *        otherwise the user is left believing the write landed.
 * @returns {Promise<{status: "saved" | "queued" | "failed", error?: unknown}>}
 */
export async function commitWithGrace(write, { graceMs = SYNC_GRACE_MS, onLateFailure } = {}) {
  // Fold rejection into the resolved value, so a failure arriving after the
  // race has been decided cannot surface as an unhandled rejection.
  const settled = Promise.resolve(write).then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error }),
  );

  let timer;
  const outcome = await Promise.race([
    settled,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), graceMs); }),
  ]);
  clearTimeout(timer);

  if (outcome === null) {
    if (onLateFailure) {
      settled.then((late) => { if (!late.ok) onLateFailure(late.error); });
    }
    return { status: "queued" };
  }
  return outcome.ok ? { status: "saved" } : { status: "failed", error: outcome.error };
}
