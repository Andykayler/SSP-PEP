// pages/api/send-sms.js
// ─── Twilio SMS API Route ─────────────────────────────────────────────────────
// All Twilio credentials stay server-side; the browser never sees them.
// POST  /api/send-sms
// Body: { to: "+265XXXXXXXXX", message: "..." }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: "Missing 'to' or 'message' field." });
  }

  // Validate phone loosely — must start with + and have digits
  if (!/^\+\d{7,15}$/.test(to.replace(/\s/g, ""))) {
    return res.status(400).json({ error: "Invalid phone number format. Use international format e.g. +265991234567" });
  }

  const accountSid  = process.env.TWILIO_ACC_SID;
  const authToken   = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid   = process.env.TWILIO_API_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY;
  const fromNumber  = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio env vars missing");
    return res.status(500).json({ error: "SMS service not configured." });
  }

  // Use API Key auth if provided, otherwise fall back to Account SID + Auth Token
  const authUser   = apiKeySid   || accountSid;
  const authPass   = apiKeySecret || authToken;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    To:   to.replace(/\s/g, ""),
    From: fromNumber,
    Body: message,
  });

  try {
    const response = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        Authorization:   "Basic " + Buffer.from(`${authUser}:${authPass}`).toString("base64"),
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio error:", data);
      return res.status(response.status).json({
        error: data.message || "Twilio request failed.",
        code:  data.code,
      });
    }

    return res.status(200).json({ success: true, sid: data.sid });
  } catch (err) {
    console.error("SMS send error:", err);
    return res.status(500).json({ error: "Internal server error sending SMS." });
  }
}
