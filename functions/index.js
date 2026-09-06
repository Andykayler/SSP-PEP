// functions/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Delivers `notifications` documents to phones as FCM pushes.
//
// This is the same logic as scripts/push-worker.js, moved somewhere it runs
// without anybody's laptop being open. That was the whole problem: the worker
// only pushed while a terminal on a developer machine was running it, so a
// parent whose app was closed got nothing — which is precisely when a push is
// the only way to reach them.
//
// Deploy once and it stays up:
//
//     firebase deploy --only functions
//
// Requires the Blaze plan. Cloud Functions has a free monthly allowance that a
// pilot will not come close to exhausting, but a billing account has to exist.
//
// scripts/push-worker.js is kept for local testing against the emulator. Do
// not run both against the same project — `pushedAt` stops a double send, but
// the two would race for it.
// ─────────────────────────────────────────────────────────────────────────────
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";

// Twilio credentials for the SMS fallback (see sendSmsFallback below). Held as
// deployed secrets rather than plain config so they are not readable from the
// function's environment listing:
//
//     firebase functions:secrets:set TWILIO_ACC_SID
//     firebase functions:secrets:set TWILIO_AUTH_TOKEN
//     firebase functions:secrets:set TWILIO_PHONE_NUMBER
//
// Absent secrets are not an error — the fallback simply stays off, which is
// the same outcome as a school that has not opted in.
const TWILIO_ACC_SID = defineSecret("TWILIO_ACC_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = defineSecret("TWILIO_PHONE_NUMBER");

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

// ─── SMS fallback ────────────────────────────────────────────────────────────
// A guardian with no registered device never sees an in-app notification,
// because there is no app to see it in. For the categories a school has opted
// into, the message is sent as an SMS instead — see src/services/smsFallback.js
// for why this is a per-school choice rather than always on.
//
// This lives in the function rather than the portal because the deciding fact
// is whether `parent_devices` holds a token for the guardian, and that
// collection is `allow read: if false` for every client. The Admin SDK is the
// only thing that can see it, and the push path already looks it up.

/** Field on `school_settings/{schoolCode}`. Mirrors SMS_FALLBACK_FIELD. */
const SMS_FALLBACK_FIELD = "smsFallbackCategories";

/**
 * Categories sent to every guardian rather than only those without the app.
 *
 * Empty, and deliberately so. The one such category — `report` — is sent by
 * the portal itself in headteacher/modules/reports.jsx, because a message that
 * goes out regardless of app installation needs nothing this function uniquely
 * knows. Adding "report" back here would double-send: every guardian would get
 * the portal's SMS and this one.
 *
 * What is left for this function is the genuinely app-dependent case, which a
 * browser cannot decide: `parent_devices` is unreadable by every client, so
 * only the Admin SDK can tell whether a guardian has the app at all.
 */
const ALWAYS_CATEGORIES = new Set();

/**
 * Settings are read once per notification, and a class fan-out is hundreds of
 * notifications for one school — so without a cache, publishing marks to 600
 * pupils is 600 identical reads. Instances are reused between invocations, so
 * a short TTL cache collapses a burst into one read while still picking up a
 * change from the settings screen within the minute.
 */
const settingsCache = new Map();
const SETTINGS_TTL_MS = 60_000;

async function smsCategoriesFor(schoolCode) {
  if (!schoolCode) return [];

  const hit = settingsCache.get(schoolCode);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.categories;

  let categories = [];
  try {
    const snap = await db.collection("school_settings").doc(schoolCode).get();
    const raw = snap.exists ? snap.get(SMS_FALLBACK_FIELD) : null;
    categories = Array.isArray(raw) ? raw : [];
  } catch (err) {
    // A settings read failure must not stop the notification being stamped.
    logger.error(`settings read failed for ${schoolCode}: ${err.message}`);
  }

  settingsCache.set(schoolCode, { categories, at: Date.now() });
  return categories;
}

/**
 * One GSM-7 segment is 160 characters and each segment bills separately, so a
 * message that runs to 161 costs double for the sake of a word. Titles and
 * bodies from notificationHooks.js sit well inside that; anything longer is
 * cut rather than allowed to silently double the school's bill.
 */
const SMS_MAX = 160;

function composeSms(n) {
  const parts = [n.title, n.body].map((s) => String(s || "").trim()).filter(Boolean);
  const text = parts.join(". ").replace(/\s+/g, " ");
  return text.length <= SMS_MAX ? text : text.slice(0, SMS_MAX - 1).trimEnd() + "…";
}

/**
 * The guardian's number is already the second half of the recipient id
 * (`parent:+265991234567`), written by parentRecipientId() through
 * normalisePhone(), so it is E.164 by construction. Validated anyway — a
 * malformed number is a 400 from Twilio and a wasted call.
 */
function phoneFromRecipient(recipientId) {
  const phone = String(recipientId || "").slice(PARENT_PREFIX.length);
  return /^\+\d{7,15}$/.test(phone) ? phone : "";
}

/**
 * Sends one SMS. Returns a short status string that is stamped onto the
 * notification so the reason a guardian did or did not get a message is
 * visible on the document itself rather than only in the logs.
 */
async function sendSmsFallback(n, { hasDevice }) {
  const categories = await smsCategoriesFor(n.schoolCode);
  if (!categories.includes(n.category)) return "not_enabled";

  // Report cards go to every guardian. Everything else is a fallback: a
  // guardian with the app already got a free push and must not be charged for
  // a second copy of it.
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
          Authorization:
            "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: composeSms(n),
        }).toString(),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      // 21408 is an unenabled destination country and 21608 an unverified
      // number on a trial account — both are Twilio console settings, not
      // faults here, and both are worth naming in the log.
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

export const pushNotification = onDocumentCreated({
  document: "notifications/{id}",
  secrets: [TWILIO_ACC_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER],
}, async (event) => {
  const snap = event.data;
  if (!snap) return;

  const n = { id: snap.id, ...snap.data() };
  if (n.pushedAt) return;

  if (!String(n.recipientId || "").startsWith(PARENT_PREFIX)) {
    // Staff notification — stamped so a retry does not reconsider it.
    await snap.ref.update({ pushedAt: FieldValue.serverTimestamp(), pushSkipped: "staff" });
    return;
  }

  const tokens = await tokensFor(n.recipientId);

  // Attempted before the push, and for guardians with a device too, because a
  // report card is sent by SMS whether or not the app is installed. The
  // fallback categories still check `hasDevice` inside.
  const smsFallback = await sendSmsFallback(n, { hasDevice: tokens.length > 0 });

  if (tokens.length === 0) {
    await snap.ref.update({
      pushedAt: FieldValue.serverTimestamp(),
      pushSkipped: "no_devices",
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
