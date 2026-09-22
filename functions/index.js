// functions/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Delivers `notifications` documents to people — WhatsApp first.
//
// Every alert the school raises is one `notifications` document. This file is
// what turns that document into something that reaches a phone:
//
//   1. WHATSAPP  the primary channel, for guardians and for staff. Messages go
//                through an outbox (`wa_outbox`) that a scheduled function
//                drains at a steady pace, because WaAPI is an unofficial
//                gateway riding a real number and a burst of near-identical
//                messages is exactly what gets such a number banned. Only an
//                urgent alert skips the queue.
//   2. PUSH      free, and still sent to any guardian who has the app.
//   3. SMS       a fallback, not a peer: it fires only where WhatsApp could not
//                carry the message (switched off, not configured, a number that
//                is not on WhatsApp, or three failed attempts) and the school
//                has opted that category into SMS. See src/services/smsFallback.js.
//
// Who gets a WhatsApp is a school setting (`school_settings/{code}`):
//   whatsappEnabled        default true
//   whatsappCategories     default: every guardian-facing category
//   whatsappStaffAlerts    default true
//   defaultLanguage        "en" | "ny" — a guardian's own `guardianLanguage` wins
//
// Deploy once and it stays up:
//
//     firebase deploy --only functions
//
// Requires the Blaze plan. Secrets:
//
//     firebase functions:secrets:set WAAPI_API_TOKEN
//     firebase functions:secrets:set WAAPI_INSTANCE_ID
//     firebase functions:secrets:set TWILIO_ACC_SID          (SMS fallback, optional)
//     firebase functions:secrets:set TWILIO_AUTH_TOKEN
//     firebase functions:secrets:set TWILIO_PHONE_NUMBER
//
// scripts/push-worker.js is kept for local testing against the emulator. Do
// not run both against the same project — `pushedAt` stops a double send, but
// the two would race for it.
// ─────────────────────────────────────────────────────────────────────────────
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { sendWhatsApp, cleanPhone } from "./whatsapp.js";

