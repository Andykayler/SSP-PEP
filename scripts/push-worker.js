// scripts/push-worker.js
// ─────────────────────────────────────────────────────────────────────────────
// Turns `notifications` documents into FCM pushes.
//
// FCM cannot be sent from a browser or from the phone — a message has to be
// signed by a trusted credential — so the web portals only ever write the
// Firestore document, and this worker delivers it. It runs anywhere Node runs:
//
//     npm run push-worker
//
// Restarting is safe. Every delivered document is stamped with `pushedAt`, and
// the worker skips anything already stamped, so a restart never re-sends.
//
// If you move to the Blaze plan later, the same logic drops into a Cloud
// Function triggered onDocumentCreated('notifications/{id}') and this process
// goes away.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || "./ssp-pep-firebase-adminsdk-fbsvc-a71809ca23.json";

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf8"))) });
const db = getFirestore();
const fcm = getMessaging();

// Only guardians get pushes; staff have the portal open and its own bell.
const PARENT_PREFIX = "parent:";

/** Android notification channel + tap payload for one notification doc. */
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
      priority: n.priority === "urgent" ? "high" : "normal",
      notification: {
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
  const snap = await db.collection("parent_devices")
    .where("parentId", "==", parentId)
    .get();
  return snap.docs.map((d) => d.id);
}

/** Drops registrations FCM tells us are dead, so the list stays honest. */
async function pruneDeadTokens(tokens, responses) {
  const dead = [];
  responses.forEach((r, i) => {
    const code = r.error?.code || "";
    if (code === "messaging/registration-token-not-registered"
      || code === "messaging/invalid-registration-token") {
      dead.push(tokens[i]);
    }
  });
  if (dead.length === 0) return;
  const batch = db.batch();
  dead.forEach((t) => batch.delete(db.collection("parent_devices").doc(t)));
  await batch.commit();
  console.log(`  pruned ${dead.length} dead token(s)`);
}

async function deliver(doc) {
  const n = { id: doc.id, ...doc.data() };
  if (n.pushedAt) return;
  if (!String(n.recipientId || "").startsWith(PARENT_PREFIX)) {
    // Staff notification — mark handled so we do not look at it again.
    await doc.ref.update({ pushedAt: FieldValue.serverTimestamp(), pushSkipped: "staff" });
    return;
  }

  const tokens = await tokensFor(n.recipientId);
  if (tokens.length === 0) {
    await doc.ref.update({ pushedAt: FieldValue.serverTimestamp(), pushSkipped: "no_devices" });
    return;
  }

  try {
    const res = await fcm.sendEachForMulticast(buildMessage(n, tokens));
    console.log(`→ ${n.title}  [${n.recipientId}]  ${res.successCount}/${tokens.length} delivered`);
    await pruneDeadTokens(tokens, res.responses);
    await doc.ref.update({
      pushedAt: FieldValue.serverTimestamp(),
      pushDelivered: res.successCount,
    });
  } catch (err) {
    console.error(`  send failed for ${doc.id}:`, err.message);
    // Deliberately not stamped: a transient failure should be retried on the
    // next snapshot rather than silently swallowed.
  }
}

function start() {
  console.log("push-worker listening for new notifications…");

  // Documents carry an inverted-timestamp id, so the newest sort first and a
  // small limit is enough to catch everything arriving in real time.
  db.collection("notifications")
    .orderBy("__name__")
    .limit(40)
    .onSnapshot(
      (snap) => {
        snap.docChanges()
          .filter((c) => c.type === "added")
          .forEach((c) => { deliver(c.doc).catch((e) => console.error(e)); });
      },
      (err) => {
        console.error("listener error, retrying in 10s:", err.message);
        setTimeout(start, 10_000);
      },
    );
}

start();
