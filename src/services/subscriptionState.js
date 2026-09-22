// src/services/subscriptionState.js
// ─────────────────────────────────────────────────────────────────────────────
// Whether a school may use the platform right now, and why not.
//
// Two facts on the school document decide it, and they are set by different
// people so that neither can be self-served:
//
//   status               pending → active | rejected | suspended
//                        Set by the platform owner (Acalink), never the school.
//   subscription_status  trial | active
//                        `trialEndsAt` is stamped when the school is approved;
//                        `paidThrough` when a subscription payment settles.
//
// A school registered before approval existed has neither field. Locking every
// existing school out on the day this ships would be a hostile way to introduce
// it, so a missing `status` reads as "legacy": full access, no expiry, until the
// platform owner puts the school on a plan (Platform → Schools → Legacy).
//
// This module is pure, so the dashboards, the platform console and the tests
// all reach the same verdict from the same document.
// ─────────────────────────────────────────────────────────────────────────────

export const TRIAL_DAYS = 30;
/** Days a school keeps working after its trial ends, with a warning showing. */
export const TRIAL_GRACE_DAYS = 7;
/** Days after a paid period lapses before the school is restricted. */
export const PAID_GRACE_DAYS = 14;

const DAY = 86_400_000;

/** A Firestore Timestamp, Date, epoch-ms number or ISO string → epoch ms (or null). */
export function toMs(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

const wholeDays = (ms) => Math.ceil(ms / DAY);

/**
 * @returns {{
 *   state: string,        // pending|rejected|suspended|trial|trial_grace|trial_expired|active|past_due_grace|past_due|legacy|unknown
 *   blocked: boolean,     // nobody at the school may use the platform
 *   restricted: boolean,  // only billing is available (and only to those who can pay)
 *   warn: boolean,        // show the banner, but everything works
 *   daysLeft: number|null,
 *   title: string,
 *   message: string,
 * }}
 */
export function schoolAccess(school, now = Date.now()) {
  const open = (state, extra = {}) => ({
    state, blocked: false, restricted: false, warn: false,
    daysLeft: null, title: "", message: "", ...extra,
  });

  // A school document that has not loaded (or could not be read) must never
  // lock anyone out: failing closed on a slow network would look like an outage.
  if (!school) return open("unknown");

  const status = school.status;
  if (!status) return open("legacy");

  if (status === "pending") {
    return open("pending", {
      blocked: true,
      title: "Your registration is awaiting approval",
      message:
        "We review every new school before it goes live. You'll get a WhatsApp message and a notification here " +
        "as soon as it's approved. This page updates by itself.",
    });
  }
  if (status === "rejected") {
    return open("rejected", {
      blocked: true,
      title: "This registration wasn't approved",
      message: school.rejectedReason
        ? `Reason: ${school.rejectedReason}`
        : "Please contact Acalink support if you think this is a mistake.",
    });
  }
  if (status === "suspended") {
    return open("suspended", {
      blocked: true,
      title: "This school's access is suspended",
      message: school.suspendedReason
        ? `Reason: ${school.suspendedReason}`
        : "Please contact Acalink support to have access restored.",
    });
  }

  // status === "active"
  const sub = school.subscription_status || "trial";

  if (sub === "active") {
    const paidThrough = toMs(school.paidThrough);
    if (!paidThrough) return open("active");            // paid before dates were tracked

    const left = paidThrough - now;
    if (left >= 0) {
      return open("active", {
        daysLeft: wholeDays(left),
        warn: left <= 14 * DAY,
        title: left <= 14 * DAY ? "Your subscription renews soon" : "",
        message: left <= 14 * DAY ? `Paid up for ${wholeDays(left)} more day${wholeDays(left) === 1 ? "" : "s"}.` : "",
      });
    }
    const late = -left;
    if (late <= PAID_GRACE_DAYS * DAY) {
      return open("past_due_grace", {
        warn: true,
        daysLeft: PAID_GRACE_DAYS - Math.floor(late / DAY),
        title: "Your subscription has lapsed",
        message: `Renew within ${PAID_GRACE_DAYS - Math.floor(late / DAY)} day(s) to keep full access.`,
      });
    }
    return open("past_due", {
      restricted: true,
      title: "Your subscription has lapsed",
      message: "Renew the subscription to restore access for your staff.",
    });
  }

  // subscription_status === "trial"
  const trialEnds = toMs(school.trialEndsAt);
  if (!trialEnds) return open("trial");                  // approved, no clock started yet

  const left = trialEnds - now;
  if (left >= 0) {
    return open("trial", {
      daysLeft: wholeDays(left),
      warn: left <= 7 * DAY,
      title: left <= 7 * DAY ? "Your free trial ends soon" : "",
      message: left <= 7 * DAY ? `${wholeDays(left)} day${wholeDays(left) === 1 ? "" : "s"} left. Subscribe to keep going.` : "",
    });
  }
  const over = -left;
  if (over <= TRIAL_GRACE_DAYS * DAY) {
    return open("trial_grace", {
      warn: true,
      daysLeft: TRIAL_GRACE_DAYS - Math.floor(over / DAY),
      title: "Your free trial has ended",
      message: `Subscribe within ${TRIAL_GRACE_DAYS - Math.floor(over / DAY)} day(s) to keep your staff working.`,
    });
  }
  return open("trial_expired", {
    restricted: true,
    title: "Your free trial has ended",
    message: "Subscribe to restore access for your staff. Your data is safe and waiting.",
  });
}

/** When an approval starts the clock: now + TRIAL_DAYS, as epoch ms. */
export function trialEndFrom(now = Date.now(), days = TRIAL_DAYS) {
  return now + days * DAY;
}

/**
 * How far a settled payment carries the school, by billing cadence. Termly is
 * a Malawian school term plus the holiday that follows it, so it is longer
 * than a calendar quarter.
 */
export function paidThroughAfter(cadence, currentPaidThrough, now = Date.now()) {
  const days = cadence === "annual" ? 365 : cadence === "monthly" ? 31 : 120;
  const base = Math.max(now, toMs(currentPaidThrough) || 0);   // paying early extends, never shortens
  return base + days * DAY;
}
