// api/send-sms.js
// ─────────────────────────────────────────────────────────────────────────────
// Sends one SMS through Twilio, as a Vercel serverless function.
//
// This replaces the equivalent route in server.js for anything deployed. The
// Express server was only ever reachable at http://localhost:3001, so every
// send from the live site failed with a network error — there was no process
// listening. A function needs nothing running: Vercel starts it on the request
// and tears it down after.
//
// Vercel serves any file under a top-level `api/` directory as a function,
// whatever the framework, so this is reachable at /api/send-sms with no route
// configuration. server.js is kept for local development and still owns
// the transfer approvals, which have NOT been ported yet.
//
// Credentials are read from process.env and never leave this file. They are
// not bundled into the browser — vite.config.js allowlists only the EMAILJS_
// and APP_URL prefixes for the client, deliberately excluding TWILIO_.
//
// Required environment variables (Vercel → Settings → Environment Variables,
// ticked for Production, no VITE_ prefix):
//
//   TWILIO_ACC_SID        Account SID, "AC..."
//   TWILIO_AUTH_TOKEN     Account auth token
//   TWILIO_PHONE_NUMBER   Sender in E.164, e.g. +265991234567
//
// Optional, preferred over the account auth token when present:
//
//   TWILIO_API_SID        API Key SID, "SK..."
//   TWILIO_API_KEY        API Key secret
// ─────────────────────────────────────────────────────────────────────────────

/** Twilio accepts E.164 only: a leading + and 7–15 digits, no spaces. */
const E164 = /^\+\d{7,15}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel parses a JSON body for us, but a client that omits the content-type
  // leaves it a raw string — accept both rather than fail on a header.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Body is not valid JSON." });
    }
  }

  const to = String(body?.to ?? "").replace(/\s/g, "");
  const message = body?.message;

  if (!to || !message) {
    return res.status(400).json({ error: "Missing 'to' or 'message'." });
  }
  if (!E164.test(to)) {
    return res.status(400).json({
      error: "Invalid phone number. Use international format, e.g. +265991234567",
    });
  }

  const accountSid = process.env.TWILIO_ACC_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    // Name what is missing — an unconfigured deploy and a bad Twilio
    // credential are otherwise the same opaque 500 in the function logs.
    const missing = [
      !accountSid && "TWILIO_ACC_SID",
      !authToken && "TWILIO_AUTH_TOKEN",
      !fromNumber && "TWILIO_PHONE_NUMBER",
    ].filter(Boolean);
    console.error("SMS not configured — missing:", missing.join(", "));
    return res.status(500).json({ error: "SMS service not configured." });
  }

  // API Key auth is preferred: the key can be revoked on its own, whereas
  // rotating the account auth token invalidates everything at once.
  const authUser = apiKeySid || accountSid;
  const authPass = apiKeySecret || authToken;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " + Buffer.from(`${authUser}:${authPass}`).toString("base64"),
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: message }).toString(),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio rejected the message:", response.status, data?.code, data?.message);
      return res.status(response.status).json({
        error: data?.message || "Twilio request failed.",
        code: data?.code,
      });
    }

    return res.status(200).json({ success: true, sid: data.sid });
  } catch (err) {
    console.error("SMS send failed:", err);
    return res.status(500).json({ error: "Internal error sending SMS." });
  }
}
