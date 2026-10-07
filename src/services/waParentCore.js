// src/services/waParentCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure half of the parent WhatsApp menu: what a parent may type, and how a
// child's records read on a phone. No Firestore, no network — the data loading
// is api/_lib/waParent.js, which feeds these functions.
//
// Parents type one word ("results", "attendance", "homework", "behaviour",
// "notices", "fees", "menu"), optionally followed by a term ("results term 1
// 2025") or "previous" to pick from earlier terms. Anything that is not exactly
// one of those is ignored, so ordinary chat to the school's number never
// triggers a reply.
// ─────────────────────────────────────────────────────────────────────────────
import { parseTerm, formatTerm, termWindow } from "./academicTermCore.js";
import { gradeFor } from "./curriculumCore.js";

export const COMMANDS = {
  results:       /^(results?|marks|report|zotsatira)$/i,
  attendance:    /^(attendance|register|absent|kupezeka)$/i,
  homework:      /^(homework|home\s*work|homuweki)$/i,
  discipline:    /^(behaviou?r|discipline|conduct)$/i,
  announcements: /^(notices?|announcements?|news|uthenga)$/i,
  fees:          /^(fees?|balance|bal)$/i,
  menu:          /^(menu|help|options|commands|thandizo)$/i,
};

/** Commands whose records belong to a term and so accept one. */
export const TERMED = new Set(["results", "attendance", "discipline"]);

const PREVIOUS_RE = /^(previous|prev|last|past|earlier|old|older)(\s+terms?)?$/i;
const CURRENT_RE = /^(current|this|now)(\s+term)?$/i;

/**
 * @returns {{ cmd: string, term: null|{ kind: "current" } | { kind: "list" } | { kind: "term", number: number, year: number|null } } | null}
 */
export function parseParentCommand(text) {
  const words = String(text || "").trim().replace(/\s+/g, " ");
  if (!words || words.length > 40) return null;

  // Longest command word first so "home work" is not read as "home".
  const parts = words.split(" ");
  for (const take of [2, 1]) {
    if (parts.length < take) continue;
    const head = parts.slice(0, take).join(" ");
    const cmd = Object.keys(COMMANDS).find((k) => COMMANDS[k].test(head));
    if (!cmd) continue;

    const rest = parts.slice(take).join(" ");
    if (!rest) return { cmd, term: { kind: "current" } };
    if (!TERMED.has(cmd)) return null;

    if (CURRENT_RE.test(rest)) return { cmd, term: { kind: "current" } };
    if (PREVIOUS_RE.test(rest)) return { cmd, term: { kind: "list" } };
    const m = /^(?:term\s*|t\s*)(\d)(?:\s+(\d{4}))?$/i.exec(rest);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 3) {
      return { cmd, term: { kind: "term", number: Number(m[1]), year: m[2] ? Number(m[2]) : null } };
    }
    return null;
  }
  return null;
}

/**
 * Terms before `currentTerm`, newest first. A year-less "term 2" typed by a
 * parent resolves against the current term's year, falling back a year when
 * that would be a term still to come.
 */
export function pastTerms(currentTerm, count = 5) {
  const parsed = parseTerm(currentTerm);
  if (!parsed) return [];
  const out = [];
  let cursor = { ...parsed };
  for (let i = 0; i < count; i += 1) {
    cursor = cursor.number <= 1
      ? { number: 3, year: cursor.year - 1 }
      : { number: cursor.number - 1, year: cursor.year };
    out.push(formatTerm(cursor.number, cursor.year));
  }
  return out;
}

export function resolveRequestedTerm(request, currentTerm) {
  const now = parseTerm(currentTerm);
  if (request.kind !== "term") return currentTerm;
  const year = request.year ?? now?.year;
  if (!year) return "";
  const term = formatTerm(request.number, year);
  // Without an explicit year, "term 3" typed in Term 1 means last year's.
  if (request.year == null && now) {
    const wanted = request.number + year * 3;
    if (wanted > now.number + now.year * 3) return formatTerm(request.number, year - 1);
  }
  return term;
}

// ─── Wording ─────────────────────────────────────────────────────────────────

