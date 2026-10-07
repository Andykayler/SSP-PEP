// api/_lib/guardianSend.js
// ─────────────────────────────────────────────────────────────────────────────
// Sends guardian WhatsApps for things a teacher records: an absence or late
// arrival, a discipline case, a new homework. Called by api/whatsapp/webhook.js
// for POST /api/whatsapp/webhook?action=send. It lives in _lib because Vercel's
// Hobby plan caps a deployment at 12 functions and every file in api/ counts.
//
// The browser never holds the WaAPI token and never supplies the message text
// or the phone number. It sends only ids plus the teacher's Firebase login
// token:
//
//   { kind: "attendance", className, date, items: [{ studentId, status }] }
//   { kind: "discipline", caseId }
//   { kind: "homework",   homeworkId }
//
// (A body with no `kind` is treated as attendance, the original shape.)
//
// This handler:
//   1. verifies the login token and finds the teacher's school,
//   2. loads each record itself and refuses any from another school,
//   3. takes phone numbers from the students' own records,
//   4. builds the message text itself, always ending with the parent-app link,
//   5. respects the school's WhatsApp settings and the guardian's STOP,
//   6. sends at a gentle pace and records each send in `wa_outbox`.
// So a logged-in user cannot use it to send arbitrary text to arbitrary numbers.
// A discipline case or homework is sent once only (`whatsappSentAt`), so a
// retried request cannot message the same families twice.
// ─────────────────────────────────────────────────────────────────────────────
import { getAuth } from "firebase-admin/auth";
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { sendWhatsAppText, isConfigured as waConfigured } from "./waapi.js";
import { guardiansOf } from "../../src/services/guardians.js";
import { tpl } from "../../src/services/messageTemplates.js";

const MAX_ITEMS = 60;          // one class; keeps a request inside maxDuration
const PACE_MS = 450;           // ~2 messages a second, same as the Cloud Function drain
const PARENT_LINK = "parents.acalinks.com";
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

function readableDate(iso, opts) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", opts);
}

/** Guardian's language: their own choice, else the school's default. */
function isChichewa(student, settings) {
  return student.guardianLanguage === "ny" || (!student.guardianLanguage && settings.defaultLanguage === "ny");
}

/** The full WhatsApp text: what happened, where to see more, who sent it. */
function composeMessage(t, ny, schoolName) {
  const title = (ny && t.titleNy) || t.title || "";
  const text = (ny && t.bodyNy) || t.body || "";
  const more = ny
    ? `Kuti muwone zambiri, pitani ku ${PARENT_LINK}`
    : `To view more details, visit ${PARENT_LINK}`;
  const stop = ny ? "Tumizani STOP kuti musiye kulandira mauthenga." : "Reply STOP to stop these messages.";
  return `*${title}*\n${text}\n\n${more}\n\n_${schoolName || "Your school"}_\n_${stop}_`.slice(0, 1500);
}

async function loadStudent(id, schoolCode) {
  if (!id) return null;
  const snap = await adminDb.collection("students").doc(String(id)).get();
  const student = snap.exists ? { id: snap.id, ...snap.data() } : null;
  return student && student.schoolCode === schoolCode ? student : null;
}

/**
 * Sends one message per entry of `jobs` ([{ student, template }]). A guardian
 * with two children in the same batch gets each child's message, but the same
 * phone never gets the same text twice.
 */
async function deliver({ jobs, category, schoolCode, settings }) {
  const schoolName = settings.schoolName || settings.name || "";
  const seen = new Set();
  const result = { sent: 0, skipped: 0, failed: 0, reasons: {} };
  const skip = (why) => { result.skipped += 1; result.reasons[why] = (result.reasons[why] || 0) + 1; };

  for (const { student, template } of jobs) {
    if (!student) { skip("not_found"); continue; }
    // Every guardian of the child hears about it, not just the first.
    const phones = guardiansOf(student).map((g) => g.phone);
    if (phones.length === 0) { skip("no_phone"); continue; }

    const message = composeMessage(template, isChichewa(student, settings), schoolName);
    for (const phone of phones) {
      const key = `${phone}|${message}`;
      if (seen.has(key)) { skip("duplicate"); continue; }
      seen.add(key);

      if (await isOptedOut(phone)) { skip("opted_out"); continue; }

      const entry = { schoolCode, category, recipientId: `parent:${phone}`, to: phone, message, studentId: student.id };
      try {
        await sendWhatsAppText(phone, message);
        result.sent += 1;
        await log({ ...entry, status: "sent", sentAt: FieldValue.serverTimestamp() });
      } catch (err) {
        result.failed += 1;
        console.error(`[guardianSend] ${category} to ${phone} failed:`, err.message || err);
        await log({ ...entry, status: "failed", error: String(err.message || err).slice(0, 300) });
      }
      await sleep(PACE_MS);
    }
  }
  return result;
}

