// api/_lib/email.js
// ─────────────────────────────────────────────────────────────────────────────
// Sends transactional email through Resend (installed from the Vercel
// Marketplace, which sets RESEND_API_KEY on the project).
//
// Environment:
//   RESEND_API_KEY   set by the Resend integration
//   EMAIL_FROM       e.g. "Acalink <hello@acalink.mw>" — MUST be an address on
//                    a domain verified in Resend (SPF + DKIM records added to
//                    the domain's DNS). That verification is what keeps mail
//                    out of spam; no amount of template work substitutes for it.
//   EMAIL_REPLY_TO   optional; where replies go (a monitored inbox)
//
// Never throws: an email that fails must not fail the action that caused it
// (a registration, an approval). The outcome comes back as a value.
// ─────────────────────────────────────────────────────────────────────────────

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * @param {{ to: string|string[], subject: string, html: string, text: string, tag?: string }} msg
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text, tag }) {
  if (!emailConfigured()) {
    console.warn("[email] not configured — set RESEND_API_KEY and EMAIL_FROM.");
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
        ...(tag ? { tags: [{ name: "type", value: tag }] } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[email] Resend rejected:", res.status, data?.message || data);
      return { ok: false, error: data?.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    console.error("[email] send failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/** The site's public address, for links in emails. */
export function appUrl() {
  return (process.env.APP_URL || "https://ssp-pep.vercel.app").replace(/\/$/, "");
}
