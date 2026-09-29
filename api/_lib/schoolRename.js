// api/_lib/schoolRename.js
// ─────────────────────────────────────────────────────────────────────────────
// Renaming a class or a subject, everywhere it is written down.
// POST /api/staff/account?op=rename — it shares that function because the
// Hobby plan caps the deployment at 12 functions.
//
//   { kind: "class",   classId, to }   "Form 1A" → "Form 1 Blue"
//   { kind: "subject", from, to }      "Science" → "Integrated Science"
//
// A class or subject name is copied onto a lot of records — a learner's
// class, a timetable period, a mark sheet, a teacher's assignments — and most
// screens match on the name. Renaming only the class document would quietly
// split a class in two. So the rename runs here, on the Admin SDK: a mark
// sheet can otherwise be changed only by the teacher who entered it
// (firestore.rules), and loosening that for renames would let a head teacher
// edit anyone's marks.
//
// Admin or head teacher of the school only. A subject rename applies across
// the whole school — every section and class that offers it.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { requireStaff, readBody } from "./auth.js";
import { renameInList, renameSubjectInMarks } from "../../src/services/curriculumCore.js";

// Every collection that copies a class's name next to its id.
const CLASS_NAME_COPIES = [
  "students", "timetable", "ca_marks", "homework", "attendance", "lesson_plans",
  "lesson_sessions", "discipline_cases", "fee_structures", "fee_assignments",
];

const fail = (res, status, error) => res.status(status).json({ error });

/** Queues updates and commits them in Firestore-sized batches. */
function writer() {
  let batch = adminDb.batch();
  let pending = 0;
  let total = 0;
  const flushes = [];
  return {
    update(ref, data) {
      batch.update(ref, data);
      pending += 1;
      total += 1;
      if (pending >= 400) {
        flushes.push(batch.commit());
        batch = adminDb.batch();
        pending = 0;
      }
    },
    async done() {
      if (pending) flushes.push(batch.commit());
      await Promise.all(flushes);
      return total;
    },
  };
}

const clean = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

async function renameClass(res, schoolCode, body) {
  const to = clean(body.to);
  if (!to) return fail(res, 400, "Give the class a name.");
  if (to.length > 60) return fail(res, 400, "That name is too long.");

  const ref = adminDb.collection("school_classes").doc(String(body.classId || "_"));
  const snap = await ref.get();
  if (!snap.exists || snap.data().schoolCode !== schoolCode) return fail(res, 404, "Class not found.");
  const from = snap.data().name || "";
  if (from === to) return res.status(200).json({ ok: true, updated: 0 });

  const siblings = await adminDb.collection("school_classes").where("schoolCode", "==", schoolCode).get();
  if (siblings.docs.some((d) => d.id !== ref.id && clean(d.data().name).toLowerCase() === to.toLowerCase())) {
    return fail(res, 409, `There is already a class called ${to}.`);
  }

  const w = writer();
  w.update(ref, { name: to, updatedAt: FieldValue.serverTimestamp() });

  const seen = new Set();
  for (const col of CLASS_NAME_COPIES) {
    const byId = await adminDb.collection(col).where("schoolCode", "==", schoolCode).where("classId", "==", ref.id).get();
    byId.docs.forEach((d) => {
      seen.add(d.ref.path);
      if (d.data().className !== to) w.update(d.ref, { className: to });
    });
  }
  // Learners enrolled before classId was stored are matched by the old name.
  if (from) {
    const legacy = await adminDb.collection("students").where("schoolCode", "==", schoolCode).where("className", "==", from).get();
    legacy.docs.forEach((d) => {
      if (!seen.has(d.ref.path)) w.update(d.ref, { className: to, classId: ref.id });
    });
  }

  // Teachers' assignments are by name.
  const staff = await adminDb.collection("users").where("schoolCode", "==", schoolCode).get();
  staff.docs.forEach((d) => {
    const list = d.data().assignedClasses || [];
    if (list.includes(from)) w.update(d.ref, { assignedClasses: renameInList(list, from, to) });
  });

  const updated = await w.done();
  return res.status(200).json({ ok: true, from, to, updated });
}

async function renameSubject(res, schoolCode, body) {
  const from = clean(body.from);
  const to = clean(body.to);
  if (!from || !to) return fail(res, 400, "Give the subject a name.");
  if (to.length > 60) return fail(res, 400, "That name is too long.");
  if (from === to) return res.status(200).json({ ok: true, updated: 0 });

  const w = writer();

  // The sections' subject lists.
  const settingsRef = adminDb.collection("school_settings").doc(schoolCode);
  const settings = (await settingsRef.get()).data() || {};
  if (Array.isArray(settings.sections)) {
    const sections = settings.sections.map((s) => ({ ...s, subjects: renameInList(s.subjects || [], from, to) }));
    w.update(settingsRef, { sections, updatedAt: FieldValue.serverTimestamp() });
  }

  const classes = await adminDb.collection("school_classes").where("schoolCode", "==", schoolCode).get();
  classes.docs.forEach((d) => {
    const list = d.data().subjects || [];
    if (list.includes(from)) w.update(d.ref, { subjects: renameInList(list, from, to) });
  });

  const staff = await adminDb.collection("users").where("schoolCode", "==", schoolCode).get();
  staff.docs.forEach((d) => {
    const list = d.data().assignedSubjects || [];
    if (list.includes(from)) w.update(d.ref, { assignedSubjects: renameInList(list, from, to) });
  });

  for (const col of ["timetable", "homework", "lesson_plans", "lesson_sessions"]) {
    const snap = await adminDb.collection(col).where("schoolCode", "==", schoolCode).where("subject", "==", from).get();
    snap.docs.forEach((d) => w.update(d.ref, { subject: to }));
  }

  // Mark sheets: the subject list and every learner's score under it.
  const sheets = await adminDb.collection("ca_marks").where("schoolCode", "==", schoolCode).get();
  sheets.docs.forEach((d) => {
    const data = d.data();
    const { marks, changed } = renameSubjectInMarks(data.marks || {}, from, to);
    const listed = (data.subjects || []).includes(from);
    if (changed || listed) {
      w.update(d.ref, { marks, subjects: renameInList(data.subjects || [], from, to) });
    }
  });

  const updated = await w.done();
  return res.status(200).json({ ok: true, from, to, updated });
}

export async function handleRename(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  const caller = await requireStaff(req, { roles: ["admin", "head_teacher"] });
  if (!caller.ok) return fail(res, caller.status, caller.error);
  const schoolCode = caller.user.schoolCode;
  if (!schoolCode) return fail(res, 403, "Your account isn't attached to a school.");

  const body = readBody(req);
  if (!body) return fail(res, 400, "Bad request.");
  try {
    if (body.kind === "class") return await renameClass(res, schoolCode, body);
    if (body.kind === "subject") return await renameSubject(res, schoolCode, body);
    return fail(res, 400, "Unknown rename.");
  } catch (err) {
    console.error("[rename] failed:", err);
    return fail(res, 500, "The rename didn't finish. Please try again.");
  }
}
