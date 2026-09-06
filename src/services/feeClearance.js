// src/services/feeClearance.js
// ─────────────────────────────────────────────────────────────────────────────
// Arrears, and the decision that follows from them.
//
// Two things live here because they are the same subject seen from two sides.
//
// The first is *what is owed*. `fee_assignments` records charges and `payments`
// records money, but neither is allocated against the other — a payment says
// only which term it was for. So arrears have to be worked out by allocating
// payments to charges oldest-first, which is what a bursar does on paper and
// what determines whether a debt is this term's or has been carried for a year.
//
// The second is *what the school does about it*. Malawian schools withhold
// exam entry and report cards from families in arrears. Today that decision
// lives in the head teacher's memory, which means it is inconsistent, invisible
// to the bursar, and impossible to appeal. Writing it into `fee_clearance`
// makes it a record: who decided, when, on what balance, and with what reason
// the family can be told.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { parseTerm, resolveTerm } from "./academicTerm";
import { notifyGuardians } from "./notifications";

export const CLEARANCE = "fee_clearance";
export const REMINDERS = "fee_reminders";
export const PLANS = "payment_plans";

// ─── Terms as sortable numbers ───────────────────────────────────────────────

/** Orders terms chronologically. Unparseable terms sort last, not first, so a
 *  malformed record cannot masquerade as the oldest debt. */
export function termRank(term) {
  const p = parseTerm(term);
  return p ? p.year * 10 + p.number : Number.MAX_SAFE_INTEGER;
}

export function compareTerms(a, b) {
  return termRank(a) - termRank(b);
}

/** How many terms back a debt reaches, relative to the term now running. */
export function termsBehind(term, currentTerm) {
  const a = parseTerm(term);
  const b = parseTerm(currentTerm);
  if (!a || !b) return 0;
  return Math.max(0, (b.year * 3 + b.number) - (a.year * 3 + a.number));
}

// ─── Aging ───────────────────────────────────────────────────────────────────

/**
 * Buckets describe how *old* a debt is, not how large. A school chases a
 * hundred thousand kwacha owed since last year quite differently from the same
 * sum charged three weeks ago, and lumping them together is why arrears lists
 * get ignored.
 */
export const AGE_BUCKETS = [
  { id: "current",  label: "This term",      minTerms: 0, tone: "success" },
  { id: "oneTerm",  label: "One term back",  minTerms: 1, tone: "warning" },
  { id: "twoTerms", label: "Two terms back", minTerms: 2, tone: "danger"  },
  { id: "chronic",  label: "A year or more", minTerms: 3, tone: "danger"  },
];

export function bucketFor(termsOld) {
  if (termsOld >= 3) return AGE_BUCKETS[3];
  if (termsOld >= 2) return AGE_BUCKETS[2];
  if (termsOld >= 1) return AGE_BUCKETS[1];
  return AGE_BUCKETS[0];
}

// ─── Allocation ──────────────────────────────────────────────────────────────

/**
 * Works out what a single student owes, and from when.
 *
 * Payments are applied to the oldest outstanding charge first regardless of
 * which term the payment was labelled for. That is deliberate: a parent paying
 * "for Term 2" while Term 1 is unpaid is, in practice, paying down the arrear —
 * treating the label as binding would leave the school reporting an ancient
 * debt beside a credit balance, which is not what happened.
 *
 * @param {Array} charges  fee_assignments for one student
 * @param {Array} paid     payments for one student
 * @param {string} currentTerm
 */
