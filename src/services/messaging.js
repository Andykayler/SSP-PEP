// src/services/messaging.js
// ─────────────────────────────────────────────────────────────────────────────
// Direct messaging between a guardian and a member of staff, always anchored
// to one student so a teacher opening a thread already knows whose parent they
// are talking to.
//
//   conversations/{conversationId}                — participants + last message
//   conversations/{conversationId}/messages/{id}  — the transcript
//
// The conversation id is deterministic (`school_student_staff`) so the mobile
// app and the web portal independently derive the same document instead of
// racing to create two threads for the same pair.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, query, where,
  onSnapshot, serverTimestamp, increment, getDocs, writeBatch,
} from "firebase/firestore";
import { pushNotification, parentRecipientId } from "./notifications";

export const CONVERSATIONS = "conversations";

/** Firestore ids cannot contain "/" — phones and codes here never do. */
export function conversationId({ schoolCode, studentId, staffId }) {
  return `${schoolCode}__${studentId}__${staffId}`;
}

function decorate(d) {
  const data = d.data();
  const ts = data.createdAt?.toDate?.() || (data.createdAtMs ? new Date(data.createdAtMs) : null);
  const last = data.lastMessageAt?.toDate?.() || (data.lastMessageAtMs ? new Date(data.lastMessageAtMs) : null);
  return { id: d.id, ...data, createdAtDate: ts, lastMessageDate: last || ts };
}

/**
 * Creates the conversation if it does not exist yet, then returns its id.
 * Safe to call on every send — `merge` keeps the existing counters intact.
 */
export async function ensureConversation({
  schoolCode, student, staff, parent, subject = "",
}) {
  const id = conversationId({ schoolCode, studentId: student.id, staffId: staff.id });
  const ref = doc(db, CONVERSATIONS, id);
  const existing = await getDoc(ref);
  const parentId = parentRecipientId(parent.phone);

  if (!existing.exists()) {
    await setDoc(ref, {
      schoolCode,
      studentId: student.id,
      studentName: student.name,
      className: student.className || "",
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role || "",
      parentId,
      parentPhone: parent.phone,
      parentName: parent.name || "Guardian",
      participantIds: [staff.id, parentId],
      subject,
      lastMessage: "",
      lastSenderId: "",
      unread: { [staff.id]: 0, [parentId]: 0 },
      status: "open",
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
      lastMessageAt: serverTimestamp(),
      lastMessageAtMs: Date.now(),
    });
  } else if (subject && !existing.data().subject) {
    await updateDoc(ref, { subject });
  }
  return id;
}

/**
 * Appends a message and updates the conversation header in one go, then
 * notifies the other side. `sender.type` is "staff" or "parent".
 */
export async function sendMessage({ conversationId: id, sender, body, meta = {} }) {
  const text = (body || "").trim();
  if (!id || !text) return false;

  const ref = doc(db, CONVERSATIONS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const convo = snap.data();

  const otherId = (convo.participantIds || []).find((p) => p !== sender.id);

  await addDoc(collection(db, CONVERSATIONS, id, "messages"), {
    conversationId: id,
    // Denormalised from the conversation so security rules can authorise a
    // message on its own fields — a per-message get() of the parent doc would
    // otherwise count against the rules engine's document-access budget.
    participantIds: convo.participantIds || [],
    body: text,
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role || "",
    senderType: sender.type || "staff",
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    ...meta,
  });

  await updateDoc(ref, {
    lastMessage: text.slice(0, 160),
    lastSenderId: sender.id,
    lastSenderName: sender.name,
    lastMessageAt: serverTimestamp(),
    lastMessageAtMs: Date.now(),
    status: "open",
    ...(otherId ? { [`unread.${otherId}`]: increment(1) } : {}),
    [`unread.${sender.id}`]: 0,
  });

  if (otherId) {
    await pushNotification({
      schoolCode: convo.schoolCode,
      recipientId: otherId,
      title: `New message from ${sender.name}`,
      body: text.slice(0, 140),
      category: "message",
      actorId: sender.id,
      actorName: sender.name,
      actorRole: sender.role || "",
      tab: "messages",
      entityType: "conversation",
      entityId: id,
      studentId: convo.studentId,
      studentName: convo.studentName,
    });
  }
  return true;
}

/** Live list of the conversations one participant is part of. */
export function subscribeConversations(participantId, onChange) {
  if (!participantId) return () => {};
  const q = query(
    collection(db, CONVERSATIONS),
    where("participantIds", "array-contains", participantId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map(decorate);
      rows.sort((a, b) => (b.lastMessageDate?.getTime() || 0) - (a.lastMessageDate?.getTime() || 0));
      onChange(rows);
    },
    (err) => {
      console.error("[messaging] conversation subscription failed:", err);
      onChange([]);
    },
  );
}

/**
 * Live transcript for one conversation, oldest first.
 *
 * The `participantIds` filter mirrors the security rule on this subcollection.
 * Firestore proves a `list` is safe from the query constraints alone, not by
 * checking each returned document, so leaving `participantIds` unconstrained
 * would get the whole read refused even though every message in it is one this
 * participant may see.
 */
export function subscribeMessages(id, participantId, onChange) {
  if (!id || !participantId) return () => {};
  return onSnapshot(
    query(
      collection(db, CONVERSATIONS, id, "messages"),
      where("participantIds", "array-contains", participantId),
    ),
    (snap) => {
      const rows = snap.docs.map(decorate);
      rows.sort((a, b) => (a.createdAtDate?.getTime() || 0) - (b.createdAtDate?.getTime() || 0));
      onChange(rows);
    },
    (err) => {
      console.error("[messaging] message subscription failed:", err);
      onChange([]);
    },
  );
}

export async function markConversationRead(id, participantId) {
  if (!id || !participantId) return;
  try {
    await updateDoc(doc(db, CONVERSATIONS, id), { [`unread.${participantId}`]: 0 });
  } catch (err) {
    console.error("[messaging] markRead failed:", err);
  }
}

export async function setConversationStatus(id, status) {
  await updateDoc(doc(db, CONVERSATIONS, id), { status, updatedAt: serverTimestamp() });
}

/**
 * Staff-initiated thread: opens (or reuses) the conversation with a student's
 * guardian and posts the first message.
 */
export async function startConversationWithGuardian({
  schoolCode, student, staff, body, subject,
}) {
  if (!student?.guardianPhone) {
    return { ok: false, error: "This student has no guardian phone number on file." };
  }
  const id = await ensureConversation({
    schoolCode,
    student: {
      id: student.id,
      name: student.fullName || `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      className: student.className || "",
    },
    staff,
    parent: { phone: student.guardianPhone, name: student.guardianName },
    subject,
  });
  if (body) {
    await sendMessage({ conversationId: id, sender: { ...staff, type: "staff" }, body });
  }
  return { ok: true, id };
}

/** Deletes a conversation and its transcript. */
export async function deleteConversation(id) {
  const msgs = await getDocs(collection(db, CONVERSATIONS, id, "messages"));
  const batch = writeBatch(db);
  msgs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, CONVERSATIONS, id));
  await batch.commit();
}
