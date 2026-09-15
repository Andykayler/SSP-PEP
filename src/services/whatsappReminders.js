// src/services/whatsappReminders.js
// ─────────────────────────────────────────────────────────────────────────────
// The browser half of the bursar's "Send WhatsApp reminders" button.
//
// Deliberately thin, same reasoning as src/services/paychangu.js: it names
// which students to consider, and the server decides what each actually owes
// and what wording that warrants — see api/whatsapp/send-reminders.js.
// ─────────────────────────────────────────────────────────────────────────────
import { auth } from "../firebase";

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in first.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * @param {string[]} [studentIds] Restrict to these students (the bursar's
 *   current filter/search). Omit to target every family in arrears.
 * @returns {{ ok: boolean, sent?: number, failed?: number, total?: number,
 *   remaining?: number, failures?: Array, error?: string, message?: string }}
 */
export async function sendWhatsAppReminders(studentIds) {
  try {
    const res = await fetch("/api/whatsapp/send-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(studentIds ? { studentIds } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Could not send reminders." };
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
