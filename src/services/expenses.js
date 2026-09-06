// src/services/expenses.js
// ─────────────────────────────────────────────────────────────────────────────
// The other side of the ledger.
//
// The finance portal records money coming in and nothing going out, which
// means a bursar still keeps a cash book beside it and the school's real
// position lives in neither. A board asking "what did we spend on maintenance
// last term" cannot be answered from this system at all.
//
// Deliberately simple: a dated row with a category, an amount and who
// authorised it. This is a school office's petty cash and expenditure record,
// not double-entry accounting, and pretending otherwise would produce
// something no bursar would keep up.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

export const EXPENSES = "expenses";

/** Categories a Malawian secondary school actually books against. */
export const EXPENSE_CATEGORIES = [
  { id: "salaries",    label: "Salaries & allowances" },
  { id: "utilities",   label: "Utilities (ESCOM, water)" },
  { id: "maintenance", label: "Repairs & maintenance" },
  { id: "teaching",    label: "Teaching materials" },
  { id: "food",        label: "Food & catering" },
  { id: "transport",   label: "Transport & fuel" },
  { id: "admin",       label: "Administration & stationery" },
  { id: "exams",       label: "Examination fees" },
  { id: "sports",      label: "Sports & activities" },
  { id: "other",       label: "Other" },
];

export const PAYMENT_METHODS = ["Cash", "Bank transfer", "Cheque", "Airtel Money", "TNM Mpamba"];

export function categoryLabel(id) {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.label || "Other";
}

export async function fetchExpenses(schoolCode, term) {
  if (!schoolCode) return [];
  try {
    const filters = [where("schoolCode", "==", schoolCode)];
    if (term) filters.push(where("term", "==", term));
    const snap = await getDocs(query(collection(db, EXPENSES), ...filters));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } catch (err) {
    console.error("[expenses] could not read expenses:", err);
    return [];
  }
}

export async function saveExpense({ schoolCode, expense, actor }) {
  const amount = Number(expense?.amount) || 0;
  const description = String(expense?.description || "").trim();
  if (!schoolCode) return { ok: false, error: "No school code." };
  if (amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  if (!description) return { ok: false, error: "Say what the money was spent on." };
  if (!expense.date) return { ok: false, error: "Pick the date of the expense." };

  const payload = {
    schoolCode,
    date: expense.date,
    category: expense.category || "other",
    description,
    amount,
    method: expense.method || "Cash",
    payee: String(expense.payee || "").trim(),
    reference: String(expense.reference || "").trim(),
    term: expense.term || "",
    // Who authorised it is the field an auditor asks for and the one most
    // often missing from a paper cash book.
    authorisedBy: String(expense.authorisedBy || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (expense.id) {
      await updateDoc(doc(db, EXPENSES, expense.id), payload);
      return { ok: true, id: expense.id };
    }
    const ref = await addDoc(collection(db, EXPENSES), {
      ...payload,
      recordedBy: actor?.id || "",
      recordedByName: actor?.name || "",
      createdAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[expenses] could not save expense:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteExpense(id) {
  try {
    await deleteDoc(doc(db, EXPENSES, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Totals by category, largest first — how a board wants it presented. */
export function byCategory(expenses) {
  const tally = new Map();
  (expenses || []).forEach((e) => {
    const id = e.category || "other";
    tally.set(id, (tally.get(id) || 0) + (Number(e.amount) || 0));
  });
  return [...tally.entries()]
    .map(([id, total]) => ({ id, label: categoryLabel(id), total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Income against expenditure for a term.
 *
 * Income is taken from verified payments only. An unverified payment is a
 * claim someone typed in, and letting claims inflate the income line is how a
 * school convinces itself it is solvent.
 */
export function position({ payments, expenses }) {
  const income = (payments || [])
    .filter((p) => p.status === "verified")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const spent = (expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { income, spent, net: income - spent };
}
