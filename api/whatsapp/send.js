// api/whatsapp/send.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/send — sends attendance WhatsApps to guardians.
//
// The browser never holds the WaAPI token and never supplies the message text
// or the phone number. It sends only { className, date, items: [{ studentId,
// status }] } plus the teacher's Firebase login token. This endpoint:
//   1. verifies the login token and finds the teacher's school,
//   2. loads each student itself and refuses any from another school,
//   3. takes the phone number from the student's own record,
//   4. builds the message text itself (only Absent / Late are allowed),
//   5. respects the school's WhatsApp settings and the guardian's STOP,
//   6. sends at a gentle pace and records each send in `wa_outbox`.
// So a logged-in user cannot use it to send arbitrary text to arbitrary numbers.
// ─────────────────────────────────────────────────────────────────────────────
import { getAuth } from "firebase-admin/auth";
import { adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import { sendWhatsAppText, isConfigured as waConfigured } from "../_lib/waapi.js";
import { normalisePhone } from "../../src/services/phone.js";
import { tpl } from "../../src/services/messageTemplates.js";

export const config = { maxDuration: 60 };

const MAX_ITEMS = 60;          // one class; keeps a request inside maxDuration
const PACE_MS = 450;           // ~2 messages a second, same as the Cloud Function drain
const PARENT_LINK = "https://parents.acalinks.com";
const GUARDIAN_WA_DEFAULT = [
  "fees", "discipline", "attendance", "announcement", "homework",
  "performance", "report", "health", "transport", "library", "risk",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isOptedOut(phone) {
  try {
    const snap = await adminDb.collection("wa_optouts").doc(phone.replace(/[^\d]/g, "")).get();
    return snap.exists;
  } catch {
    return false;
  }
}

async function log(entry) {
  try {
    await adminDb.collection("wa_outbox").add({
      ...entry,
      source: "vercel",
      attempts: 1,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    });
  } catch { /* the log is a convenience; never fail the send over it */ }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!waConfigured()) return res.status(503).json({ error: "WhatsApp is not configured." });

  // 1. Who is asking
  const bearer = String(req.headers.authorization || "");
  const idToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!idToken) return res.status(401).json({ error: "Sign in required." });

  let uid;
  try {
    uid = (await getAuth().verifyIdToken(idToken)).uid;
  } catch {
    return res.status(401).json({ error: "Invalid sign-in." });
  }

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const user = userSnap.data();
  if (!user || user.status === "disabled" || !user.schoolCode) {
    return res.status(403).json({ error: "Not allowed." });
  }
  const schoolCode = user.schoolCode;

  // 2. What they asked for
  const { className = "", date = "", items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(200).json({ sent: 0, skipped: 0, failed: 0 });
  if (items.length > MAX_ITEMS) return res.status(400).json({ error: `At most ${MAX_ITEMS} learners per request.` });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: "Bad date." });

  // 3. School settings
  const settings = (await adminDb.collection("school_settings").doc(schoolCode).get()).data() || {};
  if (settings.whatsappEnabled === false) return res.status(200).json({ sent: 0, skipped: items.length, failed: 0, reason: "disabled" });
  const categories = Array.isArray(settings.whatsappCategories) ? settings.whatsappCategories : GUARDIAN_WA_DEFAULT;
  if (!categories.includes("attendance")) return res.status(200).json({ sent: 0, skipped: items.length, failed: 0, reason: "category" });
  const schoolName = settings.schoolName || settings.name || "";

  const readableDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short",
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const status = item?.status;
    if ((status !== "Absent" && status !== "Late") || !item?.studentId) { skipped += 1; continue; }

    const snap = await adminDb.collection("students").doc(String(item.studentId)).get();
    const student = snap.exists ? { id: snap.id, ...snap.data() } : null;
    if (!student || student.schoolCode !== schoolCode) { skipped += 1; continue; }

    const phone = normalisePhone(student.guardianPhone);
    if (!phone) { skipped += 1; continue; }
    if (await isOptedOut(phone)) { skipped += 1; continue; }

    const t = tpl.attendance(student, status, className, readableDate);
    const ny = student.guardianLanguage === "ny" || (!student.guardianLanguage && settings.defaultLanguage === "ny");
    const title = (ny && t.titleNy) || t.title || "";
    const body = (ny && t.bodyNy) || t.body || "";
    const footer = `\n\n${PARENT_LINK}\n\n_${schoolName || "Your school"}_\n_${ny ? "Tumizani STOP kuti musiye kulandira mauthenga." : "Reply STOP to stop these messages."}_`;
    const message = `*${title}*\n${body}${footer}`.slice(0, 1500);

    try {
      await sendWhatsAppText(phone, message);
      sent += 1;
      await log({ schoolCode, category: "attendance", recipientId: `parent:${phone}`, to: phone, message, status: "sent", sentAt: FieldValue.serverTimestamp() });
    } catch (err) {
      failed += 1;
      await log({ schoolCode, category: "attendance", recipientId: `parent:${phone}`, to: phone, message, status: "failed", error: String(err.message || err).slice(0, 300) });
    }
    await sleep(PACE_MS);
  }

  return res.status(200).json({ sent, skipped, failed });
}
