// src/services/schoolCalendar.js
// ─────────────────────────────────────────────────────────────────────────────
// Term dates, exam weeks, holidays, visiting day.
//
// Everything else in this system tells a family something about their own
// child. The calendar is the one place that tells them something about the
// school, which is what makes it worth opening on a day when there is no mark
// to look at and no absence to explain.
//
// Dates are stored as plain `YYYY-MM-DD` strings rather than Timestamps. A
// school event happens on a date, not at an instant: a holiday that begins on
// the 3rd begins on the 3rd whether the reader's phone is set to Blantyre or
// somewhere else, and a Timestamp would quietly shift it.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, setDoc, addDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { notifyGuardiansOfClass, notifyRoles } from "./notifications";

export const EVENTS = "school_events";

/**
 * Categories are not decoration: each one answers a different question a
 * parent actually asks, and the colour is how they find it in a list.
 */
export const EVENT_CATEGORIES = [
  { id: "term",     label: "Term dates",   tone: "primary", hint: "Opening and closing days." },
  { id: "exam",     label: "Examinations", tone: "danger",  hint: "Internal exams and MSCE." },
  { id: "holiday",  label: "Holiday",      tone: "success", hint: "Public holidays and mid-term breaks." },
  { id: "meeting",  label: "Meeting",      tone: "warning", hint: "PTA and parents' meetings." },
  { id: "visiting", label: "Visiting day", tone: "primary", hint: "When families may visit boarders." },
  { id: "sports",   label: "Sports",       tone: "success", hint: "Sports day and fixtures." },
  { id: "other",    label: "Other",        tone: "neutral", hint: "Anything else on the school year." },
];

export function categoryMeta(id) {
  return EVENT_CATEGORIES.find((c) => c.id === id) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

export const AUDIENCES = [
  { id: "everyone", label: "Everyone" },
  { id: "parents",  label: "Parents only" },
  { id: "staff",    label: "Staff only" },
];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a single date or a range the way a notice board would write it. */
export function formatWhen(event) {
  if (!event?.startDate) return "";
  const fmt = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  };
  if (!event.endDate || event.endDate === event.startDate) return fmt(event.startDate);
  return `${fmt(event.startDate)} – ${fmt(event.endDate)}`;
}

/** Days until an event starts; negative once it has begun. */
export function daysUntil(event, from = today()) {
  if (!event?.startDate) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${event.startDate}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

/**
 * Whether an event is over. A multi-day event is current until its last day
 * ends — a week of exams should not vanish from the list on the Tuesday.
 */
export function isPast(event, from = today()) {
  const last = event?.endDate || event?.startDate;
  return Boolean(last) && last < from;
}

export function sortEvents(list) {
  return [...(list || [])].sort((a, b) => {
    const d = (a.startDate || "").localeCompare(b.startDate || "");
    return d !== 0 ? d : (a.title || "").localeCompare(b.title || "");
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Every event for a school. Filtered on schoolCode alone, because a list is
 * authorised from the query's own constraints — narrowing by date here would
 * mean a second index and no useful saving at a school's handful of events.
 */
export async function fetchEvents(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, EVENTS),
      where("schoolCode", "==", schoolCode),
    ));
    return sortEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    console.error("[calendar] could not read events:", err);
    return [];
  }
}

/** The next few things coming up, for a dashboard strip. */
export function upcoming(events, count = 5, from = today()) {
  return sortEvents(events).filter((e) => !isPast(e, from)).slice(0, count);
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export async function saveEvent({ schoolCode, event, actor }) {
  const title = String(event?.title || "").trim();
  if (!schoolCode || !title) return { ok: false, error: "An event needs a title." };
  if (!event.startDate) return { ok: false, error: "Pick a start date." };
  if (event.endDate && event.endDate < event.startDate) {
    return { ok: false, error: "The end date cannot come before the start date." };
  }

  const payload = {
    schoolCode,
    title,
    description: String(event.description || "").trim(),
    category: event.category || "other",
    startDate: event.startDate,
    endDate: event.endDate || "",
    audience: event.audience || "everyone",
    term: event.term || "",
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (event.id) {
      await updateDoc(doc(db, EVENTS, event.id), payload);
      return { ok: true, id: event.id };
    }
    const ref = await addDoc(collection(db, EVENTS), {
      ...payload,
      // Whether families have been told is tracked separately from whether the
      // event exists, so a head teacher can draft the year's calendar in one
      // sitting and announce it when they are ready.
      announcedAt: null,
      createdAt: serverTimestamp(),
      createdBy: actor?.id || "",
      createdByName: actor?.name || "",
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[calendar] could not save event:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteEvent(id) {
  try {
    await deleteDoc(doc(db, EVENTS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Tells people an event is happening.
 *
 * Separate from saving for the same reason publishing marks is separate from
 * saving them: correcting a typo in the sports day description should not
 * re-announce sports day to every family in the school.
 */
export async function announceEvent({ schoolCode, event, actor }) {
  if (!schoolCode || !event?.id) return { ok: false, error: "Save the event first." };
  const meta = categoryMeta(event.category);
  const when = formatWhen(event);

  try {
    if (event.audience !== "staff") {
      await notifyGuardiansOfClass({
        schoolCode,
        title: `${meta.label}: ${event.title}`,
        body: event.description ? `${when} · ${event.description}` : when,
        category: "announcement",
        priority: event.category === "exam" ? "high" : "normal",
        actorId: actor?.id || "",
        actorName: actor?.name || "School Office",
        actorRole: actor?.role || "head_teacher",
        tab: "Calendar",
        entityType: "school_event",
        entityId: event.id,
      });
    }
    if (event.audience !== "parents") {
      await notifyRoles({
        schoolCode,
        roles: ["head_teacher", "class_teacher", "teacher", "bursar"],
        excludeIds: [actor?.id].filter(Boolean),
        title: `${meta.label}: ${event.title}`,
        body: event.description ? `${when} · ${event.description}` : when,
        category: "announcement",
        priority: "normal",
        actorId: actor?.id || "",
        actorName: actor?.name || "School Office",
        actorRole: actor?.role || "head_teacher",
        tab: "calendar",
        entityType: "school_event",
        entityId: event.id,
      });
    }

    await setDoc(doc(db, EVENTS, event.id), {
      announcedAt: serverTimestamp(),
      announcedBy: actor?.id || "",
    }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error("[calendar] could not announce event:", err);
    return { ok: false, error: err.message };
  }
}
