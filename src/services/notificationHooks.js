// src/services/notificationHooks.js
// One function per thing that happens in the school, so the modules that
// trigger them stay a single call long and the wording of a notification lives
// in one place instead of being re-invented per screen.
//
// Every hook swallows its own errors: a guardian not hearing about a mark is a
// far smaller problem than the mark failing to save.
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  notifyGuardians, notifyGuardiansOfClass, notifyRoles, notifyUsers,
  pushNotifications, parentRecipientId,
} from "./notifications";
import { tpl, learnerName } from "./messageTemplates";

/**
 * Spreads a per-student template into the four fields notifyGuardians reads,
 * so each hook says what happened once and both languages come with it.
 */
function bilingual(make) {
  return {
    title: (s) => make(s).title,
    body: (s) => make(s).body,
    titleNy: (s) => make(s).titleNy,
    bodyNy: (s) => make(s).bodyNy,
  };
}

/** Loads the student docs for a school, optionally narrowed to some ids. */
async function loadStudents(schoolCode, ids = null) {
  if (!schoolCode) return [];
  const snap = await getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode)));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!ids) return all;
  const wanted = new Set(ids);
  return all.filter((s) => wanted.has(s.id));
}

/**
 * Turns an announcement audience label into the students it covers.
 * "Form 2 Parents" has to match Form 2A / Form 2B too, hence the prefix test
 * rather than an equality check on className.
 */
function matchesAudience(student, audience = "") {
  const a = audience.toLowerCase();
  if (!a || a.includes("all parents") || a.includes("all students")) return true;

  const form = a.match(/(form|standard)\s*(\d+)/);
  if (form) {
    const prefix = `${form[1]} ${form[2]}`.toLowerCase();
    return (student.className || "").toLowerCase().startsWith(prefix);
  }
  if (a.includes("boarding")) return (student.residence || "").toLowerCase() === "boarding";
  if (a.includes("day")) return (student.residence || "").toLowerCase() === "day";
  return true;
}

// ─── Announcements ───────────────────────────────────────────────────────────
export async function notifyAnnouncement({
  schoolCode, title, message, audience, priority = "Normal", actor,
}) {
  try {
    const audienceLower = (audience || "").toLowerCase();
    const priorityKey = priority === "Urgent" ? "urgent" : priority === "High" ? "high" : "normal";
    const staffOnly = audienceLower.includes("staff");

    if (!staffOnly) {
      const students = (await loadStudents(schoolCode))
        .filter((s) => matchesAudience(s, audience));
      await notifyGuardians({
        students,
        schoolCode,
        title,
        body: message,
        category: "announcement",
        priority: priorityKey,
        actorId: actor?.id,
        actorName: actor?.name,
        actorRole: actor?.role,
        entityType: "announcement",
      });
    }

    // Staff always get a copy of school-wide and staff-targeted notices so the
    // office knows what went out to families.
    await notifyRoles({
      schoolCode,
      roles: ["head_teacher", "class_teacher", "bursar", "admin"],
      excludeIds: [actor?.id],
      title: staffOnly ? title : `Sent to ${audience}: ${title}`,
      body: message,
      category: "announcement",
      priority: priorityKey,
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      tab: "announcements",
      entityType: "announcement",
    });
  } catch (err) {
    console.error("[hooks] announcement notify failed:", err);
  }
}

// ─── Discipline ──────────────────────────────────────────────────────────────
export async function notifyDisciplineLogged({
  schoolCode, caseId, student, offense, severity, action, actor,
}) {
  // Not awaited: the teacher should not wait on WhatsApp to close the form.
  if (caseId) sendGuardianWhatsApp({ kind: "discipline", caseId });
  try {
    await notifyGuardians({
      students: [student],
      schoolCode,
      ...bilingual(() => tpl.discipline(student, { offense, action })),
      category: "discipline",
      priority: severity === "High" ? "urgent" : "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "discipline_case",
    });

    // High-severity cases escalate to leadership immediately.
    if (severity === "High") {
      await notifyRoles({
        schoolCode,
        roles: ["head_teacher"],
        excludeIds: [actor?.id],
        title: `High-severity case: ${student.fullName || student.studentName}`,
        body: `${offense} — logged by ${actor?.name || "a teacher"}`,
        category: "discipline",
        priority: "urgent",
        actorId: actor?.id,
        actorName: actor?.name,
        tab: "discipline",
        entityType: "discipline_case",
        studentId: student.id,
        studentName: student.fullName || student.studentName,
      });
    }
  } catch (err) {
    console.error("[hooks] discipline notify failed:", err);
  }
}

