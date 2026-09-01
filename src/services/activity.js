// src/services/activity.js
// ─────────────────────────────────────────────────────────────────────────────
// ClickUp-style activity threads scoped to a class / stream.
//
//   activity_threads/{threadId}                 — the top-level post
//   activity_threads/{threadId}/replies/{id}    — flat reply list, with an
//                                                 optional replyToId so a reply
//                                                 can quote another reply
//
// Queries only ever use equality filters (schoolCode + scopeId), which
// Firestore serves from its automatic single-field indexes; ordering is done
// client-side so no composite index has to be created before this works.
// ─────────────────────────────────────────────────────────────────────────────
import { db, storage } from "../firebase";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, onSnapshot, serverTimestamp, increment, arrayUnion,
  arrayRemove, writeBatch,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { notifyUsers } from "./notifications";

export const THREADS = "activity_threads";

export const REACTIONS = ["👍", "🎉", "👀", "✅", "❤️"];

// ─── Attachments ─────────────────────────────────────────────────────────────
// Files live in Cloud Storage under activity/{schoolCode}/…; the Firestore doc
// keeps only a small descriptor, so rendering a thread never downloads a file
// nobody asked for.
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Strips anything that would make a messy or unsafe Storage object name. */
function safeFileName(name = "file") {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(-90);
}

export function validateAttachments(files) {
  if (files.length > MAX_ATTACHMENTS) {
    return `You can attach up to ${MAX_ATTACHMENTS} files at a time.`;
  }
  const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
  if (tooBig) {
    return `"${tooBig.name}" is ${formatBytes(tooBig.size)} — the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`;
  }
  return "";
}

/**
 * Uploads the picked files and returns the descriptors to store on the post.
 * The Storage path is not derived from the thread id, because a brand-new
 * thread has no id until after its files are uploaded.
 */
export async function uploadAttachments(files, { schoolCode, authorId }) {
  if (!files?.length) return [];
  const stamp = Date.now();
  const uploaded = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const path = `activity/${schoolCode}/${stamp}-${i}-${safeFileName(file.name)}`;
    const target = storageRef(storage, path);
    await uploadBytes(target, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: { uploadedBy: authorId || "", schoolCode },
    });
    uploaded.push({
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      path,
      url: await getDownloadURL(target),
    });
  }
  return uploaded;
}

/** Best-effort cleanup when a post carrying files is deleted. */
async function removeAttachments(attachments) {
  await Promise.all((attachments || []).map(async (a) => {
    if (!a?.path) return;
    try {
      await deleteObject(storageRef(storage, a.path));
    } catch (err) {
      // A missing object is fine — anything else is worth seeing in the log.
      if (err.code !== "storage/object-not-found") {
        console.error("[activity] attachment cleanup failed:", err);
      }
    }
  }));
}

// ─── Mentions ────────────────────────────────────────────────────────────────
// Mentions are stored as `@[Display Name](uid)` in the raw body so the text
// survives a rename and can be re-rendered as a chip. `renderTokens` splits a
// stored body back into plain-text and mention segments for display.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function extractMentions(body = "") {
  const ids = new Set();
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body)) !== null) ids.add(m[2]);
  return [...ids];
}

export function renderTokens(body = "") {
  const tokens = [];
  let cursor = 0;
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (m.index > cursor) tokens.push({ type: "text", value: body.slice(cursor, m.index) });
    tokens.push({ type: "mention", value: m[1], id: m[2] });
    cursor = m.index + m[0].length;
  }
  if (cursor < body.length) tokens.push({ type: "text", value: body.slice(cursor) });
  return tokens;
}

/** Plain-text version of a body — used for notification previews. */
export function plainText(body = "") {
  return body.replace(MENTION_RE, "@$1").trim();
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function decorate(d) {
  const data = d.data();
  const ts = data.createdAt?.toDate?.() || (data.createdAtMs ? new Date(data.createdAtMs) : null);
  const last = data.lastActivityAt?.toDate?.() || (data.lastActivityAtMs ? new Date(data.lastActivityAtMs) : null);
  return { id: d.id, ...data, createdAtDate: ts, lastActivityDate: last || ts };
}

/**
 * Live thread list for one scope. `scopeId` of "__school__" is the
 * school-wide activity channel; anything else is a class doc id.
 */
export function subscribeThreads({ schoolCode, scopeId }, onChange, onError) {
  if (!schoolCode || !scopeId) return () => {};
  const q = query(
    collection(db, THREADS),
    where("schoolCode", "==", schoolCode),
    where("scopeId", "==", scopeId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map(decorate);
      // Pinned first, then most-recently-active.
      rows.sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.lastActivityDate?.getTime() || 0) - (a.lastActivityDate?.getTime() || 0);
      });
      onChange(rows);
    },
    (err) => {
      console.error("[activity] thread subscription failed:", err);
      onError?.(err);
    },
  );
}

