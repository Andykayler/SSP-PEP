// api/_lib/waParent.js
// ─────────────────────────────────────────────────────────────────────────────
// The parent menu of the WhatsApp bot: a guardian types RESULTS, ATTENDANCE,
// HOMEWORK, BEHAVIOUR, NOTICES or FEES and gets their child's records back in
// the chat, the same way "Make Payment" starts a payment. Called from
// api/whatsapp/webhook.js; wording and parsing are in
// src/services/waParentCore.js.
//
// WHO MAY SEE WHAT
//
// Identity is the WhatsApp number the message came from, matched against
// `students.guardianPhone` — nothing is typed, so nothing can be spoofed. Two
// extra rules keep a wrong number from exposing a child:
//   • a child whose guardian link is still `pending` (a school attached them to
//     an existing guardian and they have not confirmed in the app — see
//     src/services/guardianLink.js) is never shown over WhatsApp;
//   • results follow the same fee gate as api/parent/results.js
//     (resultsAccessCore.js): withheld while fees are owed unless released.
//
// A guardian with several children is asked to pick one by number; asking for
// an earlier term ("results previous") lists the past terms to pick from.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb } from "./firebaseAdmin.js";
import { findStudentsByGuardianPhone, computeStudentBalance, getCurrentTerm } from "./feeBalance.js";
import { setSession, clearSession } from "./waSession.js";
import { resultsAccess, withheldMessage, releaseId, RELEASES } from "../../src/services/resultsAccessCore.js";
import { childResults } from "../../src/services/resultsCore.js";
import { scaleForClass } from "../../src/services/curriculumCore.js";
import {
  parseParentCommand, pastTerms, resolveRequestedTerm, TERMED, menuText,
  resultsText, attendanceSummary, attendanceText, homeworkText, disciplineText,
  announcementsText, feesText, termWindow,
} from "../../src/services/waParentCore.js";

export { parseParentCommand };

const today = () => new Date().toISOString().slice(0, 10);
const toDate = (v) => (v?.toDate ? v.toDate().toISOString().slice(0, 10) : "");

/** A reply is plain text; WhatsApp copes with long messages but phones do not enjoy them. */
const clip = (t) => String(t).slice(0, 3500);

// ─── Data → text, one function per command ───────────────────────────────────

async function showResults(student, term, current) {
  const schoolCode = student.schoolCode;
  const [balanceInfo, releaseSnap, clearanceSnap] = await Promise.all([
    computeStudentBalance(student),
    adminDb.collection(RELEASES).doc(releaseId(schoolCode, student.id, term)).get(),
    adminDb.collection("fee_clearance").doc(`${schoolCode}__${student.id}__${term}`).get(),
  ]);
  const balance = balanceInfo?.balance || 0;
  const release = releaseSnap.exists ? releaseSnap.data() : null;
  const clearance = clearanceSnap.exists ? clearanceSnap.data() : null;

  const access = resultsAccess({ balance, release, clearance, term });
  if (!access.visible) {
    return `*${student.fullName || "Your child"} – ${term} results*\n`
      + withheldMessage({ reason: access.reason, balance, term, clearance });
  }

  const cardId = `${schoolCode}__${student.id}__${term.replace(/\s+/g, "_")}`;
  const [marksSnap, cardSnap, classCount, settingsSnap, classSnap] = await Promise.all([
    student.classId
      ? adminDb.collection("ca_marks")
        .where("schoolCode", "==", schoolCode).where("classId", "==", student.classId).where("term", "==", term).get()
      : Promise.resolve({ docs: [] }),
    adminDb.collection("report_cards").doc(cardId).get(),
    student.classId
      ? adminDb.collection("students").where("schoolCode", "==", schoolCode).where("classId", "==", student.classId).count().get()
      : Promise.resolve({ data: () => ({ count: 0 }) }),
    adminDb.collection("school_settings").doc(schoolCode).get(),
    student.classId ? adminDb.collection("school_classes").doc(student.classId).get() : Promise.resolve({ exists: false }),
  ]);

  const scale = scaleForClass(settingsSnap.data() || {}, classSnap.exists ? classSnap.data() : null);
  const results = childResults(marksSnap.docs.map((d) => d.data()), student.id);
  const card = cardSnap.exists ? cardSnap.data() : null;
  return resultsText({
    student, term, scale, card, current,
    subjects: results.subjects, overallAverage: results.overallAverage,
    rank: results.rank, classSize: classCount.data().count,
  });
}

async function showAttendance(student, term) {
  if (!student.classId) return attendanceText({ student, term, summary: attendanceSummary([], student.id) });
  const snap = await adminDb.collection("attendance")
    .where("schoolCode", "==", student.schoolCode)
    .where("classId", "==", student.classId)
    .get();
  const summary = attendanceSummary(snap.docs.map((d) => d.data()), student.id, termWindow(term));
  return attendanceText({ student, term, summary });
}

async function showHomework(student) {
  let q = adminDb.collection("homework").where("schoolCode", "==", student.schoolCode);
  if (student.classId) q = q.where("classId", "==", student.classId);
  else if (student.className) q = q.where("className", "==", student.className);
  else return homeworkText({ student, items: [], today: today() });

  const now = today();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const items = (await q.get()).docs
    .map((d) => d.data())
    // Due soon or only just past; undated homework stays until the teacher removes it.
    .filter((h) => !h.dueDate || h.dueDate >= weekAgo)
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))
    .slice(0, 8);
  return homeworkText({ student, items, today: now });
}

async function showDiscipline(student, term) {
  const snap = await adminDb.collection("discipline_cases")
    .where("schoolCode", "==", student.schoolCode)
    .where("studentId", "==", student.id)
    .get();
  const w = termWindow(term);
  const cases = snap.docs.map((d) => d.data())
    .filter((c) => !w || !c.date || (c.date >= w.start && c.date <= w.end))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return disciplineText({ student, term, cases });
}

