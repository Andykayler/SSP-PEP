// src/services/library.js
// ─────────────────────────────────────────────────────────────────────────────
// A school library: the catalogue, who has what, and what is overdue.
//
// Availability is worked out from the loans rather than stored on the book, so
// the count on screen cannot drift away from the loans that produced it — the
// same choice inventory.js makes, for the same reason. A book with 3 copies and
// 2 open loans has 1 available, whatever anyone typed last.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../firebase";
import {
  collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";

export const BOOKS = "library_books";
export const LOANS = "library_loans";

export const BOOK_CATEGORIES = [
  "Textbook", "Fiction", "Non-fiction", "Reference", "Revision / Past papers",
  "Set book", "Periodical", "Other",
];

export const DEFAULT_LOAN_DAYS = 14;

const DAY = 86_400_000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const startOfDay = (iso) => new Date(`${iso}T00:00:00`).getTime();

export const todayISO = () => isoDay(Date.now());
export const dueFromToday = (days = DEFAULT_LOAN_DAYS) => isoDay(Date.now() + days * DAY);

// ─── Reading ─────────────────────────────────────────────────────────────────
export async function fetchBooks(schoolCode) {
  const snap = await getDocs(query(collection(db, BOOKS), where("schoolCode", "==", schoolCode)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

export async function fetchLoans(schoolCode) {
  const snap = await getDocs(query(collection(db, LOANS), where("schoolCode", "==", schoolCode)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.issuedOn || "").localeCompare(a.issuedOn || ""));
}

// ─── Derived ─────────────────────────────────────────────────────────────────
export const isOpen = (loan) => loan.status === "out";

/** Adds `out` and `available` to each book, from its open loans. */
export function withAvailability(books, loans) {
  const out = new Map();
  loans.filter(isOpen).forEach((l) => out.set(l.bookId, (out.get(l.bookId) || 0) + 1));
  return books.map((b) => {
    const copies = Number(b.copies) || 0;
    const o = out.get(b.id) || 0;
    return { ...b, out: o, available: Math.max(0, copies - o) };
  });
}

/** Whole days a loan is past due as of `today` (0 if not overdue or returned). */
export function daysOverdue(loan, today = todayISO()) {
  if (!isOpen(loan) || !loan.dueOn) return 0;
  return Math.max(0, Math.round((startOfDay(today) - startOfDay(loan.dueOn)) / DAY));
}

export const overdueLoans = (loans, today = todayISO()) =>
  loans.filter((l) => daysOverdue(l, today) > 0).sort((a, b) => daysOverdue(b, today) - daysOverdue(a, today));

/** Fine for an overdue loan; 0 when the school charges none. */
export const fineFor = (loan, finePerDay = 0, today = todayISO()) =>
  Math.round(daysOverdue(loan, today) * (Number(finePerDay) || 0));

// ─── Writing ─────────────────────────────────────────────────────────────────
export async function saveBook({ schoolCode, id, data, actor }) {
  const payload = {
    title: data.title.trim(),
    author: (data.author || "").trim(),
    isbn: (data.isbn || "").trim(),
    category: data.category || "Other",
    subject: (data.subject || "").trim(),
    shelf: (data.shelf || "").trim(),
    copies: Math.max(1, Number(data.copies) || 1),
    schoolCode,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, BOOKS, id), payload);
    return id;
  }
  const ref = await addDoc(collection(db, BOOKS), {
    ...payload, createdAt: serverTimestamp(), createdBy: actor?.id || "",
  });
  return ref.id;
}

export async function deleteBook(id) {
  await deleteDoc(doc(db, BOOKS, id));
}

/**
 * Lends a copy. Refuses when none is available, checked against the loans the
 * caller just loaded — two librarians lending the last copy in the same minute
 * is a real but small risk that a school library can live with, and the loan
 * list shows both.
 */
export async function issueBook({ schoolCode, book, borrower, dueOn, actor }) {
  if ((book.available ?? 1) < 1) throw new Error("No copies of this book are available.");
  const ref = await addDoc(collection(db, LOANS), {
    schoolCode,
    bookId: book.id,
    bookTitle: book.title,
    borrowerType: borrower.type,            // "student" | "staff"
    borrowerId: borrower.id,
    borrowerName: borrower.name,
    className: borrower.className || "",
    guardianPhone: borrower.guardianPhone || "",
    status: "out",
    issuedOn: todayISO(),
    dueOn,
    issuedBy: actor?.id || "",
    issuedByName: actor?.name || "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function returnBook({ loan, condition = "good", finePerDay = 0, actor }) {
  const fine = fineFor(loan, finePerDay);
  await updateDoc(doc(db, LOANS, loan.id), {
    status: "returned",
    returnedOn: todayISO(),
    condition,
    fine,
    returnedTo: actor?.id || "",
    returnedToName: actor?.name || "",
    updatedAt: serverTimestamp(),
  });
  return { fine };
}

/** Extends a loan's due date by `days`. */
export async function renewLoan({ loan, days = DEFAULT_LOAN_DAYS }) {
  const base = Math.max(startOfDay(todayISO()), startOfDay(loan.dueOn));
  await updateDoc(doc(db, LOANS, loan.id), {
    dueOn: isoDay(base + days * DAY),
    renewals: (loan.renewals || 0) + 1,
    updatedAt: serverTimestamp(),
  });
}