// ─── Attendance ──────────────────────────────────────────────────────────────
/**
 * Tells guardians only about children who were actually absent or late —
 * a "present" notification every morning would train parents to ignore the app.
 * `records` is the { studentId: { status } } map the register saves.
 *
 * `previousRecords` is the register as it was last persisted. A teacher
 * correcting one pupil re-saves the whole map, so without this diff every
 * other absent child's guardian would be told a second time. Only a status
 * that actually changed into Absent or Late sends anything.
 */
export async function notifyAttendanceSaved({
  schoolCode, className, date, records, previousRecords = {}, students, actor,
}) {
  try {
    const flagged = students.filter((s) => {
      const status = records?.[s.id]?.status;
      if (status !== "Absent" && status !== "Late") return false;
      return previousRecords?.[s.id]?.status !== status;
    });
    if (flagged.length === 0) return;

    const readableDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short", day: "2-digit", month: "short",
    });

    await notifyGuardians({
      students: flagged,
      schoolCode,
      ...bilingual((s) => tpl.attendance(s, records[s.id].status, className, readableDate)),
      category: "attendance",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "attendance",
      entityId: date,
    });

    // One request per 60 learners keeps each call inside the server's time limit.
    const items = flagged.map((s) => ({ studentId: s.id, status: records[s.id].status }));
    for (let i = 0; i < items.length; i += 60) {
      await sendGuardianWhatsApp({ kind: "attendance", className, date, items: items.slice(i, i + 60) });
    }
  } catch (err) {
    console.error("[hooks] attendance notify failed:", err);
  }
}

/**
 * Asks the server to WhatsApp guardians about something just recorded.
 * WhatsApp goes through a server endpoint: the WaAPI token cannot live in the
 * browser. The endpoint takes phone numbers from the student records and
 * builds the message itself (with the parents.acalinks.com link), so only ids
 * are sent from here — see api/_lib/guardianSend.js.
 */
async function sendGuardianWhatsApp(payload) {
  try {
    const user = getAuth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/whatsapp/webhook?action=send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error(`[hooks] ${payload.kind} WhatsApp failed:`, res.status, data);
    else if (data.reason || data.skipped || data.failed) console.warn(`[hooks] ${payload.kind} WhatsApp:`, data);
  } catch (err) {
    console.error(`[hooks] ${payload.kind} WhatsApp failed:`, err);
  }
}

// ─── Performance ─────────────────────────────────────────────────────────────
export async function notifyMarksPublished({
  schoolCode, className, subject, assessment, term, studentIds, actor,
}) {
  try {
    const students = await loadStudents(schoolCode, studentIds);
    if (students.length === 0) return;
    await notifyGuardians({
      students,
      schoolCode,
      ...bilingual(() => tpl.marks({ subject, assessment, className, term })),
      category: "performance",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "ca_marks",
    });
  } catch (err) {
    console.error("[hooks] marks notify failed:", err);
  }
}

// ─── Homework ────────────────────────────────────────────────────────────────
/**
 * Notifies the guardians of every student taking the class the homework was
 * assigned to. Matched on `classId` (the id of the class in `school_classes`,
 * not just its display name) so a same-named class on a different campus
 * never gets pulled in — see notifyGuardiansOfClass. `className` is kept as a
 * fallback for any homework doc that predates classId being stored.
 */
export async function notifyHomeworkPosted({
  schoolCode, classId, className, subject, title, dueDate, homeworkId, actor,
}) {
  // Not awaited: a whole class takes a while at WhatsApp's gentle pace.
  if (homeworkId) sendGuardianWhatsApp({ kind: "homework", homeworkId });
  try {
    const due = dueDate
      ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : "";
    await notifyGuardiansOfClass({
      schoolCode,
      classId,
      className,
      ...bilingual(() => tpl.homework({ subject, title, dueLabel: due })),
      category: "homework",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "homework",
      entityId: homeworkId || "",
    });
  } catch (err) {
    console.error("[hooks] homework notify failed:", err);
  }
}