export function allocate(charges, paid, currentTerm) {
  const byTerm = new Map();
  (charges || []).forEach((c) => {
    // Charges are stored by the fee modules as "Term 1" or "Full Year";
    // resolving them against the running term is what makes an arrear
    // sortable, and therefore ageable. An unresolvable term keeps its raw
    // value and simply sorts last.
    const t = resolveTerm(c.term, currentTerm) || c.term || "";
    byTerm.set(t, (byTerm.get(t) || 0) + (Number(c.amount) || 0));
  });

  const terms = [...byTerm.keys()].sort(compareTerms);
  let pool = (paid || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const totalCharged = terms.reduce((s, t) => s + byTerm.get(t), 0);
  const totalPaid = pool;

  const outstandingByTerm = [];
  terms.forEach((t) => {
    const due = byTerm.get(t);
    const applied = Math.min(pool, due);
    pool -= applied;
    const left = due - applied;
    if (left > 0) outstandingByTerm.push({ term: t, amount: left });
  });

  const balance = Math.max(0, totalCharged - totalPaid);
  // A credit balance is real information — a family that has overpaid should
  // never appear on a chase list — so it is reported rather than clamped away.
  const credit = Math.max(0, totalPaid - totalCharged);

  const oldest = outstandingByTerm[0]?.term || "";
  const termsOld = oldest ? termsBehind(oldest, currentTerm) : 0;

  return {
    totalCharged,
    totalPaid,
    balance,
    credit,
    outstandingByTerm,
    oldestUnpaidTerm: oldest,
    termsOld,
    bucket: balance > 0 ? bucketFor(termsOld) : null,
    percentPaid: totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 100,
  };
}

/** Runs `allocate` across a whole school in one pass. */
export function buildArrears({ students, charges, payments, currentTerm }) {
  const chargesBy = new Map();
  (charges || []).forEach((c) => {
    if (!chargesBy.has(c.studentId)) chargesBy.set(c.studentId, []);
    chargesBy.get(c.studentId).push(c);
  });
  const paidBy = new Map();
  (payments || []).forEach((p) => {
    if (!paidBy.has(p.studentId)) paidBy.set(p.studentId, []);
    paidBy.get(p.studentId).push(p);
  });

  return (students || []).map((s) => ({
    ...s,
    ...allocate(chargesBy.get(s.id) || [], paidBy.get(s.id) || [], currentTerm),
  }));
}

// ─── Reminder escalation ─────────────────────────────────────────────────────

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

function fmtAmount(n) {
  return Number(n || 0).toLocaleString("en-MW", { maximumFractionDigits: 0 });
}

/** Which stage a given student's debt warrants right now. */
export function stageFor(row) {
  if (!row || row.balance <= 0) return null;
  if (row.termsOld >= 2) return REMINDER_STAGES[2];
  if (row.termsOld >= 1) return REMINDER_STAGES[1];
  return REMINDER_STAGES[0];
}

/**
 * Sends the reminder each family's debt warrants and logs what was sent.
 *
 * The log is not bookkeeping for its own sake: it is what lets the office
 * answer "have we told them?" without guessing, and what stops the same family
 * being messaged twice in a morning by two different people.
 */
export async function sendReminders({ schoolCode, rows, term, actor, currency = "MK " }) {
  const targets = (rows || []).filter((r) => r.balance > 0 && r.guardianPhone);
  if (targets.length === 0) return { ok: true, sent: 0 };

  const byStage = new Map();
  targets.forEach((r) => {
    const stage = stageFor(r);
    if (!stage) return;
    if (!byStage.has(stage.stage)) byStage.set(stage.stage, { stage, rows: [] });
    byStage.get(stage.stage).rows.push(r);
  });

  try {
    for (const { stage, rows: group } of byStage.values()) {
      await notifyGuardians({
        students: group,
        schoolCode,
        // notifyGuardians calls these per student, so each family gets their
        // own figure rather than a generic line.
        title: (s) => stage.title(s),
        body: (s) => stage.body(s, { term, currency }),
        category: "fees",
        priority: stage.stage >= 3 ? "high" : "normal",
        actorId: actor?.id || "",
        actorName: actor?.name || "Finance Office",
        actorRole: actor?.role || "bursar",
        tab: "Fees",
        entityType: "fee_reminder",
      });

      await Promise.all(group.map((r) => setDoc(
        doc(db, REMINDERS, `${schoolCode}__${r.id}__${term}__${stage.stage}`),
        {
          schoolCode,
          studentId: r.id,
          studentName: r.fullName || "",
          className: r.className || "",
          term,
          stage: stage.stage,
          stageId: stage.id,
          balance: r.balance,
          oldestUnpaidTerm: r.oldestUnpaidTerm || "",
          sentBy: actor?.id || "",
          sentByName: actor?.name || "",
          sentAt: serverTimestamp(),
        },
      )));
    }
    return { ok: true, sent: targets.length };
  } catch (err) {
    console.error("[fees] reminders failed:", err);
    return { ok: false, error: err.message, sent: 0 };
  }
}

export async function fetchReminders(schoolCode, term) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, REMINDERS),
      where("schoolCode", "==", schoolCode),
      where("term", "==", term),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[fees] could not read reminder log:", err);
    return [];
  }
}

// ─── Clearance ───────────────────────────────────────────────────────────────

export const CLEARANCE_STATUS = {
  cleared:     { label: "Cleared",      tone: "success", blocksExam: false, blocksReport: false },
  exams_only:  { label: "Exams only",   tone: "warning", blocksExam: false, blocksReport: true  },
  blocked:     { label: "Withheld",     tone: "danger",  blocksExam: true,  blocksReport: true  },
};

export function clearanceId(schoolCode, studentId, term) {
  return `${schoolCode}__${studentId}__${term}`;
}

/**
 * Records a clearance decision, and tells the family what it is.
 *
 * A decision the family only discovers on exam day is the failure this module
 * exists to prevent, so notifying is part of recording rather than an optional
 * follow-up. A reason is required for anything other than a clearance — "you
 * are withheld" without a reason is not an answer a parent can act on.
 */
