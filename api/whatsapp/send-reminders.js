// api/whatsapp/send-reminders.js
// ─────────────────────────────────────────────────────────────────────────────
// The bursar's "send WhatsApp reminders now" button. POST /api/whatsapp/send-reminders
//
// Reachable only by the bursar or an administrator, scoped to their own
// school — the same FINANCE_ROLES check api/payments/initiate.js uses for
// collecting a fee. The client may name which students to message (so the
// bursar's on-screen filter/search is respected), but never their balance or
// wording: every row is recomputed here from `fee_assignments` and `payments`
// via api/_lib/feeBalance.js, and the message text comes from the same
// three-stage escalation `src/components/fees/ArrearsModule.jsx` already uses
// for its in-app "Send reminders" button (src/services/feeReminderCore.js) —
// so a family in arrears sees the same figure and the same tone on WhatsApp
// as everywhere else Acalink tells them about it.
//
// WHY THIS DOES NOT JUST FIRE EVERYTHING AT ONCE
//
// WaAPI is an unofficial gateway riding a real WhatsApp account, not Meta's
// bulk-messaging-aware Business Platform — sending a burst of near-identical
// messages in a few seconds is exactly the pattern WhatsApp's own spam
// detection looks for, and getting the connected number banned would take
// down every channel this integration has, not just reminders. So sends are
// throttled to roughly two a second and capped per call; a school with more
// families in arrears than the cap needs a second click (the endpoint reports
// how many are left) rather than a queueing system this pass doesn't build.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth, adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import { isDeactivated } from "../../src/services/staffAccountCore.js";
import { sendWhatsAppText, isConfigured as waConfigured } from "../_lib/waapi.js";
import { computeSchoolArrears } from "../_lib/feeBalance.js";
import { stageFor } from "../../src/services/feeReminderCore.js";
import { normalisePhone } from "../../src/services/phone.js";

const FINANCE_ROLES = ["admin", "bursar"];
const SENT_LOG = "wa_reminders_sent";

/** Keeps the send rate well under anything that looks automated/bulk. */
const THROTTLE_MS = 400;
/**
 * A school with more families in arrears than this needs a second click.
 * Sized to stay well inside the 60s function timeout (vercel.json) even with
 * the throttle above plus real WaAPI network latency per send.
 */
const MAX_PER_CALL = 60;

function readBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body || {};
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function authenticate(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "Sign in first." };

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { error: "Your session has expired. Sign in again." };
  }

  let userSnap;
  try {
    userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  } catch (err) {
    console.error("[whatsapp] could not read staff profile:", err);
    return { error: "Could not verify your account. Please try again." };
  }
  if (!userSnap.exists) return { error: "No staff profile is attached to this account." };
  const user = userSnap.data();
  if (isDeactivated(user)) return { error: "This account has been deactivated. Contact your school administrator." };
  if (!FINANCE_ROLES.includes(user.role)) {
    return { error: "Only the bursar or an administrator can send fee reminders." };
  }
  if (!user.schoolCode) return { error: "No school is attached to this account." };
  return { user, uid: decoded.uid };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!waConfigured()) {
    return res.status(503).json({ error: "WhatsApp is not configured for this deployment." });
  }

  const body = readBody(req);
  if (!body) return res.status(400).json({ error: "Body is not valid JSON." });

  const auth = await authenticate(req);
  if (auth.error) return res.status(401).json({ error: auth.error });

  const schoolCode = auth.user.schoolCode;

  try {
    const { currentTerm, rows } = await computeSchoolArrears(schoolCode);
    if (!currentTerm) {
      return res.status(400).json({ error: "Set the current term before sending reminders." });
    }

    // An explicit studentIds list respects the bursar's on-screen filter
    // (bucket, search); omitting it targets every family in arrears.
    const wanted = Array.isArray(body.studentIds) && body.studentIds.length
      ? new Set(body.studentIds)
      : null;

    const targets = rows.filter((r) => (
      r.balance > 0 && r.guardianPhone && (!wanted || wanted.has(r.id))
    ));

    if (targets.length === 0) {
      return res.status(200).json({ sent: 0, failed: 0, total: 0, message: "No outstanding balances to remind." });
    }

    const batch = targets.slice(0, MAX_PER_CALL);
    const remaining = Math.max(0, targets.length - batch.length);

    let sent = 0;
    const failures = [];

    for (const row of batch) {
      const stage = stageFor(row);
      if (!stage) continue;

      const phone = normalisePhone(row.guardianPhone);
      const message = `${stage.body(row, { term: currentTerm, currency: "MK " })}\n\n`
        + `You can also pay right now — reply "Make Payment" here on WhatsApp.`;

      try {
        await sendWhatsAppText(phone, message);
        sent += 1;
        await adminDb.collection(SENT_LOG).add({
          schoolCode,
          studentId: row.id,
          studentName: row.fullName || "",
          guardianPhone: phone,
          balance: row.balance,
          stage: stage.stage,
          stageId: stage.id,
          term: currentTerm,
          sentBy: auth.uid || "",
          sentByName: auth.user.name || "",
          sentAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.error("[whatsapp] reminder failed for", row.id, err);
        failures.push({ studentId: row.id, studentName: row.fullName || "", error: err.message });
      }

      await sleep(THROTTLE_MS);
    }

    return res.status(200).json({
      sent, failed: failures.length, total: batch.length, remaining, failures,
    });
  } catch (err) {
    console.error("[whatsapp] send-reminders failed:", err);
    return res.status(502).json({ error: err.message || "Could not send reminders." });
  }
}
