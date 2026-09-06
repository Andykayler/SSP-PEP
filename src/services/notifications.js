// src/services/notifications.js
// ─────────────────────────────────────────────────────────────────────────────
// In-app notification bus. Every notification is one Firestore doc in
// `notifications`, addressed to exactly one recipient. Fan-out (e.g. "tell all
// Form 2 parents") is done by writing N docs in a batch — that keeps the read
// path a single-field equality query, which Firestore indexes automatically.
//
// ── Why the hand-rolled document IDs ────────────────────────────────────────
// The natural query here is `where(recipientId ==) + orderBy(createdAt, desc)`,
// but an equality filter combined with orderBy on a *different* field needs a
// composite index that has to be created by hand in the Firebase console.
// Instead each doc ID starts with an inverted timestamp, so Firestore's default
// `__name__` ascending order already puts the newest first — `limit(60)` then
// means "the 60 newest" with zero index setup. Results are still sorted
// client-side on createdAt so server clock skew cannot reorder the panel.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, query, where, limit, onSnapshot, getDocs,
  writeBatch, updateDoc, serverTimestamp, deleteDoc,
} from "firebase/firestore";

export const PARENT_PREFIX = "parent:";

// How long a notification stays in the inbox. Firestore deletes documents by
// TTL policy on a timestamp field, so the expiry is stamped at write time
// rather than computed on read — see docs/firestore-ttl.md for the one-off
// policy setup, without which this field is inert.
export const NOTIFICATION_TTL_DAYS = 90;

/** Recipient id for a guardian. Phone must already be normalised (+265…). */
export function parentRecipientId(phone) {
  return phone ? `${PARENT_PREFIX}${phone}` : "";
}

export function isParentRecipient(recipientId = "") {
  return recipientId.startsWith(PARENT_PREFIX);
}

// Far enough out (year 5138) that the subtraction never goes negative and the
// string keeps a fixed 13-digit width, which lexicographic ordering relies on.
const ID_EPOCH_CEILING = 9999999999999;

function newNotificationId() {
  const inverted = String(ID_EPOCH_CEILING - Date.now()).padStart(13, "0");
  const salt = Math.random().toString(36).slice(2, 8);
  return `${inverted}_${salt}`;
}

// ─── Categories ──────────────────────────────────────────────────────────────
// `tab` is the dashboard nav id a notification deep-links to when clicked.
export const CATEGORY_META = {
  announcement: { label: "Announcement", tone: "info",    tab: "announcements" },
  attendance:   { label: "Attendance",   tone: "warning", tab: "attendance" },
  performance:  { label: "Results",      tone: "success", tab: "performance" },
  // Separate from `performance` because the two are different events with
  // different weight: a teacher publishing one subject's marks happens many
  // times a term, while the head teacher issuing report cards happens once and
  // is the moment the term's result becomes official. Only the latter is worth
  // an SMS — see services/smsFallback.js.
  report:       { label: "Report Card",  tone: "success", tab: "performance" },
  discipline:   { label: "Discipline",   tone: "danger",  tab: "discipline" },
  homework:     { label: "Homework",     tone: "info",    tab: "Homework" },
  fees:         { label: "Fees",         tone: "warning", tab: "payments" },
  message:      { label: "Message",      tone: "info",    tab: "messages" },
  mention:      { label: "Mention",      tone: "info",    tab: "classes" },
  thread:       { label: "Activity",     tone: "neutral", tab: "classes" },
  staff:        { label: "Staff",        tone: "neutral", tab: "staff" },
  system:       { label: "System",       tone: "neutral", tab: "overview" },
};

export function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.system;
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Normalises one caller-supplied notification into the stored shape. Kept
 * separate from the write so a whole fan-out can be built before the batch
 * is opened.
 */
function buildDoc(n) {
  return {
    schoolCode:    n.schoolCode || "",
    recipientId:   n.recipientId,
    recipientType: isParentRecipient(n.recipientId) ? "parent" : "staff",
    recipientName: n.recipientName || "",
    title:         n.title || "",
    body:          n.body || "",
    category:      n.category || "system",
    priority:      n.priority || "normal",       // normal | high | urgent
    actorId:       n.actorId || "",
    actorName:     n.actorName || "System",
    actorRole:     n.actorRole || "",
    // Deep-link target: `tab` is the nav id inside the recipient portal,
    // `entityId` lets a module open the exact record.
    tab:           n.tab || categoryMeta(n.category).tab,
    entityType:    n.entityType || "",
    entityId:      n.entityId || "",
    studentId:     n.studentId || "",            // parents filter on this
    studentName:   n.studentName || "",
    read:          false,
    createdAt:     serverTimestamp(),
    createdAtMs:   Date.now(),                   // client fallback for sorting
    // Read by the Firestore TTL policy; nothing in the app looks at it.
    expiresAt:     new Date(Date.now() + NOTIFICATION_TTL_DAYS * 86400000),
  };
}

/**
 * Batched fan-out. Firestore caps a batch at 500 writes, so this chunks.
 * Never throws — a failed notification must not fail the action that
 * triggered it.
 */