// ─── Fees ────────────────────────────────────────────────────────────────────
export async function notifyPaymentRecorded({
  schoolCode, student, amount, method, receiptNumber, balance, actor,
}) {
  try {
    await notifyGuardians({
      students: [student],
      schoolCode,
      ...bilingual((s) => tpl.payment(s, { amount, method, receiptNumber, balance })),
      category: "fees",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "payment",
      entityId: receiptNumber || "",
    });
  } catch (err) {
    console.error("[hooks] payment notify failed:", err);
  }
}

// ─── Staff account events ────────────────────────────────────────────────────
export async function notifyStaffAdded({ schoolCode, staffName, role, actor }) {
  try {
    await notifyRoles({
      schoolCode,
      roles: ["head_teacher", "admin"],
      excludeIds: [actor?.id],
      title: `${staffName} joined the staff`,
      body: `Added as ${role}. Assign classes from Staff Management.`,
      category: "staff",
      actorId: actor?.id,
      actorName: actor?.name,
      tab: "staff",
    });
  } catch (err) {
    console.error("[hooks] staff notify failed:", err);
  }
}

/**
 * Direct one-off to a single guardian, used by modules that already know the
 * phone number and do not need a student lookup.
 */
export async function notifyGuardianDirect({ schoolCode, phone, ...payload }) {
  if (!phone) return;
  await pushNotifications([{ ...payload, schoolCode, recipientId: parentRecipientId(phone) }]);
}

// ─── Staff leave ─────────────────────────────────────────────────────────────
export async function notifyLeaveRequested({ schoolCode, request, actor }) {
  try {
    await notifyRoles({
      schoolCode,
      roles: ["head_teacher"],
      excludeIds: [actor?.id],
      title: `Leave request: ${request.staffName}`,
      body: `${request.type} · ${request.startDate}${request.endDate !== request.startDate ? ` to ${request.endDate}` : ""} (${request.days} day${request.days === 1 ? "" : "s"})`,
      category: "leave",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      tab: "leave",
      entityType: "leave_request",
      entityId: request.id || "",
    });
  } catch (err) {
    console.error("[hooks] leave request notify failed:", err);
  }
}

export async function notifyLeaveDecided({ schoolCode, request, approved, note, actor }) {
  try {
    await notifyUsers({
      userIds: [request.staffId],
      schoolCode,
      title: approved ? "Your leave was approved" : "Your leave was not approved",
      body: `${request.type} · ${request.startDate}${request.endDate !== request.startDate ? ` to ${request.endDate}` : ""}${note ? ` — ${note}` : ""}`,
      category: "leave",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      tab: "leave",
      entityType: "leave_request",
      entityId: request.id || "",
    });
  } catch (err) {
    console.error("[hooks] leave decision notify failed:", err);
  }
}

// ─── Cover / substitutions ───────────────────────────────────────────────────
export async function notifyCoverAssigned({ schoolCode, substitution, actor }) {
  try {
    await notifyUsers({
      userIds: [substitution.substituteId],
      schoolCode,
      title: `Cover needed: ${substitution.className} ${substitution.subject}`,
      body: `${substitution.date} · Period ${substitution.periodNumber}${substitution.originalTeacherName ? ` (for ${substitution.originalTeacherName})` : ""}. Please confirm you can take it.`,
      category: "cover",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      tab: "leave",
      entityType: "substitution",
      entityId: substitution.id || "",
    });
  } catch (err) {
    console.error("[hooks] cover notify failed:", err);
  }
}

// ─── Lesson plan review ──────────────────────────────────────────────────────
export async function notifyLessonReviewed({ schoolCode, plan, status, comment, actor }) {
  try {
    await notifyUsers({
      userIds: [plan.teacherId],
      schoolCode,
      title: status === "approved" ? "Lesson plan approved" : "Changes requested on a lesson plan",
      body: `${plan.className} · ${plan.subject} · ${plan.topic}${comment ? ` — ${comment}` : ""}`,
      category: "review",
      priority: status === "approved" ? "normal" : "high",
      actorId: actor?.id,
      actorName: actor?.name,
      tab: "myclasses",
      entityType: "lesson_plan",
      entityId: plan.id || "",
    });
  } catch (err) {
    console.error("[hooks] lesson review notify failed:", err);
  }
}

