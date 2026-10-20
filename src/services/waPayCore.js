// src/services/waPayCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure half of "which number should the payment come from?" in the
// WhatsApp payment bot. No network and no Firestore, so tests/logic can check
// it; the conversation itself is api/whatsapp/webhook.js.
//
// The number a parent chats from proves who they are (it is matched against the
// student's guardian number). The number they PAY from is a different question —
// families often pay from a partner's, a relative's or a second SIM's mobile
// money wallet — so the bot asks, shows it back, and only then sends the PIN
// prompt. The prompt lands on that handset and needs that person's PIN, so
// typing someone else's number cannot take their money.
// ─────────────────────────────────────────────────────────────────────────────
import { normalisePhone } from "./phone.js";

export const NETWORK_LABEL = { airtel: "Airtel Money", tnm: "TNM Mpamba" };

/** "Reply SAME to use this WhatsApp number" and the ways people say it. */
const SAME_RE = /^\s*(same|this|this\s+number|same\s+number|mine|my\s+number|yes|y|1)\s*$/i;

/**
 * Reads a number the parent typed.
 * @returns {{ ok: true, mobile: string } | { ok: false }}
 *   `mobile` is +265XXXXXXXXX. Anything that is not a Malawian mobile number is
 *   refused rather than passed on for the gateway to reject.
 */
export function parsePayNumber(text, senderPhone) {
  if (SAME_RE.test(String(text || ""))) {
    const own = normalisePhone(senderPhone);
    return /^\+265[89]\d{8}$/.test(own) ? { ok: true, mobile: own } : { ok: false };
  }
  const mobile = normalisePhone(text);
  return /^\+265[89]\d{8}$/.test(mobile) ? { ok: true, mobile } : { ok: false };
}

/**
 * Whether a number plausibly belongs to the network chosen. Only a CLEAR
 * mismatch says no: Airtel numbers start 099/098 and TNM 088/089. Anything else
 * is let through — a wrong guess here would block a valid payer, whereas the
 * gateway will refuse a genuinely wrong number anyway.
 */
export function numberFitsNetwork(mobile, network) {
  const prefix = String(mobile || "").replace(/^\+265/, "").slice(0, 2);
  if (network === "airtel" && ["88", "89"].includes(prefix)) return false;
  if (network === "tnm" && ["98", "99"].includes(prefix)) return false;
  return true;
}

/** +265991234567 → 0991 234 567, the way people write it on a phone. */
export function localDisplay(mobile) {
  const m = /^\+265(\d)(\d{2})(\d{3})(\d{3})$/.exec(String(mobile || ""));
  return m ? `0${m[1]}${m[2]} ${m[3]} ${m[4]}` : String(mobile || "");
}