/** Turns a Firestore error into something a teacher can act on. */
export function describeError(err) {
  if (!err) return "";
  if (err.code === "permission-denied") {
    return "Firestore refused this read. Either the rules for this collection are not deployed, "
      + "or the query does not constrain the field the rule checks — a list is authorised from "
      + "the query's own filters, not per document.";
  }
  if (err.code === "unavailable") {
    return "Cannot reach the server. Check your connection.";
  }
  return err.message || "Something went wrong.";
}

/**
 * Live replies for one thread, oldest first (conversation order).
 *
 * ── Why the schoolCode filter is not optional ───────────────────────────────
 * The security rule on this subcollection is
 * `allow read: if isStaffOfSchool(resource.data.schoolCode)`. For a `list`,
 * Firestore does not evaluate that per returned document — it has to prove
 * from the QUERY CONSTRAINTS alone that every possible result would satisfy
 * the rule. An unfiltered query leaves `schoolCode` unconstrained, so the
 * proof fails and the whole read is refused, even when the one reply present
 * would have passed. Repeating the rule's condition as a query filter is what
 * makes it provable. (Fetching a single reply by id is fine either way —
 * `get` really is evaluated against the document.)
 *
 * `onError` is separate from `onChange` for the same family of reasons:
 * collapsing a refusal into an empty array makes "not allowed" look exactly
 * like "no replies yet".
 */
export function subscribeReplies({ threadId, schoolCode }, onChange, onError) {
  if (!threadId || !schoolCode) return () => {};
  return onSnapshot(
    query(
      collection(db, THREADS, threadId, "replies"),
      where("schoolCode", "==", schoolCode),
    ),
    (snap) => {
      const rows = snap.docs.map(decorate);
      rows.sort((a, b) => (a.createdAtDate?.getTime() || 0) - (b.createdAtDate?.getTime() || 0));
      onChange(rows);
    },
    (err) => {
      console.error("[activity] reply subscription failed:", err);
      onError?.(err);
    },
  );
}

