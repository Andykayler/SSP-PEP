// api/_lib/paychangu.js
// ─────────────────────────────────────────────────────────────────────────────
// The PayChangu gateway, wrapped so nothing else in the codebase has to know
// its shape.
//
// PayChangu is the Malawian payment processor that fronts Airtel Money, TNM
// Mpamba, local bank cards and Visa/Mastercard behind one hosted checkout. It
// is the right fit here because the money a school collects is overwhelmingly
// mobile money, and a hosted checkout means no card data ever touches this
// application.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: the browser never tells us what was
// paid. A checkout is created server-side from an amount we computed, and a
// payment is only ever recorded after `verifyTransaction` has been asked, over
// our own authenticated connection, what PayChangu believes happened. The
// webhook body is treated as a *hint that something changed*, never as the
// fact itself — a forged webhook and a genuine one then have identical effect,
// which is that we go and ask.
//
// This closes the hole documented at the foot of firestore.rules: parent-app
// payments were self-reported, so a family could type any figure and watch
// their balance drop. Gateway payments land with `source: 'paychangu'` and
// `status: 'verified'`, written by the Admin SDK where no client can reach.
//
// Required environment variables:
//
//   PAYCHANGU_SECRET_KEY     "sec-live-..." or "sec-test-...", from the
//                            PayChangu dashboard → Settings → API Keys
//   PAYCHANGU_WEBHOOK_SECRET the webhook signing secret from the same screen
//
// Optional:
//
//   PAYCHANGU_API_BASE       defaults to https://api.paychangu.com
//   APP_URL                  public origin, used to build the return URL
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

const API_BASE = process.env.PAYCHANGU_API_BASE || "https://api.paychangu.com";

/** PayChangu settles in kwacha; nothing in this product bills another currency. */
export const CURRENCY = "MWK";

function secretKey() {
  const key = process.env.PAYCHANGU_SECRET_KEY;
  if (!key) throw new Error("Payments not configured — missing PAYCHANGU_SECRET_KEY.");
  return key;
}

/**
 * A transaction reference that is unique, ours, and readable in a support call.
 * The purpose is in the prefix so a row in the PayChangu dashboard says what it
 * was for without a lookup: "ACL-FEE-...", "ACL-SUB-...".
 */
export function makeTxRef(purpose) {
  const tag = purpose === "subscription" ? "SUB" : "FEE";
  const stamp = Date.now().toString(36).toUpperCase();
  const salt = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ACL-${tag}-${stamp}-${salt}`;
}

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // A gateway outage returns an HTML error page. Reporting "unexpected token
    // <" helps nobody; the status and a truncated body do.
    throw new Error(`PayChangu returned a non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const message = data?.message || data?.error || `PayChangu request failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

/**
 * Opens a hosted checkout and returns the URL to send the payer to.
 *
 * `amount` is whatever WE computed — a fee balance, a subscription invoice —
 * and is never taken from the request body of a browser call without being
 * re-derived server-side first. See api/payments/initiate.js.
 */
export async function createCheckout({
  txRef, amount, email, firstName, lastName, callbackUrl, returnUrl,
  title, description, meta = {},
}) {
  const data = await call("/payment", {
    method: "POST",
    body: {
      tx_ref: txRef,
      amount: String(amount),
      currency: CURRENCY,
      email: email || undefined,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      // PayChangu calls `callback_url` on completion (server to server) and
      // sends the payer's browser to `return_url`. Both are needed: the
      // webhook is authoritative, the return URL is how the payer gets back.
      callback_url: callbackUrl,
      return_url: returnUrl,
      customization: {
        title: (title || "Acalink").slice(0, 60),
        description: (description || "").slice(0, 200),
      },
      meta,
    },
  });

  const checkoutUrl =
    data?.data?.checkout_url || data?.checkout_url || data?.data?.data?.checkout_url;

  if (!checkoutUrl) {
    throw new Error("PayChangu accepted the request but returned no checkout URL.");
  }

  return { checkoutUrl, raw: data };
}

/**
 * Asks PayChangu what actually happened to a transaction.
 *
 * The single source of truth for money in this system. Returns a normalised
 * shape so callers never reach into the gateway's response layout, which
 * differs between the verify endpoint and the webhook body.
 */
export async function verifyTransaction(txRef) {
  const data = await call(`/verify-payment/${encodeURIComponent(txRef)}`);
  const t = data?.data || data;

  // PayChangu spells success as "success" on the transaction and wraps the
  // envelope in its own "status" — check the inner one, since an envelope of
  // "success" only means the lookup itself worked.
  const rawStatus = String(t?.status || "").toLowerCase();

  return {
    found: Boolean(t && (t.tx_ref || t.reference)),
    // Anything not explicitly successful is treated as not-yet-paid. Recording
    // a payment on an ambiguous status is the one failure mode with no safe
    // recovery, since the family has a receipt for money nobody received.
    paid: rawStatus === "success" || rawStatus === "successful",
    failed: rawStatus === "failed" || rawStatus === "cancelled",
    status: rawStatus || "unknown",
    amount: Number(t?.amount ?? 0),
    currency: t?.currency || CURRENCY,
    txRef: t?.tx_ref || txRef,
    gatewayRef: t?.reference || t?.charge_id || "",
    // "mobile_money" / "card" / "bank_transfer", plus the operator where the
    // gateway supplies it — this is what lands in the bursar's method column.
    channel: t?.type || t?.mode || t?.authorization?.channel || "",
    operator:
      t?.authorization?.mobile_money?.operator ||
      t?.authorization?.channel ||
      t?.authorization?.brand ||
      "",
    payerEmail: t?.email || t?.customer?.email || "",
    raw: t,
  };
}

/**
 * Whether a webhook body really came from PayChangu.
 *
 * PayChangu signs the raw request body with the webhook secret (HMAC-SHA256)
 * and sends the digest in a `Signature` header. The comparison is
 * constant-time; a plain `===` on a secret-derived digest leaks its bytes to
 * anyone patient enough to time the responses.
 *
 * A false result does NOT mean the payment is fake — only that we should not
 * trust this message. The caller still verifies against the API, so an
 * unsigned or misconfigured webhook degrades to "ignored", never to "believed".
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.PAYCHANGU_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = String(signatureHeader).trim().toLowerCase();

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** True when the gateway is configured at all — used for a clear 503. */
export function isConfigured() {
  return Boolean(process.env.PAYCHANGU_SECRET_KEY);
}