async function showAnnouncements(student) {
  const snap = await adminDb.collection("announcements").where("schoolCode", "==", student.schoolCode).get();
  const cls = String(student.className || "").toLowerCase();
  // Parent-facing notices only: everyone, or addressed to this child's class.
  const items = snap.docs.map((d) => d.data())
    .filter((a) => {
      const aud = String(a.audience || "").toLowerCase();
      return aud === "all parents" || aud === "everyone" || (cls && aud === `${cls} parents`);
    })
    .map((a) => ({ title: a.title, message: a.message, date: toDate(a.createdAt), ms: a.createdAt?.toMillis?.() || 0 }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3);
  return announcementsText({ items });
}

async function showFees(student) {
  const balance = await computeStudentBalance(student);
  return feesText({ student, balance, term: balance?.currentTerm });
}

async function run(phone, reply, cmd, student, term) {
  const current = await getCurrentTerm(student.schoolCode);
  const useTerm = term || current;
  if (TERMED.has(cmd) && !useTerm) {
    return reply(phone, "The school hasn't set the current term yet, so there's nothing to show. Please try again later.");
  }
  let text;
  if (cmd === "results") text = await showResults(student, useTerm, useTerm === current);
  else if (cmd === "attendance") text = await showAttendance(student, useTerm);
  else if (cmd === "homework") text = await showHomework(student);
  else if (cmd === "discipline") text = await showDiscipline(student, useTerm);
  else if (cmd === "announcements") text = await showAnnouncements(student);
  else text = await showFees(student);

  const foot = TERMED.has(cmd) && useTerm === current
    ? `\n\nFor an earlier term, reply _${cmd === "discipline" ? "behaviour" : cmd} previous_.` : "";
  return reply(phone, clip(text + foot));
}

// ─── Conversation ────────────────────────────────────────────────────────────

// A missing status is an active link (rows from before confirmation existed).
// guardianLink.js can't be imported here — it pulls in the browser Firebase SDK.
const isLinkActive = (s) => (s.guardianLinkStatus || "active") === "active";

/** The guardian's children who may be shown over WhatsApp, and those held back. */
async function visibleStudents(phone) {
  const all = await findStudentsByGuardianPhone(phone);
  return { students: all.filter(isLinkActive), held: all.filter((s) => !isLinkActive(s)) };
}

async function chooseTerm(phone, reply, cmd, student) {
  const current = await getCurrentTerm(student.schoolCode);
  const terms = pastTerms(current);
  if (terms.length === 0) return reply(phone, "There are no earlier terms to show yet.");
  await setSession(phone, { awaiting: "info_term", cmd, studentId: student.id, terms });
  const label = cmd === "discipline" ? "behaviour" : cmd;
  return reply(phone, `Which term's ${label} for ${student.fullName || "your child"}? Reply with a number:\n\n`
    + terms.map((t, i) => `${i + 1}) ${t}`).join("\n"));
}

async function dispatch(phone, reply, parsed, student) {
  const { cmd, term } = parsed;
  if (term?.kind === "list" && TERMED.has(cmd)) return chooseTerm(phone, reply, cmd, student);
  const current = await getCurrentTerm(student.schoolCode);
  const resolved = term?.kind === "term" ? resolveRequestedTerm(term, current) : current;
  if (term?.kind === "term" && !resolved) {
    return reply(phone, "Please include the year, e.g. _results term 1 2025_.");
  }
  return run(phone, reply, cmd, student, resolved);
}

/** A parent typed a menu word. */
export async function startParentCommand(phone, parsed, reply) {
  await clearSession(phone);                // typing a new command abandons any half-finished one
  const { students, held } = await visibleStudents(phone);

  if (students.length === 0) {
    return reply(phone, held.length
      ? "Your child's records will show here once you confirm them in the ACALink app (parents.acalinks.com) with your password."
      : "This number isn't registered as a parent/guardian contact for any student on Acalink. "
        + "Please contact your school's office to update the number on file.");
  }

  if (parsed.cmd === "menu") return reply(phone, menuText(students[0].schoolName || ""));

  if (students.length === 1) return dispatch(phone, reply, parsed, students[0]);

  const options = students.map((s, i) => ({ index: i + 1, studentId: s.id, name: s.fullName || `Child ${i + 1}` }));
  await setSession(phone, { awaiting: "info_child", parsed, options });
  return reply(phone, `Which child? Reply with a number:\n\n${options.map((o) => `${o.index}) ${o.name}`).join("\n")}`);
}

/** The guardian's numbered answer to "which child" or "which term". */
export async function continueParentSession(phone, text, session, reply) {
  const n = parseInt(String(text).trim(), 10);

  if (session.awaiting === "info_child") {
    const chosen = (session.options || []).find((o) => o.index === n);
    if (!chosen) return reply(phone, "Please reply with just the number next to your child's name.");
    const { students } = await visibleStudents(phone);
    const student = students.find((s) => s.id === chosen.studentId);   // re-checked: still theirs, still confirmed
    await clearSession(phone);
    if (!student) return reply(phone, "Sorry, that record could not be found.");
    return dispatch(phone, reply, session.parsed, student);
  }

  // info_term
  const term = (session.terms || [])[n - 1];
  if (!term) return reply(phone, "Please reply with the number next to the term.");
  const { students } = await visibleStudents(phone);
  const student = students.find((s) => s.id === session.studentId);
  await clearSession(phone);
  if (!student) return reply(phone, "Sorry, that record could not be found.");
  return run(phone, reply, session.cmd, student, term);
}