/** One-shot count of threads per scope, for badges on the class cards. */
export async function fetchThreadCounts(schoolCode) {
  if (!schoolCode) return {};
  try {
    const snap = await getDocs(query(collection(db, THREADS), where("schoolCode", "==", schoolCode)));
    const counts = {};
    snap.docs.forEach((d) => {
      const { scopeId, replyCount = 0 } = d.data();
      if (!scopeId) return;
      counts[scopeId] = counts[scopeId] || { threads: 0, messages: 0 };
      counts[scopeId].threads += 1;
      counts[scopeId].messages += 1 + replyCount;
    });
    return counts;
  } catch (err) {
    console.error("[activity] counts failed:", err);
    return {};
  }
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export async function createThread({
  schoolCode, scopeId, scopeName, scopeType = "class",
  title, body, author, notifyTargets = [], attachments = [],
}) {
  const mentions = extractMentions(body);
  const now = Date.now();
  const ref = await addDoc(collection(db, THREADS), {
    schoolCode,
    scopeId,
    scopeName: scopeName || "",
    scopeType,
    title: (title || "").trim(),
    body: (body || "").trim(),
    authorId: author.id,
    authorName: author.name,
    authorRole: author.role || "",
    mentions,
    attachments,
    // Everyone who has touched the thread — drives "who else is watching"
    // and who gets told about new replies.
    participants: [author.id],
    replyCount: 0,
    reactions: {},
    pinned: false,
    resolved: false,
    createdAt: serverTimestamp(),
    createdAtMs: now,
    lastActivityAt: serverTimestamp(),
    lastActivityAtMs: now,
    lastActivityBy: author.name,
  });

  await fanOutThreadNotice({
    schoolCode, scopeName, threadId: ref.id, author, mentions,
    notifyTargets, title: (title || "").trim(), body,
    isReply: false, attachmentCount: attachments.length,
  });

  return ref.id;
}

export async function addReply({
  schoolCode, threadId, thread, body, author, replyTo = null, attachments = [],
}) {
  const mentions = extractMentions(body);
  const now = Date.now();

  await addDoc(collection(db, THREADS, threadId, "replies"), {
    schoolCode,
    threadId,
    body: (body || "").trim(),
    authorId: author.id,
    authorName: author.name,
    authorRole: author.role || "",
    mentions,
    attachments,
    reactions: {},
    replyToId: replyTo?.id || "",
    replyToAuthor: replyTo?.authorName || "",
    replyToExcerpt: replyTo ? plainText(replyTo.body).slice(0, 120) : "",
    createdAt: serverTimestamp(),
    createdAtMs: now,
  });

  await updateDoc(doc(db, THREADS, threadId), {
    replyCount: increment(1),
    participants: arrayUnion(author.id),
    lastActivityAt: serverTimestamp(),
    lastActivityAtMs: now,
    lastActivityBy: author.name,
  });

  // Everyone already in the thread hears about the reply; whoever was
  // @-mentioned in *this* reply gets the louder "mentioned you" notice
  // instead, so nobody is told twice about the same message.
  const watchers = new Set([
    ...(thread?.participants || []),
    thread?.authorId,
    ...(replyTo ? [replyTo.authorId] : []),
  ]);
  watchers.delete(author.id);
  mentions.forEach((id) => watchers.delete(id));

  await fanOutThreadNotice({
    schoolCode,
    scopeName: thread?.scopeName,
    threadId,
    author,
    mentions,
    notifyTargets: [...watchers],
    title: thread?.title || "",
    body,
    isReply: true,
    attachmentCount: attachments.length,
  });
}

/**
 * Sends the two flavours of activity notification: an @mention ping and a
 * quieter "new activity" note for watchers. Split out so create + reply share
 * exactly the same wording rules.
 */
async function fanOutThreadNotice({
  schoolCode, scopeName, threadId, author, mentions, notifyTargets, title, body,
  isReply, attachmentCount = 0,
}) {
  const files = attachmentCount
    ? `📎 ${attachmentCount} file${attachmentCount === 1 ? "" : "s"}`
    : "";
  const text = plainText(body).slice(0, 140);
  const preview = [text, files].filter(Boolean).join(text && files ? " · " : "");
  const where_ = scopeName ? ` in ${scopeName}` : "";

  const mentionTargets = mentions.filter((id) => id !== author.id);
  if (mentionTargets.length) {
    await notifyUsers({
      userIds: mentionTargets,
      schoolCode,
      title: `${author.name} mentioned you${where_}`,
      body: preview,
      category: "mention",
      priority: "high",
      actorId: author.id,
      actorName: author.name,
      actorRole: author.role || "",
      tab: "classes",
      entityType: "thread",
      entityId: threadId,
    });
  }

  const watcherTargets = (notifyTargets || []).filter(
    (id) => id && id !== author.id && !mentions.includes(id),
  );
  if (watcherTargets.length) {
    await notifyUsers({
      userIds: watcherTargets,
      schoolCode,
      title: isReply
        ? `${author.name} replied${title ? ` on "${title}"` : where_}`
        : `${author.name} started a discussion${where_}`,
      body: preview,
      category: "thread",
      actorId: author.id,
      actorName: author.name,
      actorRole: author.role || "",
      tab: "classes",
      entityType: "thread",
      entityId: threadId,
    });
  }
}

/** Toggles one reaction for one user on a thread or a reply. */
export async function toggleReaction({ threadId, replyId = null, emoji, userId, active }) {
  const ref = replyId
    ? doc(db, THREADS, threadId, "replies", replyId)
    : doc(db, THREADS, threadId);
  try {
    await updateDoc(ref, {
      [`reactions.${emoji}`]: active ? arrayRemove(userId) : arrayUnion(userId),
    });
  } catch (err) {
    console.error("[activity] reaction failed:", err);
  }
}

export async function setThreadFlag(threadId, patch) {
  await updateDoc(doc(db, THREADS, threadId), { ...patch, updatedAt: serverTimestamp() });
}

/** Deletes a thread and its replies (replies are not cascaded by Firestore). */
export async function deleteThread(threadId) {
  const threadRef = doc(db, THREADS, threadId);
  const [replies, threadSnap] = await Promise.all([
    getDocs(collection(db, THREADS, threadId, "replies")),
    getDoc(threadRef),
  ]);

  // Collect every file the thread and its replies own before the documents
  // that point at them are gone.
  const files = [...(threadSnap.data()?.attachments || [])];
  replies.docs.forEach((d) => files.push(...(d.data().attachments || [])));

  const batch = writeBatch(db);
  replies.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(threadRef);
  await batch.commit();
  await removeAttachments(files);
}

export async function deleteReply(threadId, replyId) {
  const ref = doc(db, THREADS, threadId, "replies", replyId);
  const snap = await getDoc(ref);
  const files = snap.data()?.attachments || [];
  await deleteDoc(ref);
  await updateDoc(doc(db, THREADS, threadId), { replyCount: increment(-1) });
  await removeAttachments(files);
}

/** Marks a thread read for one user (per-user read receipts live on the doc). */
export async function markThreadSeen(threadId, userId) {
  if (!threadId || !userId) return;
  try {
    await setDoc(
      doc(db, THREADS, threadId),
      { seenBy: { [userId]: Date.now() } },
      { merge: true },
    );
  } catch (err) {
    console.error("[activity] markThreadSeen failed:", err);
  }
}