// Held as deployed secrets rather than plain config so they are not readable
// from the function's environment listing. Absent secrets are not an error —
// that channel simply stays off.
const TWILIO_ACC_SID = defineSecret("TWILIO_ACC_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = defineSecret("TWILIO_PHONE_NUMBER");
const WAAPI_API_TOKEN = defineSecret("WAAPI_API_TOKEN");
const WAAPI_INSTANCE_ID = defineSecret("WAAPI_INSTANCE_ID");
/** Public origin of the web app, for the sign-in link in approval messages. */
const APP_URL = defineString("APP_URL", { default: "" });

const SECRETS = [TWILIO_ACC_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, WAAPI_API_TOKEN, WAAPI_INSTANCE_ID];

initializeApp();
const db = getFirestore();
const fcm = getMessaging();

// A school's traffic is bursty — a whole class's marks publish at once — but
// tiny in absolute terms. Keeping the ceiling low bounds the bill if anything
// ever loops.
//
// No region is pinned here: a Firestore trigger has to sit in the same
// location as the database, and that varies per project. If `firebase deploy`
// reports a location mismatch, add the database's region — for example
// `region: "europe-west1"` — to the options below.
setGlobalOptions({ maxInstances: 10 });

/** Only guardians get pushes; staff have the portal open and its own bell. */
const PARENT_PREFIX = "parent:";

const waCredentials = () => ({
  token: WAAPI_API_TOKEN.value(),
  instanceId: WAAPI_INSTANCE_ID.value(),
});
const waConfigured = () => {
  const c = waCredentials();
  return Boolean(c.token && c.instanceId);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Android notification channel + tap payload for one notification document.
 *
 * The `notification` block is what makes this work when the app is closed:
 * a data-only message is handed to the app, and a closed app cannot display
 * anything. With `notification` present, Android's system tray shows it
 * whether or not the app is running.
 */
function buildMessage(n, tokens) {
  return {
    tokens,
    notification: {
      title: n.title || "ACALink",
      body: (n.body || "").slice(0, 240),
    },
    data: {
      // Strings only — FCM rejects other types in the data payload.
      notificationId: n.id,
      category: String(n.category || "system"),
      entityType: String(n.entityType || ""),
      entityId: String(n.entityId || ""),
      studentId: String(n.studentId || ""),
    },
    android: {
      priority: n.priority === "urgent" || n.priority === "high" ? "high" : "normal",
      notification: {
        // Must match default_notification_channel_id in AndroidManifest.xml.
        // Android silently drops a message for a channel that does not exist.
        channelId: "acalink_default",
        // Collapse repeats about the same record rather than stacking them.
        tag: `${n.category || "system"}:${n.entityId || n.id}`,
      },
    },
    apns: {
      payload: { aps: { sound: "default" } },
    },
  };
}

async function tokensFor(parentId) {
  const snap = await db
    .collection("parent_devices")
    .where("parentId", "==", parentId)
    .get();
  return snap.docs.map((d) => d.id);
}

/** Drops registrations FCM tells us are dead, so the list stays honest. */
async function pruneDeadTokens(tokens, responses) {
  const dead = [];
  responses.forEach((r, i) => {
    const code = r.error?.code || "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      dead.push(tokens[i]);
    }
  });
  if (dead.length === 0) return;
  const batch = db.batch();
  dead.forEach((t) => batch.delete(db.collection("parent_devices").doc(t)));
  await batch.commit();
  logger.info(`pruned ${dead.length} dead token(s)`);
}

// ─── School context ──────────────────────────────────────────────────────────
// Settings and the school's name are read once per notification, and a class
// fan-out is hundreds of notifications for one school — so without a cache,
// publishing marks to 600 pupils is 1,200 identical reads. Instances are
// reused between invocations, so a short TTL collapses a burst into one read
// while still picking up a change from the settings screen within the minute.
const contextCache = new Map();
const CONTEXT_TTL_MS = 60_000;

async function schoolContext(schoolCode) {
  const empty = { settings: {}, school: {}, schoolName: "" };
  if (!schoolCode) return empty;

  const hit = contextCache.get(schoolCode);
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.ctx;

  let ctx = empty;
  try {
    const [settingsSnap, schoolSnap] = await Promise.all([
      db.collection("school_settings").doc(schoolCode).get(),
      db.collection("schools").doc(schoolCode).get(),
    ]);
    const school = schoolSnap.exists ? schoolSnap.data() : {};
    ctx = {
      settings: settingsSnap.exists ? settingsSnap.data() : {},
      school,
      schoolName: school.name || "",
    };
  } catch (err) {
    // A read failure must not stop the notification being stamped.
    logger.error(`context read failed for ${schoolCode}: ${err.message}`);
  }

  contextCache.set(schoolCode, { ctx, at: Date.now() });
  return ctx;
}

// ─── WhatsApp policy ─────────────────────────────────────────────────────────
/**
 * Guardian-facing categories that go out on WhatsApp by default.
 * Deliberately not `message`, `mention`, `thread`: those are conversations that
 * only make sense inside the app, and `staff`/`system` never address a guardian.
 */
const GUARDIAN_WA_DEFAULT = [
  "fees", "discipline", "attendance", "announcement", "homework",
  "performance", "report", "health", "transport", "library", "risk",
];

/** Staff categories that reach WhatsApp whatever the priority — see notifications.js. */
const STAFF_WA_ALWAYS = new Set(["leave", "review", "cover", "exam", "health", "risk", "security"]);

const guardianCategories = (settings) =>
  Array.isArray(settings.whatsappCategories) ? settings.whatsappCategories : GUARDIAN_WA_DEFAULT;

/** The guardian's number is the second half of the recipient id, `parent:+265…`. */
function phoneFromRecipient(recipientId) {
  const phone = String(recipientId || "").slice(PARENT_PREFIX.length);
  return /^\+\d{7,15}$/.test(phone) ? phone : "";
}

/** Guardians can opt out by replying STOP; api/whatsapp/webhook.js records it. */
async function isOptedOut(phone) {
  try {
    const snap = await db.collection("wa_optouts").doc(phone.replace(/[^\d]/g, "")).get();
    return snap.exists;
  } catch {
    return false;
  }
}

function pickLanguage(n, ctx) {
  const lang = n.lang || ctx.settings.defaultLanguage || "en";
  return lang === "ny" ? "ny" : "en";
}

/** WhatsApp text: bold title, body, and who it is from. */
function composeWhatsApp(n, ctx, isParent) {
  const ny = isParent && pickLanguage(n, ctx) === "ny";
  const title = (ny && n.titleNy) || n.title || "";
  const body = (ny && n.bodyNy) || n.body || "";
  const from = ctx.schoolName || "Your school";
  const footer = isParent
    ? `\n\n_${from}_\n_${ny ? "Tumizani STOP kuti musiye kulandira mauthenga." : "Reply STOP to stop these messages."}_`
    : `\n\n_${from} · Acalink_`;
  return `*${title}*\n${body}${footer}`.slice(0, 1500);
}

/**
 * Decides whether this notification goes to WhatsApp and, if so, sends it now
 * (urgent) or leaves it in the outbox for the drain. Returns a status string
 * that is stamped on the notification so the reason someone did or did not get
 * a message is visible on the document itself rather than only in the logs.
 *
 *   queued | sent | failed          it is going, or went, or could not
 *   skipped:<reason>                deliberately not sent on WhatsApp
 */
async function routeWhatsApp(n, ctx) {
  const isParent = String(n.recipientId || "").startsWith(PARENT_PREFIX);

  if (ctx.settings.whatsappEnabled === false) return "skipped:disabled";
  if (!waConfigured()) return "skipped:not_configured";

  let phone = "";
  if (isParent) {
    if (!guardianCategories(ctx.settings).includes(n.category)) return "skipped:category";
    phone = phoneFromRecipient(n.recipientId);
    if (!phone) return "skipped:bad_number";
    if (await isOptedOut(phone)) return "skipped:opted_out";
  } else {
    if (ctx.settings.whatsappStaffAlerts === false) return "skipped:staff_off";
    const urgent = n.priority === "urgent" || n.priority === "high";
    if (!urgent && !STAFF_WA_ALWAYS.has(n.category)) return "skipped:staff_priority";
    let user;
    try {
      user = (await db.collection("users").doc(n.recipientId).get()).data();
    } catch (err) {
      logger.error(`staff profile read failed for ${n.recipientId}: ${err.message}`);
      return "skipped:error";
    }
    if (!user || user.status === "disabled") return "skipped:no_user";
    if (user.whatsappAlerts === false) return "skipped:opted_out";
    phone = cleanPhone(user.phone);
    if (!phone) return "skipped:no_phone";
  }

  const message = composeWhatsApp(n, ctx, isParent);
  return enqueueWhatsApp({
    schoolCode: n.schoolCode || "",
    notificationId: n.id || "",
    recipientId: n.recipientId || "",
    category: n.category || "system",
    priority: n.priority || "normal",
    to: phone,
    message,
    immediate: n.priority === "urgent",
  });
}

const OUTBOX = "wa_outbox";
const OUTBOX_TTL_DAYS = 14;

/**
 * Puts a message in the outbox, or — for an urgent one — sends it now and
 * records the result. A failed immediate send drops back into the queue so the
 * drain's retry and SMS-fallback logic handles it like any other.
 */
async function enqueueWhatsApp({ immediate = false, ...m }) {
  const now = Date.now();
  // Time-ordered ids keep the drain roughly first-in first-out, using the
  // default `__name__` ordering — no composite index to create by hand.
  const id = `${String(now).padStart(13, "0")}_${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    ...m,
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
    expiresAt: new Date(now + OUTBOX_TTL_DAYS * 86_400_000),   // read by the Firestore TTL policy
  };

  if (immediate) {
    try {
      await sendWhatsApp(waCredentials(), m.to, m.message);
      await db.collection(OUTBOX).doc(id).set({
        ...base, status: "sent", attempts: 1, sentAt: FieldValue.serverTimestamp(),
      });
      return "sent";
    } catch (err) {
      if (err.permanent || err.notConfigured) {
        await db.collection(OUTBOX).doc(id).set({
          ...base, status: "failed", attempts: 1, error: String(err.message || err).slice(0, 300),
        });
        return "failed";
      }
      // transient: fall through and queue it
    }
  }

  await db.collection(OUTBOX).doc(id).set({ ...base, status: "queued", nextAttemptAt: now });
  return "queued";
}

// ─── SMS fallback ────────────────────────────────────────────────────────────
// SMS is the fallback for a message WhatsApp could not carry. A guardian who has
// the app already got a free push and is not charged for a second copy — see
// src/services/smsFallback.js for why this is a per-school choice.
//
// This lives in the function rather than the portal because the deciding fact
// is whether `parent_devices` holds a token for the guardian, and that
// collection is `allow read: if false` for every client.

/** Field on `school_settings/{schoolCode}`. Mirrors SMS_FALLBACK_FIELD. */
const SMS_FALLBACK_FIELD = "smsFallbackCategories";

/**
 * Categories sent to every guardian rather than only those without the app.
 * Empty: the one such category — `report` — is sent by the portal itself in
 * headteacher/modules/reports.jsx. Adding it here would double-send.
 */
const ALWAYS_CATEGORIES = new Set();

/**
 * One GSM-7 segment is 160 characters and each segment bills separately, so a
 * message that runs to 161 costs double for the sake of a word. Anything longer
 * is cut rather than allowed to silently double the school's bill.
 */
const SMS_MAX = 160;

function composeSms(n, ctx) {
  const ny = pickLanguage(n, ctx) === "ny";
  const parts = [(ny && n.titleNy) || n.title, (ny && n.bodyNy) || n.body]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const text = parts.join(". ").replace(/\s+/g, " ");
  return text.length <= SMS_MAX ? text : text.slice(0, SMS_MAX - 1).trimEnd() + "…";
}

async function sendSmsFallback(n, ctx, { hasDevice }) {
  const raw = ctx.settings[SMS_FALLBACK_FIELD];
  const categories = Array.isArray(raw) ? raw : [];
  if (!categories.includes(n.category)) return "not_enabled";

  if (!ALWAYS_CATEGORIES.has(n.category) && hasDevice) return "has_device";

  const accountSid = TWILIO_ACC_SID.value();
  const authToken = TWILIO_AUTH_TOKEN.value();
  const fromNumber = TWILIO_PHONE_NUMBER.value();
  if (!accountSid || !authToken || !fromNumber) {
    logger.warn("SMS fallback enabled but Twilio secrets are not set");
    return "not_configured";
  }

  const to = phoneFromRecipient(n.recipientId);
  if (!to) return "bad_number";

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: composeSms(n, ctx) }).toString(),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      logger.error(`SMS fallback rejected for ${n.recipientId}: ${data?.code} ${data?.message}`);
      return `failed_${data?.code || res.status}`;
    }
    logger.info(`SMS fallback sent to ${n.recipientId} (${n.category})`);
    return "sent";
  } catch (err) {
    logger.error(`SMS fallback error for ${n.recipientId}: ${err.message}`);
    return "error";
  }
}

// ─── The delivery trigger ────────────────────────────────────────────────────
export const pushNotification = onDocumentCreated({
  document: "notifications/{id}",
  secrets: SECRETS,
}, async (event) => {
  const snap = event.data;
  if (!snap) return;

  const n = { id: snap.id, ...snap.data() };
  if (n.pushedAt) return;

  const ctx = await schoolContext(n.schoolCode);
  const whatsapp = await routeWhatsApp(n, ctx);

  if (!String(n.recipientId || "").startsWith(PARENT_PREFIX)) {
    // Staff have the portal open and its own bell; WhatsApp above is the only
    // out-of-app channel they get. Stamped so a retry does not reconsider it.
    await snap.ref.update({ pushedAt: FieldValue.serverTimestamp(), pushSkipped: "staff", whatsapp });
    return;
  }

  const tokens = await tokensFor(n.recipientId);

  // SMS is decided now only when WhatsApp is not carrying the message. When it
  // is queued, the drain decides — after it knows whether the send succeeded.
  let smsFallback = "after_whatsapp";
  if (whatsapp.startsWith("skipped") || whatsapp === "failed") {
    smsFallback = await sendSmsFallback(n, ctx, { hasDevice: tokens.length > 0 });
  }

  if (tokens.length === 0) {
    await snap.ref.update({
      pushedAt: FieldValue.serverTimestamp(),
      pushSkipped: "no_devices",
      whatsapp,
      smsFallback,
    });
    return;
  }

  try {
    const res = await fcm.sendEachForMulticast(buildMessage(n, tokens));
    logger.info(`${n.title} → ${n.recipientId}: ${res.successCount}/${tokens.length}`);
    await pruneDeadTokens(tokens, res.responses);
    await snap.ref.update({
      pushedAt: FieldValue.serverTimestamp(),
      pushDelivered: res.successCount,
      whatsapp,
      smsFallback,
    });
  } catch (err) {
    // Deliberately not stamped, and rethrown: an unstamped document plus a
    // thrown error is what lets the platform retry a transient FCM failure
    // instead of losing the notification silently.
    logger.error(`send failed for ${snap.id}: ${err.message}`);
    throw err;
  }
});

// ─── The outbox drain ────────────────────────────────────────────────────────
/** Roughly two a second, well under anything that looks like bulk messaging. */
const THROTTLE_MS = 450;
/** Sized to finish inside the function's timeout with real network latency. */
const MAX_PER_RUN = 70;
const WA_MAX_ATTEMPTS = 3;

async function stampNotification(notificationId, patch) {
  if (!notificationId) return;
  try {
    await db.collection("notifications").doc(notificationId).update(patch);
  } catch {
    // The notification may have been dismissed (deleted) already. Fine.
  }
}

/** A WhatsApp that definitively failed: try SMS, and record what happened. */
async function fallBackAfterFailure(m) {
  if (!m.notificationId) return;
  try {
    const snap = await db.collection("notifications").doc(m.notificationId).get();
    if (!snap.exists) return;
    const n = { id: snap.id, ...snap.data() };
    if (!String(n.recipientId || "").startsWith(PARENT_PREFIX)) return;
    const ctx = await schoolContext(n.schoolCode);
    const tokens = await tokensFor(n.recipientId);
    const smsFallback = await sendSmsFallback(n, ctx, { hasDevice: tokens.length > 0 });
    await snap.ref.update({ smsFallback });
  } catch (err) {
    logger.error(`SMS fallback after WhatsApp failure errored: ${err.message}`);
  }
}

export const drainWhatsAppOutbox = onSchedule({
  schedule: "every 1 minutes",
  secrets: SECRETS,
  timeoutSeconds: 120,
  maxInstances: 1,          // two drains at once would double-send
}, async () => {
  if (!waConfigured()) return;

  // One equality filter (auto-indexed); "is it due yet" is checked in memory,
  // which avoids a composite index for a queue this small.
  const snap = await db.collection(OUTBOX).where("status", "==", "queued").limit(120).get();
  const now = Date.now();
  const due = snap.docs.filter((d) => (d.get("nextAttemptAt") || 0) <= now).slice(0, MAX_PER_RUN);
  if (due.length === 0) return;

  let sent = 0;
  let failed = 0;
  for (const d of due) {
    const m = d.data();
    try {
      await sendWhatsApp(waCredentials(), m.to, m.message);
      await d.ref.update({
        status: "sent", sentAt: FieldValue.serverTimestamp(), attempts: FieldValue.increment(1),
      });
      await stampNotification(m.notificationId, { whatsapp: "sent" });
      sent += 1;
    } catch (err) {
      const attempts = (m.attempts || 0) + 1;
      if (err.permanent || attempts >= WA_MAX_ATTEMPTS) {
        await d.ref.update({ status: "failed", attempts, error: String(err.message || err).slice(0, 300) });
        await stampNotification(m.notificationId, { whatsapp: "failed" });
        await fallBackAfterFailure(m);
        failed += 1;
      } else {
        // Back off: 2 minutes, then 4.
        await d.ref.update({ attempts, nextAttemptAt: Date.now() + attempts * 120_000, error: String(err.message || err).slice(0, 300) });
      }
    }
    await sleep(THROTTLE_MS);
  }
  logger.info(`whatsapp drain: ${sent} sent, ${failed} failed, ${due.length} attempted`);
});

// ─── School approval and subscription messages ───────────────────────────────
// The platform owner approves, rejects or suspends a school from the platform
// console. This is what tells the school about it: a WhatsApp to the number it
// registered with, and a notification for the founder's bell.
const DAY = 86_400_000;
const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : null);

async function tellSchool(schoolCode, school, { title, body }) {
  const ctxMessage = `*${title}*\n${body}\n\n_Acalink_`;
  const phone = cleanPhone(school.phone);
  if (phone && waConfigured()) {
    await enqueueWhatsApp({
      schoolCode, notificationId: "", recipientId: school.authUid || "", category: "system",
      priority: "high", to: phone, message: ctxMessage, immediate: true,
    });
  }
  if (school.authUid) {
    await db.collection("notifications").add({
      schoolCode,
      recipientId: school.authUid,
      recipientType: "staff",
      recipientName: school.name || "",
      title, body,
      category: "system",
      priority: "high",
      actorId: "", actorName: "Acalink", actorRole: "platform",
      tab: "billing",
      entityType: "school", entityId: schoolCode, studentId: "", studentName: "",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      titleNy: "", bodyNy: "", lang: "",
      expiresAt: new Date(Date.now() + 90 * DAY),
      pushedAt: FieldValue.serverTimestamp(),           // already handled; do not route it again
      pushSkipped: "platform",
    });
  }
}

export const onSchoolStatusChange = onDocumentUpdated({
  document: "schools/{schoolCode}",
  secrets: SECRETS,
}, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const schoolCode = event.params.schoolCode;
  if (before.status === after.status) return;

  const link = APP_URL.value() ? `\n\nSign in: ${APP_URL.value().replace(/\/$/, "")}/signin` : "";
  const name = after.name || "your school";

  if (after.status === "active" && (before.status === "pending" || !before.status)) {
    const ends = tsMs(after.trialEndsAt);
    await tellSchool(schoolCode, after, {
      title: `${name} is approved`,
      body: `Welcome to Acalink. Your ${ends ? `free trial runs until ${fmtDate(ends)}` : "account is now active"}.${link}`,
    });
  } else if (after.status === "active" && before.status === "suspended") {
    await tellSchool(schoolCode, after, {
      title: `Access restored for ${name}`,
      body: `Your school can use Acalink again.${link}`,
    });
  } else if (after.status === "rejected") {
    await tellSchool(schoolCode, after, {
      title: `${name}: registration not approved`,
      body: after.rejectedReason ? `Reason: ${after.rejectedReason}` : "Please contact Acalink support.",
    });
  } else if (after.status === "suspended") {
    await tellSchool(schoolCode, after, {
      title: `${name}: access suspended`,
      body: after.suspendedReason ? `Reason: ${after.suspendedReason}` : "Please contact Acalink support.",
    });
  }
});

/**
 * Every morning, tells schools whose trial or paid period is about to end — at
 * 7, 3 and 1 days out, and the day it lapses. `lastReminderKey` on the school
 * stops the same reminder going twice.
 */
export const subscriptionReminders = onSchedule({
  schedule: "every day 08:00",
  timeZone: "Africa/Blantyre",
  secrets: SECRETS,
  timeoutSeconds: 300,
}, async () => {
  const snap = await db.collection("schools").where("status", "==", "active").get();
  const now = Date.now();
  for (const d of snap.docs) {
    const s = d.data();
    const paid = s.subscription_status === "active";
    const end = tsMs(paid ? s.paidThrough : s.trialEndsAt);
    if (!end) continue;

    const daysLeft = Math.ceil((end - now) / DAY);
    if (![7, 3, 1, 0].includes(daysLeft)) continue;

    const key = `${paid ? "paid" : "trial"}:${daysLeft}`;
    if (s.lastReminderKey === key) continue;

    const what = paid ? "subscription" : "free trial";
    const title = daysLeft === 0
      ? `Your ${what} ends today`
      : `Your ${what} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
    const body = `${s.name || "Your school"}: ${paid ? "renew" : "subscribe"} in Billing to keep every module working for your staff.`;

    try {
      await tellSchool(d.id, s, { title, body });
      await d.ref.update({ lastReminderKey: key });
    } catch (err) {
      logger.error(`subscription reminder failed for ${d.id}: ${err.message}`);
    }
    await sleep(THROTTLE_MS);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Guardian link confirmation.
//
// When a school enrols a student whose guardian phone already belongs to
// someone on ACALink, the student is attached as `pending` and stays invisible
// until the guardian proves the account is theirs. This is the server side of
// that proof.
//
// It has to run here rather than in the app for two reasons. The password is
// compared against sibling records the parent app must never be allowed to read
// wholesale, and flipping `guardianLinkStatus` is a write to a student document
// — which no parent session can be trusted with, or the check is decoration.
//
// The app writes a request document and watches it; this stamps the verdict on
// it. That keeps the parent app on Firestore alone, with no callable-functions
// dependency to add to the Flutter build.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors normalisePhone in src/services/phone.js and lib/core/phone_utils.dart. */
function normalisePhone(raw = "") {
  let d = String(raw).trim().replace(/[\s\-()]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("265")) return `+${d}`;
  if (/^0\d{9}$/.test(d)) return `+265${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `+265${d}`;
  return d ? `+${d}` : "";
}

// A wrong number that reaches a real stranger gives them unlimited guesses at
// a password whose alphabet is small enough to brute force. Five tries in ten
// minutes is generous for someone typing a password they actually know.
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

async function recentFailures(phone) {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const snap = await db
    .collection("guardian_link_requests")
    .where("phone", "==", phone)
    .where("status", "==", "rejected")
    .get();
  return snap.docs.filter((d) => {
    const t = d.data().resolvedAt;
    return t && t.toDate && t.toDate() > since;
  }).length;
}

export const verifyGuardianLink = onDocumentCreated(
  "guardian_link_requests/{id}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const req = snap.data() || {};
    // The password is only ever in transit. Clearing it on every path — including
    // every failure path below — is why `finish` exists rather than inline updates.
    const finish = (status, error) =>
      snap.ref.update({
        status,
        error: error || "",
        password: FieldValue.delete(),
        resolvedAt: FieldValue.serverTimestamp(),
      });

    if (req.status !== "pending") return;

    const phone = normalisePhone(req.phone);
    const attempt = String(req.password || "").trim();

    if (!req.studentId || !phone || !attempt) {
      await finish("rejected", "Incomplete request.");
      return;
    }

    if ((await recentFailures(phone)) >= MAX_ATTEMPTS) {
      await finish("rejected", "Too many attempts. Wait ten minutes and try again.");
      return;
    }

    const studentRef = db.collection("students").doc(req.studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      await finish("rejected", "That student no longer exists.");
      return;
    }

    const student = studentSnap.data();
    if (normalisePhone(student.guardianPhone) !== phone) {
      // The requester is not the guardian on the record. Deliberately worded
      // the same as a wrong password, so this cannot be used to discover which
      // students sit under a given number.
      await finish("rejected", "Incorrect password.");
      return;
    }

    if ((student.guardianLinkStatus || "active") === "active") {
      await finish("verified", "");
      return;
    }

    // Compare against the family's already-confirmed records only. A pending
    // sibling's password has never been proven to be in anyone's hands, so
    // accepting it would let one bad attach validate the next.
    const family = await db
      .collection("students")
      .where("guardianPhone", "==", phone)
      .get();

    const confirmed = family.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.id !== req.studentId && (s.guardianLinkStatus || "active") === "active");

    if (confirmed.length === 0) {
      await finish("rejected",
        "There is no confirmed account for this number yet. Contact the school.");
      return;
    }

    if (!confirmed.some((s) => (s.parentPortalPassword || "") === attempt)) {
      await finish("rejected", "Incorrect password.");
      return;
    }

    // Align the new record's password with the one the guardian actually uses,
    // so the family keeps a single credential no matter how many schools have
    // enrolled their children.
    await studentRef.update({
      guardianLinkStatus: "active",
      guardianLinkVerifiedAt: FieldValue.serverTimestamp(),
      parentPortalPassword: attempt,
    });

    logger.info(`guardian link confirmed: ${req.studentId} for ${phone}`);
    await finish("verified", "");
  }
);
