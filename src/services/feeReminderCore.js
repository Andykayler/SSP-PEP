// src/services/feeReminderCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure half of feeClearance.js's reminder wording — no Firestore, no
// notifications channel.
//
// Split out so serverless functions (api/whatsapp/send-reminders.js) can send
// the exact wording a family's arrears warrant over WhatsApp too, rather than
// a second copy of the escalation rule that can drift from the in-app one.
// feeClearance.js re-exports everything here, so existing imports of
// feeClearance.js are unaffected.
// ─────────────────────────────────────────────────────────────────────────────

function fmtAmount(n) {
  return Number(n || 0).toLocaleString("en-MW", { maximumFractionDigits: 0 });
}

/**
 * Three stages, and the wording changes at each. Escalation is driven by how
 * old the debt is rather than how many messages have already gone out — a
 * family that has just fallen behind should not receive a final notice because
 * the school happened to run the reminder three times in a week.
 */
export const REMINDER_STAGES = [
  {
    stage: 1,
    id: "gentle",
    label: "Reminder",
    tone: "success",
    describe: "A friendly note that fees are outstanding.",
    title: (s) => `Fees outstanding — ${s.fullName || "your child"}`,
    body: (s, ctx) =>
      `Good day. ${s.fullName || "Your child"}'s school fees for ${ctx.term} show a balance of `
      + `${ctx.currency}${fmtAmount(s.balance)}. Please settle at the school office when you can. Thank you.`,
  },
  {
    stage: 2,
    id: "firm",
    label: "Follow-up",
    tone: "warning",
    describe: "A firmer note once a debt has been carried into a new term.",
    title: (s) => `Fees still outstanding — ${s.fullName || "your child"}`,
    body: (s, ctx) =>
      `${s.fullName || "Your child"} has an unpaid balance of ${ctx.currency}${fmtAmount(s.balance)}, `
      + `outstanding since ${s.oldestUnpaidTerm}. Please visit the school office to pay or to agree a `
      + `payment plan.`,
  },
  {
    stage: 3,
    id: "final",
    label: "Final notice",
    tone: "danger",
    describe: "Sent before exam entry or report cards are withheld.",
    title: (s) => `Final notice — fees for ${s.fullName || "your child"}`,
    body: (s, ctx) =>
      `${s.fullName || "Your child"} owes ${ctx.currency}${fmtAmount(s.balance)} from ${s.oldestUnpaidTerm}. `
      + `Unless this is settled or a payment plan agreed, the school may withhold examination entry and the `
      + `end of term report. Please come to the office.`,
  },
];

/** Which stage a given student's debt warrants right now. */
export function stageFor(row) {
  if (!row || row.balance <= 0) return null;
  if (row.termsOld >= 2) return REMINDER_STAGES[2];
  if (row.termsOld >= 1) return REMINDER_STAGES[1];
  return REMINDER_STAGES[0];
}