export async function setClearance({
  schoolCode, student, term, status, reason, actor,
}) {
  if (!schoolCode || !student?.id || !term) {
    return { ok: false, error: "Missing student or term." };
  }
  if (!CLEARANCE_STATUS[status]) return { ok: false, error: "Unknown clearance status." };
  if (status !== "cleared" && !String(reason || "").trim()) {
    return { ok: false, error: "Give a reason — the family is told what it says." };
  }

  try {
    await setDoc(doc(db, CLEARANCE, clearanceId(schoolCode, student.id, term)), {
      schoolCode,
      studentId: student.id,
      studentName: student.fullName || "",
      classId: student.classId || "",
      className: student.className || "",
      guardianPhone: student.guardianPhone || "",
      term,
      status,
      reason: String(reason || "").trim(),
      balanceAtDecision: Number(student.balance) || 0,
      decidedBy: actor?.id || "",
      decidedByName: actor?.name || "",
      decidedAt: serverTimestamp(),
    });

    const meta = CLEARANCE_STATUS[status];
    await notifyGuardians({
      students: [student],
      schoolCode,
      title: status === "cleared"
        ? `Fees cleared — ${student.fullName}`
        : `Fees outstanding — ${student.fullName}`,
      body: status === "cleared"
        ? `${student.fullName} is cleared for examinations and the ${term} report card.`
        : String(reason || "").trim(),
      category: "fees",
      priority: status === "cleared" ? "normal" : "high",
      actorId: actor?.id || "",
      actorName: actor?.name || "Finance Office",
      actorRole: actor?.role || "bursar",
      tab: "Fees",
      entityType: "fee_clearance",
      entityId: clearanceId(schoolCode, student.id, term),
    });
    return { ok: true, meta };
  } catch (err) {
    console.error("[fees] clearance failed:", err);
    return { ok: false, error: err.message };
  }
}

export async function clearClearance({ schoolCode, studentId, term }) {
  try {
    await deleteDoc(doc(db, CLEARANCE, clearanceId(schoolCode, studentId, term)));
    return { ok: true };
  } catch (err) {
    console.error("[fees] could not remove clearance:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Every clearance decision for a term, keyed by studentId.
 *
 * Filtered on schoolCode and term because a list is authorised from the
 * query's own constraints, not per returned document.
 */
export async function fetchClearances(schoolCode, term) {
  if (!schoolCode || !term) return new Map();
  try {
    const snap = await getDocs(query(
      collection(db, CLEARANCE),
      where("schoolCode", "==", schoolCode),
      where("term", "==", term),
    ));
    const map = new Map();
    snap.docs.forEach((d) => {
      const data = d.data();
      map.set(data.studentId, { id: d.id, ...data });
    });
    return map;
  } catch (err) {
    console.error("[fees] could not read clearances:", err);
    return new Map();
  }
}

/**
 * Whether a report card may be released for this student.
 *
 * The head teacher's report module calls this before issuing, so a withheld
 * student's results are not sent to a family the school has told they are
 * withheld. No record means no restriction — silence is not a block.
 */
export function reportCardAllowed(clearance) {
  if (!clearance) return true;
  return !CLEARANCE_STATUS[clearance.status]?.blocksReport;
}

export function examAllowed(clearance) {
  if (!clearance) return true;
  return !CLEARANCE_STATUS[clearance.status]?.blocksExam;
}

// ─── Payment plans ───────────────────────────────────────────────────────────

/**
 * An agreement to pay in instalments. Recorded rather than remembered, so that
 * a family keeping to a plan is not chased as though they were ignoring the
 * school — which is the usual reason plans break down.
 */
export async function savePlan({ schoolCode, student, term, instalments, note, actor }) {
  const rows = (instalments || [])
    .map((i) => ({ dueDate: i.dueDate, amount: Number(i.amount) || 0, paid: Boolean(i.paid) }))
    .filter((i) => i.dueDate && i.amount > 0);
  if (rows.length === 0) return { ok: false, error: "Add at least one instalment." };

  const id = `${schoolCode}__${student.id}__${term}`;
  try {
    await setDoc(doc(db, PLANS, id), {
      schoolCode,
      studentId: student.id,
      studentName: student.fullName || "",
      className: student.className || "",
      guardianPhone: student.guardianPhone || "",
      term,
      instalments: rows,
      totalPlanned: rows.reduce((s, i) => s + i.amount, 0),
      note: String(note || "").trim(),
      status: "active",
      agreedBy: actor?.id || "",
      agreedByName: actor?.name || "",
      agreedAt: serverTimestamp(),
    });
    return { ok: true, id };
  } catch (err) {
    console.error("[fees] could not save plan:", err);
    return { ok: false, error: err.message };
  }
}

export async function fetchPlans(schoolCode, term) {
  if (!schoolCode) return new Map();
  try {
    const snap = await getDocs(query(
      collection(db, PLANS),
      where("schoolCode", "==", schoolCode),
      where("term", "==", term),
    ));
    const map = new Map();
    snap.docs.forEach((d) => {
      const data = d.data();
      map.set(data.studentId, { id: d.id, ...data });
    });
    return map;
  } catch (err) {
    console.error("[fees] could not read plans:", err);
    return new Map();
  }
}

/** A plan is behind when an instalment's due date has passed unpaid. */
export function planBehind(plan) {
  if (!plan || plan.status !== "active") return false;
  const today = new Date().toISOString().slice(0, 10);
  return (plan.instalments || []).some((i) => !i.paid && i.dueDate < today);
}
