// src/services/paychangu.js
// ─────────────────────────────────────────────────────────────────────────────
// The browser half of taking a payment.
//
// Deliberately thin. It can ask the server to open a checkout, and it can ask
// the server what happened — it cannot record a payment, quote a subscription
// price, or decide that money arrived. Every one of those lives in api/, where
// the gateway's answer is checked against our own credentials before anything
// is written. See api/_lib/paychangu.js for why that split is the whole point.
// ─────────────────────────────────────────────────────────────────────────────
import { auth } from "../firebase";

/** Payment methods the hosted checkout offers, for the copy on screen. */
export const CHECKOUT_METHODS = [
  { id: "airtel", label: "Airtel Money" },
  { id: "mpamba", label: "TNM Mpamba" },
  { id: "card",   label: "Visa / Mastercard" },
  { id: "bank",   label: "Bank transfer" },
];

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in before starting a payment.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function readError(res, fallback) {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Opens a checkout and hands back the URL to send the payer to.
 *
 * `amount` is honoured for a school fee — part-payment is normal — and ignored
 * for a subscription, which the server reprices from the school's own roll.
 */
export async function startCheckout(payload) {
  const res = await fetch("/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(await readError(res, "Could not start the payment."));
  return res.json();   // { txRef, checkoutUrl, amount, currency }
}

/**
 * Asks the server for the link that sends a school to PayChangu to connect its
 * own account. Administrator only; the server decides that, not this file.
 * @returns {Promise<{ url: string }>}
 */
export async function startConnect() {
  const res = await fetch("/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ action: "connect_start" }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not start the connection."));
  return res.json();
}

/** Hands the server what PayChangu sent the browser back with. Values are never shown or logged here. */
export async function completeConnect(params) {
  const res = await fetch("/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ action: "connect_complete", params }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not finish the connection."));
  return res.json();
}

/**
 * One call to the payout actions (api/_lib/payouts.js): state, banks, saving the
 * school's bank account, requesting, approving, declining. The server decides
 * who may do what; this file only carries the request.
 */
export async function payoutAction(action, payload = {}) {
  const res = await fetch("/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ ...payload, action }),
  });
  if (!res.ok) throw new Error(await readError(res, "That did not work."));
  return res.json();
}

/** One look at a transaction. Settles it server-side if the webhook is late. */
export async function checkStatus(txRef) {
  const res = await fetch(`/api/payments/status?tx_ref=${encodeURIComponent(txRef)}`, {
    headers: await authHeader(),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not check the payment."));
  return res.json();
}

/**
 * Watches a transaction until it resolves.
 *
 * Backs off from two seconds to ten. A mobile-money payment involves the payer
 * typing a PIN on a handset, which takes as long as it takes; polling every
 * two seconds for four minutes would be a hundred needless requests, and each
 * one that finds the transaction pending asks the gateway again on our behalf.
 *
 * Returns a cancel function. Call it when the dialog closes, or a poll keeps
 * running against a component that is gone.
 */
export function watchTransaction(txRef, { onUpdate, onSettled, onError, timeoutMs = 15 * 60 * 1000 } = {}) {
  let cancelled = false;
  let delay = 2000;
  const startedAt = Date.now();

  (async function poll() {
    while (!cancelled) {
      try {
        const state = await checkStatus(txRef);
        if (cancelled) return;
        onUpdate?.(state);
        if (state.status !== "pending") { onSettled?.(state); return; }
      } catch (err) {
        if (cancelled) return;
        // A dropped request is not a failed payment — the money may already be
        // moving. Report it and keep watching.
        onError?.(err);
      }

      if (Date.now() - startedAt > timeoutMs) {
        onError?.(new Error("Still waiting on the gateway. The payment will appear once it clears."));
        return;
      }

      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.4, 10000);
    }
  })();

  return () => { cancelled = true; };
}

/**
 * Sends the payer to the hosted checkout.
 *
 * A new tab is preferred so the bursar keeps their place in the ledger and the
 * polling dialog stays on screen. Popup blockers are common on school laptops,
 * so a blocked window falls back to navigating this tab rather than leaving
 * the user staring at a dialog that never advances.
 */
export function openCheckout(checkoutUrl) {
  const win = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  if (!win || win.closed || typeof win.closed === "undefined") {
    window.location.href = checkoutUrl;
    return false;
  }
  return true;
}