export async function pushNotifications(list) {
  const valid = (list || []).filter((n) => n && n.recipientId);
  if (valid.length === 0) return false;

  try {
    for (let i = 0; i < valid.length; i += 450) {
      const chunk = valid.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach((n) => {
        batch.set(doc(db, "notifications", newNotificationId()), buildDoc(n));
      });
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.error("[notifications] fan-out failed:", err);
    return false;
  }
}

/** Writes a single notification. */
export async function pushNotification(n) {
  if (!n?.recipientId) return false;
  return pushNotifications([n]);
}

/**
 * Notifies every staff member in a school holding one of `roles`.
 * `excludeIds` keeps the actor from being told about their own action.
 */
export async function notifyRoles({ schoolCode, roles, excludeIds = [], ...payload }) {
  if (!schoolCode || !roles?.length) return false;
  try {
    const snap = await getDocs(query(
      collection(db, "users"),
      where("schoolCode", "==", schoolCode),
      where("role", "in", roles.slice(0, 10)),
    ));
    const skip = new Set(excludeIds.filter(Boolean));
    const targets = snap.docs
      .filter((d) => !skip.has(d.id) && d.data().status !== "disabled")
      .map((d) => ({
        ...payload,
        schoolCode,
        recipientId: d.id,
        recipientName: d.data().name || d.data().displayName || "",
      }));
    return pushNotifications(targets);
  } catch (err) {
    console.error("[notifications] notifyRoles failed:", err);
    return false;
  }
}

/** Notifies specific staff members by uid. */
export async function notifyUsers({ userIds, ...payload }) {
  const targets = [...new Set((userIds || []).filter(Boolean))]
    .map((uid) => ({ ...payload, recipientId: uid }));
  return pushNotifications(targets);
}

/**
 * Notifies guardians. `students` is a list of student docs (each needs
 * `guardianPhone`); one notification per guardian-per-student, so a parent
 * with two children gets one per child, correctly attributed.
 *
 * `title` and `body` may be functions of the student for per-child wording.
 */
export async function notifyGuardians({ students, ...payload }) {
  const targets = [];
  const seen = new Set();
  (students || []).forEach((s) => {
    const phone = s?.guardianPhone;
    if (!phone) return;
    const key = `${phone}|${s.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({
      ...payload,
      recipientId: parentRecipientId(phone),
      recipientName: s.guardianName || "",
      studentId: s.id,
      studentName: s.fullName || `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      body: typeof payload.body === "function" ? payload.body(s) : payload.body,
      title: typeof payload.title === "function" ? payload.title(s) : payload.title,
    });
  });
  return pushNotifications(targets);
}

/**
 * Looks up the students in a class (or the whole school when `className` is
 * omitted) then notifies their guardians.
 */
export async function notifyGuardiansOfClass({ schoolCode, className, ...payload }) {
  if (!schoolCode) return false;
  try {
    const filters = [where("schoolCode", "==", schoolCode)];
    if (className) filters.push(where("className", "==", className));
    const snap = await getDocs(query(collection(db, "students"), ...filters));
    const students = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return notifyGuardians({ students, schoolCode, ...payload });
  } catch (err) {
    console.error("[notifications] notifyGuardiansOfClass failed:", err);
    return false;
  }
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Live subscription to one recipient inbox.
 * Returns the unsubscribe function; `onChange` receives a newest-first array.
 */
export function subscribeNotifications(recipientId, onChange, { max = 60 } = {}) {
  if (!recipientId) return () => {};
  const q = query(
    collection(db, "notifications"),
    where("recipientId", "==", recipientId),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toDate?.();
        return {
          id: d.id,
          ...data,
          createdAtDate: ts || (data.createdAtMs ? new Date(data.createdAtMs) : null),
        };
      });
      rows.sort((a, b) => (b.createdAtDate?.getTime() || 0) - (a.createdAtDate?.getTime() || 0));
      onChange(rows);
    },
    (err) => {
      console.error("[notifications] subscription error:", err);
      onChange([]);
    },
  );
}

export async function markNotificationRead(id) {
  try {
    await updateDoc(doc(db, "notifications", id), { read: true, readAt: serverTimestamp() });
  } catch (err) {
    console.error("[notifications] markRead failed:", err);
  }
}

export async function markAllNotificationsRead(ids) {
  const unread = (ids || []).filter(Boolean);
  if (!unread.length) return;
  try {
    for (let i = 0; i < unread.length; i += 450) {
      const batch = writeBatch(db);
      unread.slice(i, i + 450).forEach((id) => {
        batch.update(doc(db, "notifications", id), { read: true, readAt: serverTimestamp() });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error("[notifications] markAllRead failed:", err);
  }
}

export async function deleteNotification(id) {
  try {
    await deleteDoc(doc(db, "notifications", id));
  } catch (err) {
    console.error("[notifications] delete failed:", err);
  }
}

// ─── Display helpers ─────────────────────────────────────────────────────────
export function relativeTime(date) {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
