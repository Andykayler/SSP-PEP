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
import { notifyGuardians } from "./notifications";
import {
  termRank, compareTerms, termsBehind, AGE_BUCKETS, bucketFor, allocate, buildArrears,
} from "./feeAllocationCore.js";
import { REMINDER_STAGES, stageFor } from "./feeReminderCore.js";

export const CLEARANCE = "fee_clearance";
export const REMINDERS = "fee_reminders";
export const PLANS = "payment_plans";

// termRank, compareTerms, termsBehind, AGE_BUCKETS, bucketFor, allocate and
// buildArrears now live in feeAllocationCore.js; REMINDER_STAGES and stageFor
// live in feeReminderCore.js — both pure (no Firestore import), so serverless
// functions (the WhatsApp reminder sender) compute the same balance and send
// the same wording without pulling in the client "firebase" package;
// re-exported here so nothing importing this module has to change.
export {
  termRank, compareTerms, termsBehind, AGE_BUCKETS, bucketFor, allocate, buildArrears,
  REMINDER_STAGES, stageFor,
};

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
