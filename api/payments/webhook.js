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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let payload = {};
  try {
    const raw = await rawBody(req);
    payload = parseBody(raw, req.body);

    if (raw) {
      const signature = req.headers.signature || req.headers["x-paychangu-signature"];
      const valid = verifyWebhookSignature(raw, signature);
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
