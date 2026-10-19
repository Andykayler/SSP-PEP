// Billing follows the term. Pure, so tests/logic can check it.
//
// The head teacher opens a term (school_settings.currentTerm). The bursar sets
// the fee structure for that term, class by class. From then on every active
// student is billed from their own class's structure automatically — nobody
// assigns fees by hand, so nobody is forgotten, and a student who joins or
// changes class mid-term is picked up the next time billing is brought up to
// date.
//
// Charges written here are marked `auto: true` and use a deterministic id
// (school + student + fee + term), so bringing billing up to date is
// idempotent: running it twice changes nothing. Charges a bursar entered by
// hand in the past are left exactly as they are.
import { parseTerm, resolveTerm } from "./academicTermCore.js";

/** "2025/2026" for any term in 2026, matching academicYearFor(). */
export function yearOfTerm(term) {
  const p = parseTerm(term);
  return p ? `${p.year - 1}/${p.year}` : "";
}

export function termFeeId(schoolCode, studentId, feeStructureId, term) {
  return `${schoolCode}__${studentId}__${feeStructureId}__${String(term).replace(/\s+/g, "_")}`;
}

/**
 * The fee structure lines that apply to `term`. New lines carry the full term
 * ("Term 2 2026"); older ones carry "Term 2" or "Full Year" plus an academic
 * year, which resolveTerm maps onto the running year ("Full Year" is billed in
 * Term 1).
 */
export function structuresForTerm(structures = [], term) {
  const year = yearOfTerm(term);
  return structures.filter((s) => {
    if (parseTerm(s.term)) return resolveTerm(s.term, term) === term;
    if (s.academicYear && s.academicYear !== year) return false;
    return resolveTerm(s.term, term) === term;
  });
}

const isActive = (s) => (s.status || "active") === "active";

/**
 * Optional (secondary) fees — bus, uniform, a trip — are not owed by the whole
 * class. They are never billed automatically; the bursar adds them to the
 * students who actually take them (see planOptionalFees). Lines saved before
 * the flag existed have no `mandatory` field and stay compulsory.
 */
export const isOptionalLine = (line) => line?.mandatory === false;

/**
 * What has to change for every active student to carry exactly this term's
 * fees for their class.
 *
 * @returns {{ create: {id, data}[], update: {id, data}[], remove: string[] }}
 */
export function planTermFees({ schoolCode, term, students = [], structures = [], assignments = [] }) {
  const plan = { create: [], update: [], remove: [] };
  if (!schoolCode || !parseTerm(term)) return plan;

  const lines = structuresForTerm(structures, term);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const year = yearOfTerm(term);

  // This term's existing charges, by student + fee line.
  const existing = new Map();
  for (const a of assignments) {
    if (resolveTerm(a.term, term) !== term) continue;
    existing.set(`${a.studentId}|${a.feeStructureId}`, a);
  }

  const wanted = new Set();
  for (const s of students) {
    if (!isActive(s) || !s.classId) continue;
    for (const line of lines) {
      if (line.classId !== s.classId || isOptionalLine(line)) continue;
      const key = `${s.id}|${line.id}`;
      wanted.add(key);
      const have = existing.get(key);
      const amount = Number(line.amount) || 0;
      if (!have) {
        plan.create.push({
          id: termFeeId(schoolCode, s.id, line.id, term),
          data: {
            schoolCode,
            studentId: s.id,
            studentName: s.fullName || "",
            studentCode: s.studentCode || "",
            classId: s.classId,
            className: s.className || line.className || "",
            feeStructureId: line.id,
            feeName: line.name || "",
            category: line.category || "",
            amount,
            term,
            academicYear: year,
            auto: true,
          },
        });
      } else if (have.auto && (Number(have.amount) !== amount || have.feeName !== (line.name || ""))) {
        // The bursar corrected a fee: automatic charges follow it.
        plan.update.push({ id: have.id, data: { amount, feeName: line.name || "", category: line.category || "" } });
      }
    }
  }

  // An optional charge follows its fee line's amount and name, but is never
  // created or removed here — only the bursar decides who takes it.
  for (const a of existing.values()) {
    const line = lineById.get(a.feeStructureId);
    if (!line || !isOptionalLine(line) || !a.optional) continue;
    const amount = Number(line.amount) || 0;
    if (Number(a.amount) !== amount || a.feeName !== (line.name || "")) {
      plan.update.push({ id: a.id, data: { amount, feeName: line.name || "", category: line.category || "" } });
    }
  }

  // Charges billed while a line was still compulsory keep no `optional` flag
  // when the bursar later unticks "Mandatory", so they would go on counting
  // toward the student's balance. Flag them, in every term, so an optional fee
  // from the fee structure never sits on a balance.
  const optionalLineIds = new Set(structures.filter(isOptionalLine).map((l) => l.id));
  for (const a of assignments) {
    if (a.optional || !optionalLineIds.has(a.feeStructureId)) continue;
    plan.update.push({ id: a.id, data: { optional: true } });
  }

  // Automatic charges whose fee line was removed, or that belong to a class the
  // student has since left, come off. Hand-entered charges are never touched.
  for (const [key, a] of existing) {
    if (!a.auto || wanted.has(key)) continue;
    const line = lineById.get(a.feeStructureId);
    // A line the bursar has since marked optional: the charge stays on record
    // (flagged optional above) but no longer counts toward the balance.
    if (line && isOptionalLine(line)) continue;
    const student = students.find((s) => s.id === a.studentId);
    // A student who left the school still owes what they were billed.
    if (line && student && !isActive(student)) continue;
    plan.remove.push(a.id);
  }

  return plan;
}

/**
 * Adds an optional fee to the chosen students for `term`, or takes it off
 * again. Idempotent: a student who already has it is left alone.
 *
 * @returns {{ create: {id, data}[], remove: string[] }}
 */
export function planOptionalFees({ schoolCode, term, line, students = [], assignments = [], action = "add" }) {
  const plan = { create: [], remove: [] };
  if (!schoolCode || !parseTerm(term) || !line || !isOptionalLine(line)) return plan;

  const have = new Map();
  for (const a of assignments) {
    if (a.feeStructureId === line.id && resolveTerm(a.term, term) === term) have.set(a.studentId, a);
  }

  for (const s of students) {
    const existing = have.get(s.id);
    if (action === "remove") {
      if (existing && existing.optional) plan.remove.push(existing.id);
      continue;
    }
    if (existing) continue;
    plan.create.push({
      id: termFeeId(schoolCode, s.id, line.id, term),
      data: {
        schoolCode,
        studentId: s.id,
        studentName: s.fullName || "",
        studentCode: s.studentCode || "",
        classId: s.classId || line.classId || "",
        className: s.className || line.className || "",
        feeStructureId: line.id,
        feeName: line.name || "",
        category: line.category || "",
        amount: Number(line.amount) || 0,
        term,
        academicYear: yearOfTerm(term),
        auto: false,
        optional: true,
      },
    });
  }
  return plan;
}

/**
 * Every charge on `term`'s bill, for taking the whole term's billing off so it
 * can be raised again from the fee structure. Matches the term the same way
 * the rest of billing does ("Term 1" and "Term 1 2026" are the same term).
 * Payments are not touched — only what students were charged.
 *
 * @returns {string[]} fee_assignment ids
 */
export function planUnbillTerm({ term, assignments = [] }) {
  if (!parseTerm(term)) return [];
  return assignments.filter((a) => resolveTerm(a.term, term) === term).map((a) => a.id);
}