// ─── Exams ───────────────────────────────────────────────────────────────────
/** Tells guardians the timetable for their child's exam. */
export async function notifyExamTimetable({ schoolCode, exam, students, actor }) {
  try {
    const papers = (exam.papers || [])
      .slice()
      .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
    if (papers.length === 0 || students.length === 0) return;
    const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const summary = papers.slice(0, 6).map((p) => `${p.subject} ${fmt(p.date)} ${p.start}`).join("; ")
      + (papers.length > 6 ? ` +${papers.length - 6} more` : "");
    await notifyGuardians({
      students,
      schoolCode,
      ...bilingual((s) => tpl.examTimetable(s, { examName: exam.name, firstDate: fmt(papers[0].date), papers: summary })),
      category: "announcement",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "exam",
      entityId: exam.id || "",
    });
  } catch (err) {
    console.error("[hooks] exam timetable notify failed:", err);
  }
}

/** Tells each invigilator their own duties. `duties` is [{ staffId, lines }]. */
export async function notifyExamDuty({ schoolCode, exam, duties, actor }) {
  try {
    await pushNotifications(duties.filter((d) => d.staffId).map((d) => ({
      schoolCode,
      recipientId: d.staffId,
      title: `Invigilation duty — ${exam.name}`,
      body: d.lines,
      category: "exam",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      tab: "exams",
      entityType: "exam",
      entityId: exam.id || "",
    })));
  } catch (err) {
    console.error("[hooks] exam duty notify failed:", err);
  }
}

// ─── Transport ───────────────────────────────────────────────────────────────
export async function notifyTransportDelay({ schoolCode, route, students, minutes, note, actor }) {
  try {
    await notifyGuardians({
      students,
      schoolCode,
      ...bilingual((s) => tpl.transportDelay(s, { route: route.name, minutes, note })),
      category: "transport",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "transport_route",
      entityId: route.id || "",
    });
  } catch (err) {
    console.error("[hooks] transport notify failed:", err);
  }
}

// ─── Sick bay ────────────────────────────────────────────────────────────────
export async function notifySickbayVisit({ schoolCode, student, complaint, action, sentHome, actor }) {
  try {
    await notifyGuardians({
      students: [student],
      schoolCode,
      ...bilingual((s) => tpl.sickbay(s, { complaint, action, sentHome })),
      category: "health",
      priority: sentHome ? "urgent" : "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "sickbay_visit",
    });
    if (sentHome) {
      await notifyRoles({
        schoolCode,
        roles: ["head_teacher"],
        excludeIds: [actor?.id],
        title: `${learnerName(student)} was sent home from the sick bay`,
        body: `${complaint}${action ? ` · ${action}` : ""}`,
        category: "health",
        priority: "high",
        actorId: actor?.id,
        actorName: actor?.name,
        tab: "health",
        entityType: "sickbay_visit",
      });
    }
  } catch (err) {
    console.error("[hooks] sickbay notify failed:", err);
  }
}

// ─── Library ─────────────────────────────────────────────────────────────────
export async function notifyLibraryOverdue({ schoolCode, student, title, days, actor }) {
  try {
    await notifyGuardians({
      students: [student],
      schoolCode,
      ...bilingual((s) => tpl.libraryOverdue(s, { title, days })),
      category: "library",
      priority: "normal",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "library_loan",
    });
  } catch (err) {
    console.error("[hooks] library notify failed:", err);
  }
}

// ─── At-risk learners ────────────────────────────────────────────────────────
export async function notifyAtRiskGuardian({ schoolCode, student, reasons, actor }) {
  try {
    await notifyGuardians({
      students: [student],
      schoolCode,
      ...bilingual((s) => tpl.atRisk(s, { reasons })),
      category: "risk",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "student",
      entityId: student.id || "",
    });
  } catch (err) {
    console.error("[hooks] at-risk notify failed:", err);
  }
}

/** Direct alert to one staff member, e.g. a security event on their account. */
export async function notifyStaffDirect({ schoolCode, userId, ...payload }) {
  try {
    await notifyUsers({ userIds: [userId], schoolCode, ...payload });
  } catch (err) {
    console.error("[hooks] staff notify failed:", err);
  }
}