const money = (n) => `MK ${Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const name = (s) => s?.fullName || `${s?.firstName || ""} ${s?.lastName || ""}`.trim() || "Your child";
const day = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(iso || "") : d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
};

export const MENU_LINES = [
  "*RESULTS* – exam and test results",
  "*ATTENDANCE* – days present, absent and late",
  "*HOMEWORK* – what is due",
  "*BEHAVIOUR* – discipline record",
  "*NOTICES* – school announcements",
  "*FEES* – balance owing",
  "*MAKE PAYMENT* – pay fees by mobile money",
];

export function menuText(schoolName = "") {
  return `${schoolName ? `*${schoolName}*\n` : ""}Reply with one word:\n\n${MENU_LINES.join("\n")}\n\n`
    + "For an earlier term add PREVIOUS, e.g. _results previous_ or _attendance term 1 2025_.\n"
    + "Reply STOP to stop school messages.";
}

export function resultsText({ student, term, subjects, overallAverage, rank, classSize, scale, card, current }) {
  const lines = [`*${name(student)} – ${term} results*`];
  const rows = subjects?.length
    ? subjects.map((s) => ({ subject: s.subject, score: s.weighted }))
    : (card?.subjects || []).map((s) => ({ subject: s.subject || s.name, score: s.weighted ?? s.score ?? s.average ?? s.total }));
  const usable = rows.filter((r) => r.subject && r.score != null);

  if (usable.length === 0) {
    lines.push(current
      ? "No results have been published for this term yet."
      : "No published results were found for that term.");
    return lines.join("\n");
  }
  for (const r of usable) {
    const g = gradeFor(r.score, scale);
    lines.push(`${r.subject}: ${Math.round(r.score)}%${g ? ` (${g.label}${g.remark ? ` – ${g.remark}` : ""})` : ""}`);
  }
  const avg = overallAverage ?? card?.overallAverage;
  if (avg != null) {
    const g = gradeFor(avg, scale);
    lines.push("", `Average: ${Math.round(avg * 10) / 10}%${g ? ` (${g.label})` : ""}`);
  }
  const pos = rank ?? card?.position;
  const size = classSize || card?.classSize;
  if (pos && size) lines.push(`Position: ${pos} of ${size}`);
  if (card?.headTeacherRemark) lines.push("", `Head teacher: ${card.headTeacherRemark}`);
  return lines.join("\n");
}

export function attendanceSummary(docs, studentId, window) {
  const out = { recorded: 0, present: 0, absent: 0, late: 0, issues: [] };
  for (const d of docs) {
    if (window && d.date && (d.date < window.start || d.date > window.end)) continue;
    const entry = d.records?.[studentId];
    const status = typeof entry === "string" ? entry : entry?.status;
    if (!status) continue;
    out.recorded += 1;
    if (status === "Absent") { out.absent += 1; out.issues.push({ date: d.date, status }); }
    else if (status === "Late") { out.late += 1; out.present += 1; out.issues.push({ date: d.date, status }); }
    else if (status === "Present" || status === "Excused") out.present += 1;
  }
  out.issues.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}

export function attendanceText({ student, term, summary }) {
  const lines = [`*${name(student)} – ${term} attendance*`];
  if (summary.recorded === 0) {
    lines.push("No attendance has been recorded for this term.");
    return lines.join("\n");
  }
  const pct = Math.round((summary.present / summary.recorded) * 100);
  lines.push(
    `Days recorded: ${summary.recorded}`,
    `Present: ${summary.present} (${pct}%)`,
    `Absent: ${summary.absent}`,
    `Late: ${summary.late}`,
  );
  if (summary.issues.length) {
    lines.push("", "Most recent absences and late arrivals:");
    for (const i of summary.issues.slice(0, 5)) lines.push(`• ${day(i.date)} – ${i.status}`);
  }
  return lines.join("\n");
}

export function homeworkText({ student, items, today }) {
  const lines = [`*${name(student)} – homework*`];
  if (items.length === 0) {
    lines.push("No homework is currently due.");
    return lines.join("\n");
  }
  for (const h of items) {
    const overdue = h.dueDate && h.dueDate < today;
    lines.push(`• ${h.subject || "Homework"}: ${h.title || "Untitled"}${h.dueDate ? ` – due ${day(h.dueDate)}${overdue ? " (past due)" : ""}` : ""}`);
    if (h.description) lines.push(`  ${String(h.description).slice(0, 140)}`);
  }
  return lines.join("\n");
}

export function disciplineText({ student, term, cases }) {
  const lines = [`*${name(student)} – ${term} behaviour*`];
  if (cases.length === 0) {
    lines.push("No discipline cases recorded for this term. Well done!");
    return lines.join("\n");
  }
  lines.push(`${cases.length} case${cases.length === 1 ? "" : "s"} recorded:`);
  for (const c of cases.slice(0, 6)) {
    const action = c.action && c.action !== "Pending review" ? ` – ${c.action}` : "";
    lines.push(`• ${day(c.date)}: ${c.offense || "Incident"}${action}`);
  }
  return lines.join("\n");
}

export function announcementsText({ items }) {
  if (items.length === 0) return "*School notices*\nThere are no recent notices.";
  const lines = ["*School notices*"];
  for (const a of items) {
    lines.push("", `*${a.title || "Notice"}*${a.date ? ` (${day(a.date)})` : ""}`, String(a.message || "").slice(0, 300));
  }
  return lines.join("\n");
}

export function feesText({ student, balance, term }) {
  if (!balance || balance.balance <= 0) return `*${name(student)} – fees*\nNo outstanding balance. Thank you!`;
  return `*${name(student)} – fees*\nBalance owing: ${money(balance.balance)}${term ? ` (current term: ${term})` : ""}\n\nReply *MAKE PAYMENT* to pay now.`;
}

export { termWindow };
