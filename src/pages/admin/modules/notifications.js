// ─── EMAIL CONFIG (from .env.local) ──────────────────────────────────────────
export const EMAILJS_SERVICE_ID           = import.meta.env.VITE_EMAILJS_SERVICE_ID           || "";
export const EMAILJS_PUBLIC_KEY           = import.meta.env.VITE_EMAILJS_PUBLIC_KEY           || "";
export const EMAILJS_STAFF_TEMPLATE_ID    = import.meta.env.VITE_EMAILJS_STAFF_TEMPLATE_ID    || "";
export const EMAILJS_GUARDIAN_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_GUARDIAN_TEMPLATE_ID || "";
export const APP_URL                      = import.meta.env.VITE_APP_URL || window.location.origin;

// ─── SMS helper (calls our /api/send-sms route) ───────────────────────────────
export async function sendSms(to, message) {
  if (!to) return { success: false, reason: "no_number" };
  try {
    const res = await fetch("http://localhost:3001/api/send-sms", {
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