// ─── Per-kind job builders ───────────────────────────────────────────────────
// Each returns { jobs } or { error, status } and never trusts the browser for
// anything but ids.

async function attendanceJobs(body, schoolCode) {
  const { className = "", date = "", items } = body;
  if (!Array.isArray(items) || items.length === 0) return { jobs: [] };
  if (items.length > MAX_ITEMS) return { status: 400, error: `At most ${MAX_ITEMS} learners per request.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { status: 400, error: "Bad date." };

  const label = readableDate(date, { weekday: "short", day: "2-digit", month: "short" });
  const jobs = [];
  for (const item of items) {
    const status = item?.status;
    if (status !== "Absent" && status !== "Late") continue;
    const student = await loadStudent(item?.studentId, schoolCode);
    jobs.push({ student, template: student ? tpl.attendance(student, status, className, label) : null });
  }
  return { jobs };
}

async function disciplineJobs(body, schoolCode) {
  const ref = adminDb.collection("discipline_cases").doc(String(body.caseId || "_"));
  const snap = await ref.get();
  const c = snap.data();
  if (!snap.exists || c.schoolCode !== schoolCode) return { status: 404, error: "Case not found." };
  if (c.whatsappSentAt) return { jobs: [], already: true };

  const student = await loadStudent(c.studentId, schoolCode);
  const action = c.action && c.action !== "Pending review" ? c.action : "";
  return {
    jobs: [{ student, template: student ? tpl.discipline(student, { offense: c.offense, action }) : null }],
    markSent: () => ref.update({ whatsappSentAt: FieldValue.serverTimestamp() }),
  };
}

async function homeworkJobs(body, schoolCode) {
  const ref = adminDb.collection("homework").doc(String(body.homeworkId || "_"));
  const snap = await ref.get();
  const hw = snap.data();
  if (!snap.exists || hw.schoolCode !== schoolCode) return { status: 404, error: "Homework not found." };
  if (hw.whatsappSentAt) return { jobs: [], already: true };

  // Same class identity notifyHomeworkPosted uses: classId, name as fallback.
  let q = adminDb.collection("students").where("schoolCode", "==", schoolCode);
  if (hw.classId) q = q.where("classId", "==", hw.classId);
  else if (hw.className) q = q.where("className", "==", hw.className);
  else return { jobs: [] };

  const students = (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const dueLabel = hw.dueDate ? readableDate(hw.dueDate, { day: "2-digit", month: "short" }) : "";
  const template = tpl.homework({ subject: hw.subject, title: hw.title, dueLabel });
  const withClass = {
    ...template,
    body: `${hw.className ? `${hw.className}: ` : ""}${template.body}`,
    bodyNy: `${hw.className ? `${hw.className}: ` : ""}${template.bodyNy}`,
  };
  return {
    jobs: students.map((student) => ({ student, template: withClass })),
    markSent: () => ref.update({ whatsappSentAt: FieldValue.serverTimestamp() }),
  };
}

const KINDS = { attendance: attendanceJobs, discipline: disciplineJobs, homework: homeworkJobs };

export async function handleGuardianSend(req, res) {
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
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const kind = body.kind || "attendance";
  const build = KINDS[kind];
  if (!build) return res.status(400).json({ error: "Unknown kind." });

  // 3. School settings
  const settings = (await adminDb.collection("school_settings").doc(schoolCode).get()).data() || {};
  if (settings.whatsappEnabled === false) return res.status(200).json({ sent: 0, skipped: 0, failed: 0, reason: "disabled" });
  const categories = Array.isArray(settings.whatsappCategories) ? settings.whatsappCategories : GUARDIAN_WA_DEFAULT;
  if (!categories.includes(kind)) return res.status(200).json({ sent: 0, skipped: 0, failed: 0, reason: "category" });

  try {
    const plan = await build(body, schoolCode);
    if (plan.error) return res.status(plan.status || 400).json({ error: plan.error });
    if (plan.already) return res.status(200).json({ sent: 0, skipped: 0, failed: 0, reason: "already_sent" });

    // Claim a one-off record before sending, so a double-click or retry that
    // arrives mid-send finds it taken rather than messaging everyone again.
    if (plan.markSent) await plan.markSent();

    const result = await deliver({ jobs: plan.jobs, category: kind, schoolCode, settings });
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[guardianSend] ${kind} failed:`, err);
    return res.status(500).json({ error: "Could not send WhatsApp messages." });
  }
}
