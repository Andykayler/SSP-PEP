// src/services/inventory.js
// ─────────────────────────────────────────────────────────────────────────────
// School property, and who has it.
//
// Textbooks are the case worth building for. A school issues a set at the
// start of the year and recovers whatever comes back at the end; the gap is a
// real annual loss, paid for out of the same budget as everything else, and
// almost never measured because the issue list is a exercise book that gets
// lost more reliably than the textbooks do.
//
// Two records: `inventory_items` is what the school owns, `inventory_issues`
// is each thing currently out. Availability is derived from issues rather than
// stored, so it cannot drift from the loans that produced it.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

export const ITEMS = "inventory_items";
export const ISSUES = "inventory_issues";

export const ITEM_CATEGORIES = [
  { id: "textbook",  label: "Textbooks" },
  { id: "lab",       label: "Laboratory equipment" },
  { id: "sports",    label: "Sports equipment" },
  { id: "furniture", label: "Furniture" },
  { id: "ict",       label: "Computers & ICT" },
  { id: "other",     label: "Other" },
];

export const CONDITIONS = ["Good", "Fair", "Damaged", "Lost"];

export function categoryLabel(id) {
  return ITEM_CATEGORIES.find((c) => c.id === id)?.label || "Other";
}

// ─── Items ───────────────────────────────────────────────────────────────────

export async function fetchItems(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, ITEMS),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    console.error("[inventory] could not read items:", err);
    return [];
  }
}

export async function saveItem({ schoolCode, item, actor }) {
  const name = String(item?.name || "").trim();
  const quantity = Number(item?.quantity) || 0;
  if (!schoolCode || !name) return { ok: false, error: "The item needs a name." };
  if (quantity <= 0) return { ok: false, error: "Enter how many the school holds." };

  const payload = {
    schoolCode,
    name,
    category: item.category || "other",
    subject: String(item.subject || "").trim(),
    quantity,
    unitValue: Number(item.unitValue) || 0,
    location: String(item.location || "").trim(),
    notes: String(item.notes || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: actor?.id || "",
  };

  try {
    if (item.id) {
      await updateDoc(doc(db, ITEMS, item.id), payload);
      return { ok: true, id: item.id };
    }
    const ref = await addDoc(collection(db, ITEMS), { ...payload, createdAt: serverTimestamp() });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[inventory] could not save item:", err);
    return { ok: false, error: err.message };
  }
}

export async function deleteItem(id) {
  try {
    await deleteDoc(doc(db, ITEMS, id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Issues ──────────────────────────────────────────────────────────────────

export async function fetchIssues(schoolCode) {
  if (!schoolCode) return [];
  try {
    const snap = await getDocs(query(
      collection(db, ISSUES),
      where("schoolCode", "==", schoolCode),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.issuedAtMs || 0) - (a.issuedAtMs || 0));
  } catch (err) {
    console.error("[inventory] could not read issues:", err);
    return [];
  }
}

/**
 * Issues copies to a student.
 *
 * Refuses to issue more than are free, because an inventory that can go
 * negative is one nobody trusts enough to check against.
 */
export async function issueItem({ schoolCode, item, student, quantity, dueDate, available, actor }) {
  const qty = Number(quantity) || 0;
  if (!schoolCode || !item?.id || !student?.id) {
    return { ok: false, error: "Pick an item and a student." };
  }
  if (qty <= 0) return { ok: false, error: "Enter how many are being issued." };
  if (available !== undefined && qty > available) {
    return { ok: false, error: `Only ${available} available.` };
  }

  try {
    const ref = await addDoc(collection(db, ISSUES), {
      schoolCode,
      itemId: item.id,
      itemName: item.name || "",
      category: item.category || "",
      studentId: student.id,
      studentName: student.fullName || "",
      classId: student.classId || "",
      className: student.className || "",
      quantity: qty,
      dueDate: dueDate || "",
      issuedBy: actor?.id || "",
      issuedByName: actor?.name || "",
      issuedAt: serverTimestamp(),
      issuedAtMs: Date.now(),
      returnedAt: null,
      returnedQuantity: 0,
      condition: "",
    });
    return { ok: true, id: ref.id };
  } catch (err) {
    console.error("[inventory] issue failed:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Records a return.
 *
 * A partial return is normal — three of five textbooks come back — so the
 * quantity returned is recorded rather than assumed, and what is missing stays
 * outstanding against the student.
 */
export async function returnItem({ issue, quantity, condition, actor }) {
  const qty = Number(quantity) || 0;
  if (!issue?.id) return { ok: false, error: "No issue record." };
  if (qty <= 0 || qty > issue.quantity) {
    return { ok: false, error: `Enter between 1 and ${issue.quantity}.` };
  }
  const returned = (Number(issue.returnedQuantity) || 0) + qty;
  try {
    await updateDoc(doc(db, ISSUES, issue.id), {
      returnedQuantity: returned,
      condition: condition || "Good",
      // Only closed once everything is back; a partial return leaves the row
      // open so the outstanding copies keep showing up on the chase list.
      returnedAt: returned >= issue.quantity ? serverTimestamp() : null,
      returnedBy: actor?.id || "",
      returnedByName: actor?.name || "",
    });
    return { ok: true };
  } catch (err) {
    console.error("[inventory] return failed:", err);
    return { ok: false, error: err.message };
  }
}

// ─── Derived ─────────────────────────────────────────────────────────────────

/** How many of each item are out on loan right now. */
export function outstandingByItem(issues) {
  const out = new Map();
  (issues || []).forEach((i) => {
    const left = (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0);
    if (left <= 0) return;
    out.set(i.itemId, (out.get(i.itemId) || 0) + left);
  });
  return out;
}

/** Items with availability worked out from the loans against them. */
export function withAvailability(items, issues) {
  const out = outstandingByItem(issues);
  return (items || []).map((item) => {
    const issued = out.get(item.id) || 0;
    return {
      ...item,
      issued,
      available: Math.max(0, (item.quantity || 0) - issued),
      fullyOut: issued >= (item.quantity || 0),
    };
  });
}

/** Loans still open — the recovery list at the end of a year. */
export function openIssues(issues) {
  return (issues || []).filter(
    (i) => (Number(i.returnedQuantity) || 0) < (Number(i.quantity) || 0),
  );
}

/** Open loans past their due date. */
export function overdueIssues(issues, from = new Date().toISOString().slice(0, 10)) {
  return openIssues(issues).filter((i) => i.dueDate && i.dueDate < from);
}

/** What the unreturned property is worth — the number a board reacts to. */
export function lossValue(items, issues) {
  const byId = new Map((items || []).map((i) => [i.id, i]));
  return openIssues(issues).reduce((sum, i) => {
    const left = (Number(i.quantity) || 0) - (Number(i.returnedQuantity) || 0);
    return sum + left * (Number(byId.get(i.itemId)?.unitValue) || 0);
  }, 0);
}
