// api/_lib/waapi.js
// ─────────────────────────────────────────────────────────────────────────────
// The WhatsApp channel, wrapped so nothing else in the codebase has to know
// its shape.
//
// WaAPI (https://waapi.app) is an unofficial WhatsApp gateway — one "instance"
// is one connected WhatsApp number, paired by QR code, not Meta's official
// WhatsApp Business Platform. That matters for two things this file exists to
// get right:
//
//   1. There is no such thing as a Meta "Flow" or a pre-approved "template"
//      here — sending a message is a single POST with free-form text, and
//      there is no 24-hour customer-service-window restriction to work
//      around, so a payment confirmation is just a plain-text message.
//
//   2. WaAPI does not sign its webhook calls (no HMAC, no signature header —
//      see docs/whatsapp-waapi.md). The only verification it offers is a
//      secret embedded in the webhook URL itself, compared server-side —
//      that check lives in api/whatsapp/webhook.js, not here.
//
// Required environment variables:
//
//   WAAPI_API_TOKEN     the bearer token from WaAPI → your instance → API
//   WAAPI_INSTANCE_ID   the instance id shown on the same screen
//
// Optional:
//
//   WAAPI_API_BASE       defaults to https://waapi.app/api/v1
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.WAAPI_API_BASE || "https://waapi.app/api/v1";

export function isConfigured() {
  return Boolean(process.env.WAAPI_API_TOKEN && process.env.WAAPI_INSTANCE_ID);
}

/** WaAPI addresses a chat as "<digits-only-with-country-code>@c.us". */
export function chatIdFromPhone(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  return `${digits}@c.us`;
}

/** The inverse — a phone in "+265..." form from an inbound "265...@c.us" id. */
export function phoneFromChatId(chatId) {
  const digits = String(chatId || "").split("@")[0].replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

async function call(path, body) {
  if (!isConfigured()) throw new Error("WhatsApp not configured — missing WAAPI_API_TOKEN or WAAPI_INSTANCE_ID.");

  const instanceId = process.env.WAAPI_INSTANCE_ID;
  const res = await fetch(`${API_BASE}/instances/${encodeURIComponent(instanceId)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAAPI_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`WaAPI returned a non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || `WaAPI request to ${path} failed (${res.status}).`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

/**
 * Sends a plain-text WhatsApp message to a phone number — a guardian's
 * `guardianPhone`, or one resolved from an inbound @lid id via resolveLid().
 * Always addressed as "<digits>@c.us"; WaAPI treats that as the canonical
 * identity for a conversation regardless of how an inbound message identified
 * the sender.
 *
 * Never throws into a webhook handler's critical path — every caller wraps
 * this in a try/catch, because a message that fails to send should never take
 * down settlement of a payment that already happened.
 */
export async function sendWhatsAppText(phone, message) {
  return call("/client/action/send-message", {
    chatId: chatIdFromPhone(phone),
    message: String(message || ""),
    previewLink: false,
  });
}

/**
 * Resolves a WaAPI "@lid" chat id to the real phone number behind it, as
 * "<digits>@c.us". Returns the input unchanged if it is not a lid — most
 * senders still show up as a plain phone-based id.
 *
 * WhatsApp's "Linked ID" addressing hides a sender's real number behind an
 * opaque, unguessable identifier; there is no way to derive a phone number
 * from one by parsing it; it has to be asked of WhatsApp. This is what makes
 * the phone-number match against `students.guardianPhone` possible at all
 * for an @lid sender — see api/whatsapp/webhook.js.
 */
export async function resolveLid(chatId) {
  if (!String(chatId || "").endsWith("@lid")) return chatId;

  const data = await call("/client/action/get-lid", { contactIds: [chatId] });
  const contacts = data?.data?.data?.contacts || data?.data?.contacts || data?.contacts || [];
  const pn = contacts[0]?.pn;
  if (!pn) throw new Error(`WaAPI could not resolve a phone number for ${chatId}.`);
  return pn;
}
