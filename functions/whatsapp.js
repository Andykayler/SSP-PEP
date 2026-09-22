// functions/whatsapp.js
// ─────────────────────────────────────────────────────────────────────────────
// The WhatsApp gateway (WaAPI), as seen from the Cloud Function.
//
// api/_lib/waapi.js does the same job for the Vercel functions. It cannot be
// imported from here: `firebase deploy --only functions` uploads this folder
// and nothing above it, so the two are kept deliberately small and alike.
//
// WaAPI is an unofficial gateway riding a real WhatsApp number. It has no
// templates and no 24-hour window, which makes sending simple — and makes it
// easy to get the number banned by sending a burst that looks like spam. The
// pacing lives in the outbox drain in index.js, not here.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.WAAPI_API_BASE || "https://waapi.app/api/v1";

/** WaAPI addresses a chat as "<digits-with-country-code>@c.us". */
export function chatIdFromPhone(phone) {
  return `${String(phone || "").replace(/[^\d]/g, "")}@c.us`;
}

/** "+265991234567" when the number looks like a real E.164 number, else "". */
export function cleanPhone(raw) {
  let d = String(raw || "").trim().replace(/[\s\-()]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!d.startsWith("265")) {
    if (/^0\d{9}$/.test(d)) d = `265${d.slice(1)}`;      // 0991234567
    else if (/^\d{9}$/.test(d)) d = `265${d}`;           // 991234567
  }
  return /^\d{9,15}$/.test(d) ? `+${d}` : "";
}

/**
 * Sends a plain-text message. Throws an Error carrying `permanent: true` when
 * retrying cannot help (the gateway rejected the request itself, e.g. a number
 * that is not on WhatsApp), so the drain can stop retrying and fall back to
 * SMS instead of burning three attempts on a dead number.
 */
export async function sendWhatsApp({ token, instanceId }, phone, message) {
  if (!token || !instanceId) {
    const err = new Error("WhatsApp is not configured (WAAPI_API_TOKEN / WAAPI_INSTANCE_ID).");
    err.notConfigured = true;
    throw err;
  }

  const res = await fetch(
    `${API_BASE}/instances/${encodeURIComponent(instanceId)}/client/action/send-message`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chatIdFromPhone(phone), message: String(message || ""), previewLink: false }),
    },
  );

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* keep the raw text for the error */ }

  // WaAPI can answer 200 with a body that says the action failed.
  const bodyFailed = data?.status === "error" || data?.data?.status === "error";
  if (!res.ok || bodyFailed) {
    const err = new Error(
      data?.message || data?.error || data?.data?.message || `WaAPI ${res.status}: ${text.slice(0, 160)}`,
    );
    err.status = res.status;
    // 4xx other than "slow down / timeout" means the request itself was wrong.
    err.permanent = res.ok ? true : (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408);
    throw err;
  }
  return data;
}
