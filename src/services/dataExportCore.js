// src/services/dataExportCore.js
// The pure half of the data export: which datasets exist, and how a Firestore
// document becomes plain, credential-free JSON. No Firebase, so the stripping of
// passwords — the part that must never quietly stop working — can be tested.
// Reading and writing lives in dataExport.js.

export const BACKUP_VERSION = 1;

/** `sensitive` datasets start unticked: they hold health and discipline detail. */
export const DATASETS = [
  { id: "students", label: "Learners", group: "People" },
  { id: "users", label: "Staff accounts", group: "People" },
  { id: "school_classes", label: "Classes and streams", group: "People" },
  { id: "timetable", label: "Timetable", group: "Teaching" },
  { id: "lesson_plans", label: "Lesson plans", group: "Teaching" },
  { id: "homework", label: "Homework", group: "Teaching" },
  { id: "attendance", label: "Attendance registers", group: "Records" },
  { id: "ca_marks", label: "Marks", group: "Records" },
  { id: "report_cards", label: "Report cards", group: "Records" },
  { id: "exams", label: "Examinations", group: "Records" },
  { id: "fee_structures", label: "Fee structures", group: "Fees" },
  { id: "fee_assignments", label: "Fees charged", group: "Fees" },
  { id: "payments", label: "Fee payments", group: "Fees" },
  { id: "expenses", label: "Expenses", group: "Fees" },
  { id: "announcements", label: "Announcements", group: "Other" },
  { id: "school_events", label: "Calendar events", group: "Other" },
  { id: "leave_requests", label: "Staff leave", group: "Other" },
  { id: "library_books", label: "Library books", group: "Other" },
  { id: "library_loans", label: "Library loans", group: "Other" },
  { id: "transport_routes", label: "Transport routes", group: "Other" },
  { id: "discipline_cases", label: "Discipline cases", group: "Sensitive", sensitive: true },
  { id: "health_profiles", label: "Health profiles", group: "Sensitive", sensitive: true },
  { id: "sickbay_visits", label: "Sick bay visits", group: "Sensitive", sensitive: true },
];

const SECRET_KEY = /password|passcode|secret|token/i;

/**
 * Firestore values → plain JSON. Timestamps become ISO strings, and any key that
 * looks like a credential is dropped (and counted, so the file can say so).
 */
export function cleanValue(value, stats = { stripped: 0 }) {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => cleanValue(v, stats));
  if (typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (SECRET_KEY.test(k)) { stats.stripped += 1; return; }
      out[k] = cleanValue(v, stats);
    });
    return out;
  }
  return value;
}

/** Flattens documents into rows for a CSV: nested values become JSON text in one cell. */
export function toTable(rows) {
  const keys = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
  const cell = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v);
  return { headers: keys, rows: rows.map((r) => keys.map((k) => cell(r[k]))) };
}
