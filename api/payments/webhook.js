// api/payments/webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// PayChangu calls this when a checkout finishes. POST /api/payments/webhook
//
// The body is never believed. It supplies one thing — a transaction reference
// — and everything else is established by asking PayChangu directly over our
// own authenticated connection (see api/_lib/settle.js). A forged webhook
// therefore achieves exactly one thing: it makes us look up a reference we
// already issued and find it unpaid.
//
// That design is what lets the signature check be advisory rather than load-
// bearing. Vercel's Node runtime parses the request body before a handler
// sees it, so the exact bytes PayChangu signed are not always recoverable, and
// an HMAC over a re-serialised object will not match. Rather than reject
// genuine webhooks on a byte-for-byte technicality, the signature is checked
// when the raw body IS available and logged either way — while the money
// question is settled by the API call regardless.
//
// Always answers 200 once the reference has been noted. A webhook endpoint
// that returns 500 gets retried, and a retry storm against a transaction that
// is legitimately still pending is noise, not recovery.
// ─────────────────────────────────────────────────────────────────────────────
import { verifyWebhookSignature } from "../_lib/paychangu.js";
import { recordConnectEvent } from "../_lib/connectWebhook.js";
import { payerReturnUrl } from "../_lib/webhookRedirect.js";
import { applyPayoutEvent } from "../_lib/payouts.js";
import { settleTransaction } from "../_lib/settle.js";
import { sendWhatsAppText, isConfigured as waConfigured } from "../_lib/waapi.js";

/**
 * Tells the parent what happened, only for a transaction the WhatsApp bot
 * itself started (`channel: "whatsapp"`) and only on the call that just
 * changed its status — a retried webhook must never re-send the message.
 * Never allowed to affect the settlement result: a WhatsApp outage is not a
 * reason to fail a webhook whose money question is already answered.
 */
async function notifyWhatsApp(result) {
  if (!waConfigured() || result.channel !== "whatsapp" || !result.payerPhone || !result.changed) return;

  const amount = Number(result.amount || 0).toLocaleString("en-MW", { maximumFractionDigits: 0 });
  const name = result.studentName || "your child";

  try {
    if (result.status === "success") {
      const receipt = result.receiptNo ? ` Receipt: ${result.receiptNo}.` : "";
      await sendWhatsAppText(result.payerPhone,
        `Payment received — thank you! MK ${amount} for ${name}'s school fees has been confirmed.${receipt}`);
    } else if (result.status === "failed") {
      await sendWhatsAppText(result.payerPhone,
        `Your payment of MK ${amount} for ${name}'s school fees did not go through. `
        + `Reply "Make Payment" to try again.`);
    }
  } catch (err) {
    console.error("[payments] could not send WhatsApp notification:", err);
  }
}

/**
 * The raw request body, if the runtime left the stream unread.
 * Returns "" when the body was already parsed for us, which is not an error.
 */
async function rawBody(req) {
  if (!req.readable) return "";
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseBody(raw, parsed) {
  if (raw) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof parsed === "string") {
    try { return JSON.parse(parsed); } catch { return {}; }
  }
  return parsed || {};
}

/** Our public origin, for sending a payer's browser on to the result page. */
function originOf(req) {
  if (process.env.APP_URL) {
    const url = process.env.APP_URL;
    return (/^https?:\/\//i.test(url) ? url : `https://${url}`).replace(/\/$/, "");
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  // PayChangu sometimes sends the PAYER'S BROWSER to the callback address
  // after a payment (a GET carrying ?tx_ref=…), not just its server (a POST).
  // A person landing on a JSON error is told their payment failed when it did
  // not, so a browser is passed on to the page that shows the real result.
  // Nothing is settled here: that page asks the status endpoint, which asks
  // PayChangu, exactly as it does for the normal return.
  if (req.method === "GET") {
    const to = payerReturnUrl(req.url, originOf(req));
    if (to) {
      res.setHeader("Location", to);
      return res.status(302).end();
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // The Connect app's own webhook (a school linking its PayChangu account) is
  // pointed at ?source=connect. It is only recorded — see api/_lib/connectWebhook.js.
  const query = new URL(req.url || "/", "http://localhost").searchParams;
  const isConnect = query.get("source") === "connect";

  let payload = {};
  let signatureOk = false;
  try {
    const raw = await rawBody(req);
    payload = parseBody(raw, req.body);

    if (isConnect) {
      recordConnectEvent({ payload, raw, headers: req.headers, schoolCode: query.get("school") || "" });
      return res.status(200).json({ received: true });
    }

    if (raw) {
      const signature = req.headers.signature || req.headers["x-paychangu-signature"];
      const valid = verifyWebhookSignature(raw, signature);
      signatureOk = valid;
      if (!valid) {
        // Logged, not fatal: the verify call below is what decides whether any
        // money moved. Worth watching, though — a signature that never
        // validates usually means PAYCHANGU_WEBHOOK_SECRET is wrong.
        console.warn("[payments] webhook signature did not validate for", payload?.tx_ref);
      }
    }
  } catch (err) {
    console.error("[payments] could not read webhook body:", err);
    return res.status(200).json({ received: true });
  }

  // The outcome of a payout we sent to a school's bank (api.payout).
  if (payload?.event_type === "api.payout") {
    try {
      await applyPayoutEvent(payload, signatureOk);
    } catch (err) {
      console.error("[payout] webhook handling failed:", err);
    }
    return res.status(200).json({ received: true });
  }

  const txRef =
    payload?.tx_ref || payload?.data?.tx_ref || payload?.reference || payload?.meta?.txRef || "";

  if (!txRef) {
    console.warn("[payments] webhook carried no transaction reference");
    return res.status(200).json({ received: true });
  }

  try {
    const result = await settleTransaction(String(txRef));
    console.log("[payments] webhook settled", txRef, result.status, result.alreadySettled ? "(already)" : "");
    await notifyWhatsApp(result);
  } catch (err) {
    // The transaction stays pending and the status poll retries. Still a 200:
    // a gateway retry would hit the same failing dependency.
    console.error("[payments] webhook settlement failed for", txRef, err);
  }

  return res.status(200).json({ received: true });
}
