// src/services/platform.js
// ─────────────────────────────────────────────────────────────────────────────
// The platform owner's back office: deciding which schools may use Acalink, and
// on what terms. Every action here is allowed by `isPlatformOwner()` in
// firestore.rules and by nothing else — a school cannot approve itself, extend
// its own trial or mark itself paid.
//
// Each decision is written to `platform_audit`, so there is always a record of
// who approved a school, when, and why another was turned away.
//
// Telling the school (WhatsApp + a notification for the founder) is NOT done
// here. The `onSchoolStatusChange` Cloud Function reacts to the status change
// itself, so the school hears about it however the status came to change.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, updateDoc, addDoc, onSnapshot, query, orderBy, limit,
  serverTimestamp, deleteField,
} from "firebase/firestore";
import { apiPost } from "./api";
import { TRIAL_DAYS, toMs, trialEndFrom } from "./subscriptionState";

const DAY = 86_400_000;

async function audit(actor, action, school, detail = {}) {
  try {
    await addDoc(collection(db, "platform_audit"), {
      action,
      schoolCode: school.code || school.id || "",
      schoolName: school.name || "",
      actorId: actor?.id || "",
      actorName: actor?.name || "",
      detail,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // The decision already went through; failing to log it must not undo it.
    console.error("[platform] audit write failed:", err);
  }
}

const schoolRef = (school) => doc(db, "schools", school.code || school.id);

/** Live list of every school, newest registration first. */
export function subscribeSchools(onChange, onError) {
  return onSnapshot(
    collection(db, "schools"),
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
      onChange(rows);
    },
    onError,
  );
}

/** Live tail of the platform audit log. */
export function subscribeAudit(onChange, max = 100) {
  return onSnapshot(
    query(collection(db, "platform_audit"), orderBy("createdAt", "desc"), limit(max)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => onChange([]),
  );
}

/** Approve a pending school. The approval is what starts the trial clock. */
export async function approveSchool(school, actor, { trialDays = TRIAL_DAYS } = {}) {
  const trialEndsAt = new Date(trialEndFrom(Date.now(), trialDays));
  await updateDoc(schoolRef(school), {
    status: "active",
    subscription_status: "trial",
    trialEndsAt,
    approvedAt: serverTimestamp(),
    approvedBy: actor?.id || "",
    rejectedReason: deleteField(),
    suspendedReason: deleteField(),
    lastReminderKey: deleteField(),
  });
  await audit(actor, "approve", school, { trialDays });
  emailDecision(school);
}

export async function rejectSchool(school, actor, reason) {
  await updateDoc(schoolRef(school), { status: "rejected", rejectedReason: reason || "" });
  await audit(actor, "reject", school, { reason });
  emailDecision(school);
}

/**
 * Emails the founder the decision just recorded (api/platform/email-status.js).
 * Fire-and-forget: the decision is saved either way, and the in-app/WhatsApp
 * notice from the Cloud Function still goes out if email isn't set up yet.
 */
function emailDecision(school) {
  apiPost("/api/platform/email-status", { action: "school-decision", schoolCode: school.code || school.id })
    .catch((err) => console.warn("[platform] decision email not sent:", err.message));
}

export async function suspendSchool(school, actor, reason) {
  await updateDoc(schoolRef(school), { status: "suspended", suspendedReason: reason || "" });
  await audit(actor, "suspend", school, { reason });
}

export async function reinstateSchool(school, actor) {
  await updateDoc(schoolRef(school), { status: "active", suspendedReason: deleteField() });
  await audit(actor, "reinstate", school);
}

/** Give a school more trial. Extends from whichever is later: now, or the current end. */
export async function extendTrial(school, actor, days) {
  const base = Math.max(Date.now(), toMs(school.trialEndsAt) || 0);
  await updateDoc(schoolRef(school), {
    subscription_status: "trial",
    trialEndsAt: new Date(base + days * DAY),
    lastReminderKey: deleteField(),
  });
  await audit(actor, "extend_trial", school, { days });
}

/**
 * A school that registered before approval existed has no `status` and runs
 * with no expiry. This puts it on the same footing as everyone else: approved,
 * with a trial of `days` from now.
 */
export async function putLegacyOnPlan(school, actor, { days = TRIAL_DAYS } = {}) {
  await updateDoc(schoolRef(school), {
    status: "active",
    subscription_status: school.subscription_status === "active" ? "active" : "trial",
    trialEndsAt: new Date(trialEndFrom(Date.now(), days)),
    approvedAt: serverTimestamp(),
    approvedBy: actor?.id || "",
    legacyGrandfathered: true,
  });
  await audit(actor, "legacy_plan", school, { days });
}

/**
 * Give a school a discount, or take it away (discount = null). Schools cannot
 * write this field (firestore.rules); billing reads it, so the next checkout is
 * priced with it.
 */
export async function setSchoolDiscount(school, actor, discount) {
  if (!discount) {
    await updateDoc(schoolRef(school), { discount: deleteField() });
    await audit(actor, "set_discount", school, { removed: true });
    return;
  }
  const clean = { type: discount.type, value: Number(discount.value), note: String(discount.note || "").trim().slice(0, 200) };
  await updateDoc(schoolRef(school), { discount: clean });
  await audit(actor, "set_discount", school, clean);
}

/** { [schoolCode]: { total, active } } - students per school, counted on the server. */
export async function fetchStudentCounts() {
  return (await apiPost("/api/platform/email-status", { action: "student-counts" })).counts || {};
}

/**
 * The guardian(s) behind a phone number with their app password and children.
 * Done on the server, which records the lookup in the audit log.
 */
export async function lookupGuardian(phone) {
  return (await apiPost("/api/platform/email-status", { action: "guardian-lookup", phone })).guardians || [];
}
