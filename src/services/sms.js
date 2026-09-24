// src/services/sms.js
// ─────────────────────────────────────────────────────────────────────────────
// Sending SMS — or WhatsApp — from the portal. See messageChannel() below for
// which one a school uses.
//
// The transport is the serverless function at `api/send-sms.js`, reached by a
// relative path so the same call works in production and, through the Vite
// proxy, against server.js in development. Twilio credentials live there and
// are never bundled into the browser.
//
// This is the canonical copy. `pages/admin/modules/notifications.js` re-exports
// `sendSms` so the enrolment and staff-creation screens keep their existing
// imports — the same arrangement `phone.js` uses, and for the same reason: the
// services layer cannot reach into `pages/`, and the head teacher's reports
// module needs to send SMS without importing from the admin portal.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from "../firebase";
import { isModuleOn } from "./modules";

/** The route lives at a relative path so dev and production share one call. */
const SMS_ENDPOINT = "/api/send-sms";

/**
 * Which channel the portal uses for a school's direct messages (logins,
 * report-card results): SMS when the school has switched its SMS module on,
 * WhatsApp otherwise. WhatsApp is the default because it costs the school
 * nothing per message and is what most Malawian families already use.
 */
export function messageChannel(settings) {
  return isModuleOn(settings, "sms") ? "sms" : "whatsapp";
}

export const channelLabel = (channel) => (channel === "whatsapp" ? "WhatsApp" : "SMS");

/**
 * Sends one message. Never throws — a failed SMS must not take down the
 * action that triggered it, so the outcome comes back as a value.
 */
export async function sendSms(to, message, { channel = "sms" } = {}) {
  if (!to) return { success: false, reason: "no_number" };
  try {
    // The endpoint only sends for signed-in staff.
    const token = await auth.currentUser?.getIdToken().catch(() => "");
    const res = await fetch(SMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to: String(to).trim(), message, channel }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("SMS failed:", data);
      return { success: false, reason: data.error || "api_error", code: data.code };
    }
    return { success: true, sid: data.sid };
  } catch (err) {
    console.error("SMS error:", err);
    return { success: false, reason: "network_error" };
  }
}

/**
 * Sends to many recipients, a few at a time.
 *
 * Issuing report cards for a whole school is hundreds of messages. Firing them
 * all at once opens hundreds of simultaneous requests, which the browser
 * queues badly and Twilio rate-limits; sending them strictly one after another
 * makes a 600-pupil release take several minutes with no sign of progress. A
 * small concurrency window is the middle ground, and `onProgress` lets the
 * caller show a count that moves.
 *
 * `recipients` is [{ to, message, ref }] where `ref` is anything the caller
 * wants back to identify a failure — a student id, usually.
 */
export async function sendSmsToMany(recipients, { concurrency = 5, onProgress, channel = "sms" } = {}) {
  const list = (recipients || []).filter((r) => r?.to && r?.message);
  const results = { sent: 0, failed: 0, failures: [] };
  if (list.length === 0) return results;

  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const item = list[cursor++];
      const res = await sendSms(item.to, item.message, { channel });
      if (res.success) {
        results.sent += 1;
      } else {
        results.failed += 1;
        // Only the first few failures are kept. A systemic problem — an
        // unverified trial account, a disabled country — fails every single
        // message, and a list of 600 identical errors helps nobody.
        if (results.failures.length < 5) {
          results.failures.push({ ref: item.ref, to: item.to, reason: res.reason, code: res.code });
        }
      }
      onProgress?.(results.sent + results.failed, list.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, worker),
  );

  return results;
}
