// demo/seed/seed.js
// Creates (or refreshes) the fictional demo tenant end to end: school, staff
// accounts, one class, a full roster, a completed term's marks/attendance,
// a timetable slot clockable today, a geofence, and one fee line. Everything
// is scoped to env.schoolCode — nothing here ever touches another tenant.
//
// Safe to re-run: every doc id is deterministic (or looked up by email/id
// first), so `npm run seed` refreshes the same tenant rather than duplicating
// it.
import { db, auth } from "./admin.js";
import { env } from "../lib/env.js";
import { assertGuardianAccountSafe } from "../lib/preflight.js";
import { SUBJECTS, ASSESSMENT_TYPES, buildRoster, marksForStudent } from "./roster.js";
import { FieldValue } from "firebase-admin/firestore";

const { schoolCode, schoolName } = env;
const CLASS_ID = `${schoolCode}_form3A`;
const CLASS_NAME = env.learnerClass; // "Form 3A"

async function upsertAuthUser({ email, password, displayName }) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, displayName, disabled: false });
    return existing.uid;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({ email, password, displayName, emailVerified: true });
    return created.uid;
  }
}

async function seedStaff() {
  const staff = [
    { key: "admin", role: "admin", name: "Grace Mvula", ...env.admin },
    { key: "headteacher", role: "head_teacher", name: "Foster Chirwa", ...env.headteacher },
    { key: "teacher", role: "class_teacher", name: "Beatrice Kumwenda", ...env.teacher },
    { key: "bursar", role: "bursar", name: "Innocent Sakala", ...env.bursar },
  ];

  const uids = {};
  for (const s of staff) {
    const uid = await upsertAuthUser({ email: s.email, password: s.password, displayName: s.name });
    uids[s.key] = uid;
    await db.collection("users").doc(uid).set({
      uid, name: s.name, email: s.email, role: s.role, schoolCode,
      phone: "", allCampuses: true, campusIds: [],
      status: "active", mustChangePassword: false,
      assignedClasses: s.role === "class_teacher" ? [CLASS_NAME] : [],
      // Read by ClassModule.jsx ("My Classes" -> lesson planning) to populate
      // the Subject dropdown — without this the AI-draft button has nothing
      // to generate against.
      assignedSubjects: s.role === "class_teacher" ? SUBJECTS : [],
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`  staff: ${s.role.padEnd(13)} ${s.email}  (${uid})`);
  }
  return uids;
}

async function seedSchool() {
  await db.collection("schools").doc(schoolCode).set({
    name: schoolName, code: schoolCode,
    district: "Lilongwe", address: "Area 25, Lilongwe", phone: "+265991000000",
    email: env.admin.email, subscription_status: "trial", status: "active",
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("school_settings").doc(schoolCode).set({
    schoolCode,
    currentTerm: env.currentTerm,
    academicYear: "2025/2026",
    schoolType: "Secondary",
    promotionThreshold: 40,
    enabledModules: ["sms", "ai_insights"],
    smsFallbackCategories: ["report", "fees", "discipline", "attendance", "announcement", "homework"],
    multiCampus: false,
    setupCompletedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("school_classes").doc(CLASS_ID).set({
    schoolCode, name: CLASS_NAME, formLevel: 3, stream: "A",
    order: 32, level: "Secondary", subjects: SUBJECTS, capacity: 45,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("school_geofences").doc(schoolCode).set({
    schoolCode, ...env.geofence, updatedAt: FieldValue.serverTimestamp(), updatedBy: "seed-script",
  }, { merge: true });

  console.log(`  school: ${schoolName} (${schoolCode}), class ${CLASS_NAME}`);
}

async function seedStudentsAndMarks(teacherUid) {
  const roster = buildRoster();
  const batchWrites = [];

  const marksByAssessment = { CA1: {}, CA2: {}, MidTerm: {}, EndTerm: {} };

  for (const s of roster) {
    const docId = `${schoolCode}-${s.id}`;
    batchWrites.push(db.collection("students").doc(docId).set({
      studentCode: docId, firstName: s.firstName, lastName: s.lastName, fullName: s.fullName,
      gender: s.gender, dob: "2010-03-15", nationalId: "",
      guardianName: s.guardianName, guardianPhone: s.guardianPhone, guardianEmail: "",
      guardianRelation: "Parent/Guardian", district: "Lilongwe", village: "",
      classId: CLASS_ID, className: CLASS_NAME, campusId: "", campusName: "",
      schoolCode, schoolName, status: "active",
      parentPortalPassword: s.parentPortalPassword || "changeme123",
      guardianLinkStatus: "active",
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));

    const marks = marksForStudent(s); // { subject: [CA1, CA2, MidTerm, EndTerm] }
    ASSESSMENT_TYPES.forEach((a, i) => {
      marksByAssessment[a.id][docId] = {};
      SUBJECTS.forEach((subject) => { marksByAssessment[a.id][docId][subject] = marks[subject][i]; });
    });
  }
  await Promise.all(batchWrites);
  console.log(`  students: ${roster.length} in ${CLASS_NAME}`);

  for (const a of ASSESSMENT_TYPES) {
    const docId = `${schoolCode}_${CLASS_ID}_${env.currentTerm.replace(/\s+/g, "_")}_${teacherUid}_${a.id}`;
    await db.collection("ca_marks").doc(docId).set({
      schoolCode, classId: CLASS_ID, className: CLASS_NAME, term: env.currentTerm,
      assessmentType: a.id, teacherId: teacherUid, subjects: SUBJECTS,
      marks: marksByAssessment[a.id], updatedAt: FieldValue.serverTimestamp(),
      // Required for the parent app to show these marks at all — see
      // ResultsService._fetchPublishedSubjects, which skips any ca_marks doc
      // without this field. Normally set by the teacher's "Publish results"
      // button (PerformanceModule.jsx); set directly here since the seed
      // script is standing in for that workflow step.
      publishedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`  marks: ${ASSESSMENT_TYPES.map((a) => a.id).join(", ")} written for ${env.currentTerm}`);

  return roster;
}

/** Sampled school days across the (past) current term, weighted heavily to
 * present, so attendance is realistic without writing ~85 daily documents. */
function sampleTermDates() {
  const dates = [];
  const start = new Date("2026-01-12"); // first Monday of Term 2
  for (let w = 0; w < 14; w++) {
    for (const dow of [1, 3, 5]) { // Mon/Wed/Fri sample of each week
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7 + (dow - 1));
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

async function seedAttendanceAndDiscipline(roster) {
  const dates = sampleTermDates();
  let i = 0;
  for (const date of dates) {
    const records = {};
    roster.forEach((s) => {
      const docId = `${schoolCode}-${s.id}`;
      // The named learner: one absence, one late, otherwise present — good
      // attendance, not perfect, so the AI insight has something true to say.
      let status = "Present";
      if (s.id === "S000") {
        if (i === 4) status = "Absent";
        else if (i === 9) status = "Late";
      } else if (Math.random() < 0.06) {
        status = "Absent";
      } else if (Math.random() < 0.04) {
        status = "Late";
      }
      // { status, time, remark } — the shape AttendanceModule.jsx actually
      // writes today. (A bare status-string shape exists in older real data;
      // both parent-app readers were fixed to tolerate it, but new records
      // should match what the teacher UI produces.)
      records[docId] = { status, time: status === "Late" ? "07:45" : "07:30", remark: "" };
    });
    await db.collection("attendance").doc(`${schoolCode}_${CLASS_ID}_${date}`).set({
      schoolCode, classId: CLASS_ID, className: CLASS_NAME, date, records,
      takenAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    i++;
  }
  console.log(`  attendance: ${dates.length} days seeded across ${env.currentTerm}`);

  // One minor case for a different student — keeps the named learner's record
  // clean ("no incidents"), which is itself part of a plausible AI insight.
  const other = roster.find((s) => s.id !== "S000");
  await db.collection("discipline_cases").doc(`${schoolCode}-DISC-01`).set({
    schoolCode, studentId: `${schoolCode}-${other.id}`, date: "2026-03-10",
    severity: "Low", offense: "Late submission of homework",
    recordedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function seedPriorReportCard() {
  const term = env.priorTerm;
  const docId = `${schoolCode}__${schoolCode}-S000__${term.replace(/\s+/g, "_")}`;
  await db.collection("report_cards").doc(docId).set({
    schoolCode, studentId: `${schoolCode}-S000`, studentName: env.learnerName,
    studentCode: `${schoolCode}-S000`, classId: CLASS_ID, className: CLASS_NAME,
    term, academicYear: "2025/2026",
    subjects: [
      { subject: "English", score: 58 }, { subject: "Mathematics", score: 39 },
      { subject: "Biology", score: 68 }, { subject: "Chemistry", score: 54 },
      { subject: "Agriculture", score: 60 }, { subject: "Life Skills", score: 63 },
    ],
    overallAverage: 50, position: 15, classSize: 28,
    generatedAt: FieldValue.serverTimestamp(), generatedBy: "seed-script",
  }, { merge: true });
  console.log(`  history: prior report card seeded for ${env.learnerName} (${term})`);
}

const PERIODS = [
  { number: 1, start: "07:30", end: "08:20" },
  { number: 2, start: "08:30", end: "09:20" },
  { number: 3, start: "09:30", end: "10:20" },
  { number: 4, start: "10:30", end: "11:20" },
  { number: 5, start: "11:30", end: "12:20" },
  { number: 6, start: "13:00", end: "13:50" },
  { number: 7, start: "14:00", end: "14:50" },
  { number: 8, start: "15:00", end: "15:50" },
];

/** The period bracketing (or nearest-upcoming to) right now, so a same-day
 * clock-in reads as "on time", not "+7 hours late" — Class Monitor computes
 * lateness from wall-clock time vs. the timetable's scheduledStart, and that
 * has to actually match when you sit down to record. */
function currentOrNextPeriod() {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const current = PERIODS.find((p) => nowMin >= toMin(p.start) && nowMin <= toMin(p.end));
  if (current) return current;
  const upcoming = PERIODS.find((p) => toMin(p.start) > nowMin);
  return upcoming || PERIODS[PERIODS.length - 1];
}

/** One lesson, today, for the seeded teacher — scene 04's clock-in. A light
 * weekly spread besides that so the timetable doesn't look suspiciously bare.
 *
 * Bug found recording CostWorth's vertical reshoot (v04): doc ids are
 * `${day}_${p.number}`, and `todaysPeriod` depends on the wall-clock time
 * `npm run seed` happens to run at — so re-seeding at a different time of day
 * than a previous run wrote a *second* period doc for today instead of
 * replacing the first (Firestore has no idea the old one is stale). The
 * scene's `.first()` "Clock In" button then grabbed whichever sorted first,
 * clocking into a leftover 08:30 slot at the real (10:30) time — exactly the
 * "+N late" mismatch `currentOrNextPeriod()`'s own comment says this is
 * supposed to prevent. Fixed by clearing this class's whole timetable before
 * writing the fresh one, every run, so at most one doc per day ever exists. */
async function seedTimetable(teacherUid) {
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = DAY_NAMES[new Date().getDay()];
  const isWeekend = today === "Saturday" || today === "Sunday";
  const days = isWeekend
    ? ["Monday", "Tuesday", "Wednesday"] // still gives a populated timetable; clock-in is re-run on a weekday
    : [today, ...DAY_NAMES.filter((d) => d !== today && !["Saturday", "Sunday"].includes(d)).slice(0, 2)];

  const existing = await db.collection("timetable").where("classId", "==", CLASS_ID).get();
  if (!existing.empty) {
    await Promise.all(existing.docs.map((d) => d.ref.delete()));
    console.log(`  timetable: cleared ${existing.size} existing period(s) before reseeding`);
  }

  const todaysPeriod = currentOrNextPeriod();
  for (const day of days) {
    const p = day === today ? todaysPeriod : PERIODS[days.indexOf(day) % 3];
    const docId = `${schoolCode}_${CLASS_ID}_${day}_${p.number}`;
    await db.collection("timetable").doc(docId).set({
      schoolCode, classId: CLASS_ID, className: CLASS_NAME,
      day, periodNumber: p.number, startTime: p.start, endTime: p.end,
      subject: "Mathematics", teacherId: teacherUid, teacherName: "Beatrice Kumwenda",
      venue: "Room 3A", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  if (isWeekend) {
    console.log(`  timetable: seeded for Mon-Wed — today is ${today}; record scene 04 on a weekday, ` +
      `or re-run seed right before recording.`);
  } else {
    console.log(`  timetable: ${today} P${todaysPeriod.number} (${todaysPeriod.start}-${todaysPeriod.end}) ` +
      `is clockable today — re-run \`npm run seed\` shortly before recording so this stays close to "now".`);
  }
}

async function seedFees(roster) {
  // Deterministic ids: fee_structures/fee_assignments were previously
  // .add()-ed, so every re-run of `npm run seed` created ANOTHER 85,000
  // assignment on top of the last (a real bug this script had — five re-seeds
  // meant a 425,000 "outstanding balance" and a payment report for the sum).
  const structId = `${schoolCode}-fee-form3a-tuition`;
  await db.collection("fee_structures").doc(structId).set({
    name: `${CLASS_NAME} Tuition`, classId: CLASS_ID, className: CLASS_NAME,
    category: "Tuition", amount: 85000, term: "Term 2", academicYear: "2025/2026",
    description: "Termly tuition fee", mandatory: true,
    schoolCode, schoolName, createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const learner = roster.find((s) => s.id === "S000");
  await db.collection("fee_assignments").doc(`${schoolCode}-feeassign-S000`).set({
    studentId: `${schoolCode}-S000`, studentName: learner.fullName, studentCode: `${schoolCode}-S000`,
    classId: CLASS_ID, className: CLASS_NAME,
    feeStructureId: structId, feeName: `${CLASS_NAME} Tuition`, category: "Tuition",
    amount: 85000, term: "Term 2", academicYear: "2025/2026", schoolCode,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`  fees: MWK 85,000 Term 2 tuition assigned to ${learner.fullName} (unpaid — scene 06 pays it)`);
}

async function main() {
  assertGuardianAccountSafe();
  console.log(`Seeding demo tenant "${schoolCode}" (${schoolName})…\n`);
  const uids = await seedStaff();
  await seedSchool();
  const roster = await seedStudentsAndMarks(uids.teacher);
  await seedAttendanceAndDiscipline(roster);
  await seedPriorReportCard();
  await seedTimetable(uids.teacher);
  await seedFees(roster);

  console.log(`\nDone. Sign in at ${env.baseUrl}/signin with the accounts in demo/.env.`);
  console.log(`Named learner for scenes 02-06: ${env.learnerName} (${CLASS_NAME}).`);
}

main().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
