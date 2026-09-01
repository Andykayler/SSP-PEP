// src/services/notificationHooks.js
// One function per thing that happens in the school, so the modules that
// trigger them stay a single call long and the wording of a notification lives
// in one place instead of being re-invented per screen.
//
// Every hook swallows its own errors: a guardian not hearing about a mark is a
// far smaller problem than the mark failing to save.
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { notifyGuardians, notifyRoles, pushNotifications, parentRecipientId } from "./notifications";

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
  schoolCode, student, offense, severity, action, actor,
}) {
  try {
    await notifyGuardians({
      students: [student],
      schoolCode,
      title: `Discipline record for ${student.fullName || student.studentName || "your child"}`,
      body: `${offense}${action ? ` · Action: ${action}` : ""}`,
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
      title: (s) => `${s.fullName || "Your child"} was marked ${records[s.id].status.toLowerCase()}`,
      body: `${className || "Class"} register for ${readableDate}.`,
      category: "attendance",
      priority: "high",
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
      entityType: "attendance",
      entityId: date,
    });
  } catch (err) {
    console.error("[hooks] attendance notify failed:", err);
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
      title: `New ${subject || "subject"} results available`,
      body: `${assessment || "Assessment"} marks for ${className || "your child's class"}${term ? ` · ${term}` : ""} have been published.`,
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
export async function notifyHomeworkPosted({
  schoolCode, className, subject, title, dueDate, homeworkId, actor,
}) {
  try {
    const students = (await loadStudents(schoolCode))
      .filter((s) => !className || s.className === className);
    if (students.length === 0) return;

    const due = dueDate
      ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : "";
    await notifyGuardians({
      students,
      schoolCode,
      title: `New homework: ${subject || "assignment"}`,
      body: `${title}${due ? ` — due ${due}` : ""}`,
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
    const money = (n) => `MK ${Number(n || 0).toLocaleString()}`;
    await notifyGuardians({
      students: [student],
      schoolCode,
      title: `Payment received — ${money(amount)}`,
      body: `${method || "Payment"} for ${student.fullName || "your child"}`
        + `${receiptNumber ? ` · Receipt ${receiptNumber}` : ""}`
        + `${balance !== undefined && balance !== null ? ` · Balance ${money(balance)}` : ""}`,
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
