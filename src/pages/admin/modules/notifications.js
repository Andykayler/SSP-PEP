// ─── EMAIL CONFIG ────────────────────────────────────────────────────────────
// Names carry no VITE_ prefix because that is how they are set in the Vercel
// project. They still reach the browser only because vite.config.js allowlists
// the EMAILJS_ and APP_URL prefixes — drop that and every value here silently
// becomes "", which EmailJS rejects without any error you would notice.
//
// These are inlined at BUILD time, not read at runtime: changing one in the
// Vercel dashboard does nothing until the next deploy.
export const EMAILJS_SERVICE_ID           = import.meta.env.EMAILJS_SERVICE_ID           || "";
export const EMAILJS_PUBLIC_KEY           = import.meta.env.EMAILJS_PUBLIC_KEY           || "";
export const EMAILJS_STAFF_TEMPLATE_ID    = import.meta.env.EMAILJS_STAFF_TEMPLATE_ID    || "";
export const EMAILJS_GUARDIAN_TEMPLATE_ID = import.meta.env.EMAILJS_GUARDIAN_TEMPLATE_ID || "";
export const APP_URL                      = import.meta.env.APP_URL || window.location.origin;

// ─── SMS helper (calls our /api/send-sms route) ───────────────────────────────
//
// The path is relative, which is what lets the same code work in both places:
// in production it hits the serverless function in api/send-sms.js, and in
// `npm run dev` the Vite proxy forwards /api to server.js on port 3001.
// Twilio credentials stay server-side either way — they are never bundled.
export async function sendSms(to, message) {
  if (!to) return { success: false, reason: "no_number" };
  try {
    const res = await fetch("/api/send-sms", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ to: to.trim(), message }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("SMS failed:", data);
      return { success: false, reason: data.error || "api_error" };
    }
    return { success: true };
  } catch (err) {
    console.error("SMS error:", err);
    return { success: false, reason: "network_error" };
  }
}

// ─── EMAIL helper ─────────────────────────────────────────────────────────────
export async function sendEmail({ templateId, toEmail, toName, params }) {
  try {
    const payload = {
      service_id:  EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id:     EMAILJS_PUBLIC_KEY,
      template_params: {
        to_name:  toName,
        to_email: toEmail,
        reply_to: toEmail,
        ...params,
      },
    };

    console.log("📧 EmailJS sending to:", toEmail);
    console.log("📧 Service ID :", EMAILJS_SERVICE_ID);
    console.log("📧 Template ID:", templateId);
    console.log("📧 Public Key :", EMAILJS_PUBLIC_KEY);

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("❌ EmailJS error:", response.status, text);
      return false;
    }

    console.log("✅ Email sent to:", toEmail);
    return true;

  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    return false;
  }
}