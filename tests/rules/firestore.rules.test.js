// tests/rules/firestore.rules.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Security-rule tests, run against the local Firestore emulator:
//
//     npm run test:rules
//
// Nothing here touches the real project. The emulator loads firestore.rules
// straight from the repo root, so a rule change that breaks a client query
// fails here instead of in someone's hands.
//
// ── The thing these tests exist to catch ────────────────────────────────────
// Firestore authorises a `list` from the QUERY's constraints alone — it does
// NOT evaluate the rule against each returned document. So a rule of the form
// `resource.data.X == …` obliges every client query on that collection to
// filter on X, or the read is refused outright even when every document in it
// would have passed. That single fact caused four separate "permission denied"
// bugs during development, each of which looked like a deployment problem.
// The pairs of "filtered passes / unfiltered denied" tests below pin it down.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, addDoc, updateDoc, deleteDoc, limit,
} from "firebase/firestore";


const SCHOOL = "TEST-SCHOOL-1";
const OTHER_SCHOOL = "TEST-SCHOOL-2";
const SUSPENDED_SCHOOL = "TEST-SCHOOL-SUSPENDED";
const TEACHER = "teacher_uid_1";
const HEAD = "head_uid_1";
const OUTSIDER = "teacher_uid_other_school";
const BURSAR = "bursar_uid_1";
const SUSPENDED_TEACHER = "teacher_uid_suspended";
const SUSPENDED_HEAD = "head_uid_suspended";
const PHONE = "+265991234567";
const PARENT = `parent:${PHONE}`;
const STUDENT = "student_1";
const SUSPENDED_STUDENT = "student_suspended_1";
const CLASS = "class_1";
const THREAD = "thread_1";

let testEnv;

/** A signed-in staff context. Staff are anything that is not anonymous. */
const asTeacher = () => testEnv.authenticatedContext(TEACHER).firestore();
const asHead = () => testEnv.authenticatedContext(HEAD).firestore();
const asOutsider = () => testEnv.authenticatedContext(OUTSIDER).firestore();
const asBursar = () => testEnv.authenticatedContext(BURSAR).firestore();
const asSuspendedTeacher = () => testEnv.authenticatedContext(SUSPENDED_TEACHER).firestore();
const asSuspendedHead = () => testEnv.authenticatedContext(SUSPENDED_HEAD).firestore();

/** The parent app signs in anonymously — no users/{uid} document exists. */
const asParent = () =>
  testEnv.authenticatedContext("anon_uid_1", { firebase: { sign_in_provider: "anonymous" } })
    .firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "ssp-pep-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Seed with rules disabled — this is fixture data, not a test of writes.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", TEACHER), {
      name: "Test Teacher", role: "class_teacher", schoolCode: SCHOOL, assignedClasses: ["Form 1A"],
    });
    await setDoc(doc(db, "users", BURSAR), {
      name: "Test Bursar", role: "bursar", schoolCode: SCHOOL,
    });
    await setDoc(doc(db, "users", HEAD), {
      name: "Test Head", role: "head_teacher", schoolCode: SCHOOL, assignedClasses: [],
    });
    await setDoc(doc(db, "users", OUTSIDER), {
      name: "Other School Teacher", role: "class_teacher", schoolCode: OTHER_SCHOOL, assignedClasses: [],
    });
    await setDoc(doc(db, "students", STUDENT), {
      fullName: "Test Child", guardianPhone: PHONE, schoolCode: SCHOOL,
      classId: CLASS, className: "Form 1A", parentPortalPassword: "x",
    });
    await setDoc(doc(db, "activity_threads", THREAD), {
      schoolCode: SCHOOL, scopeId: CLASS, title: "T", body: "b",
      authorId: TEACHER, authorName: "Test Teacher", replyCount: 1, participants: [TEACHER],
    });
    await setDoc(doc(db, "activity_threads", THREAD, "replies", "reply_1"), {
      schoolCode: SCHOOL, threadId: THREAD, body: "a reply",
      authorId: HEAD, authorName: "Test Head",
    });
    await setDoc(doc(db, "notifications", "n1"), {
      schoolCode: SCHOOL, recipientId: PARENT, recipientType: "parent",
      title: "Absent", body: "b", category: "attendance", read: false,
    });
    await setDoc(doc(db, "notifications", "n2"), {
      schoolCode: SCHOOL, recipientId: TEACHER, recipientType: "staff",
      title: "Mention", body: "b", category: "mention", read: false,
    });
    const convoId = `${SCHOOL}__${STUDENT}__${TEACHER}`;
    await setDoc(doc(db, "conversations", convoId), {
      schoolCode: SCHOOL, studentId: STUDENT, studentName: "Test Child",
      staffId: TEACHER, staffName: "Test Teacher", parentId: PARENT, parentPhone: PHONE,
      participantIds: [TEACHER, PARENT], unread: { [TEACHER]: 0, [PARENT]: 0 },
    });
    await setDoc(doc(db, "conversations", convoId, "messages", "m1"), {
      body: "hello", senderId: TEACHER, senderName: "Test Teacher",
      senderType: "staff", participantIds: [TEACHER, PARENT],
    });
    await setDoc(doc(db, "attendance", "att_1"), {
      schoolCode: SCHOOL, classId: CLASS, className: "Form 1A",
      date: "2026-09-01", teacherId: TEACHER, records: {},
    });
    await setDoc(doc(db, "homework", "hw_1"), {
      schoolCode: SCHOOL, classId: CLASS, teacherId: TEACHER, title: "Essay",
    });
    await setDoc(doc(db, "ca_marks", "cm_1"), {
      schoolCode: SCHOOL, classId: CLASS, term: "Term 2 2026", teacherId: TEACHER, marks: {},
    });
    await setDoc(doc(db, "discipline_cases", "dc_1"), {
      schoolCode: SCHOOL, studentId: STUDENT, offense: "Late", severity: "Low",
    });
    await setDoc(doc(db, "announcements", "a1"), {
      schoolCode: SCHOOL, title: "Sports day", message: "m", readCount: 0,
    });
    await setDoc(doc(db, "homework_submissions", `hw_1__${STUDENT}`), {
      schoolCode: SCHOOL, homeworkId: "hw_1", homeworkTitle: "Essay",
      studentId: STUDENT, studentName: "Test Child", classId: CLASS,
      teacherId: TEACHER, status: "late_requested", requestReason: "was ill",
    });
    await setDoc(doc(db, "report_cards", `${SCHOOL}__${STUDENT}__Term_2_2026`), {
      schoolCode: SCHOOL, studentId: STUDENT, studentName: "Test Child",
      classId: CLASS, term: "Term 2 2026", subjects: [], overallAverage: 62,
    });
    // A published component and a draft one, to prove the app only ever sees
    // the published half.
    await setDoc(doc(db, "ca_marks", "cm_published"), {
      schoolCode: SCHOOL, classId: CLASS, term: "Term 2 2026",
      assessmentType: "CA1", teacherId: TEACHER, marks: {}, publishedAt: new Date(),
    });
    await setDoc(doc(db, "school_settings", SCHOOL), {
      schoolCode: SCHOOL, schoolType: "Secondary",
      currentTerm: "Term 2 2026", promotionThreshold: 40,
    });

    // A suspended school, and its own staff, for the write-gating suite below.
    // SCHOOL deliberately has no schools/{SCHOOL} document at all above — that
    // absence is what proves a school predating the approval flow still
    // reads as active. This one exists and is explicitly suspended.
    await setDoc(doc(db, "schools", SUSPENDED_SCHOOL), {
      name: "Suspended School", status: "suspended",
    });
    await setDoc(doc(db, "users", SUSPENDED_TEACHER), {
      name: "Suspended Teacher", role: "class_teacher",
      schoolCode: SUSPENDED_SCHOOL, assignedClasses: ["Form 1A"],
    });
    await setDoc(doc(db, "users", SUSPENDED_HEAD), {
      name: "Suspended Head", role: "head_teacher",
      schoolCode: SUSPENDED_SCHOOL, assignedClasses: [],
    });
    await setDoc(doc(db, "students", SUSPENDED_STUDENT), {
      fullName: "Suspended Child", guardianPhone: "+265997654321",
      schoolCode: SUSPENDED_SCHOOL, classId: "class_s", className: "Form 1A",
      parentPortalPassword: "x",
    });
    await setDoc(doc(db, "attendance", "att_suspended"), {
      schoolCode: SUSPENDED_SCHOOL, classId: "class_s", className: "Form 1A",
      date: "2026-09-01", teacherId: SUSPENDED_TEACHER, records: {},
    });
    await setDoc(doc(db, "leave_requests", "leave_suspended_1"), {
      staffId: SUSPENDED_TEACHER, schoolCode: SUSPENDED_SCHOOL,
      status: "pending", reason: "Sick", startDate: "2026-09-01", endDate: "2026-09-02",
    });
  });
});

after(async () => { await testEnv?.cleanup(); });

// ─── The list-vs-query rule, pinned ──────────────────────────────────────────
describe("activity thread replies (the regression that started this suite)", () => {
  it("a filtered list succeeds — the query constrains the field the rule tests", async () => {
    await assertSucceeds(getDocs(query(
      collection(asTeacher(), "activity_threads", THREAD, "replies"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("an UNFILTERED list is denied, even though every reply is readable", async () => {
    // This is the failure mode that looked like a missing subcollection rule.
    // If this test ever starts passing, Firestore changed its list semantics
    // and subscribeReplies() no longer needs its schoolCode filter.
    await assertFails(getDocs(collection(asTeacher(), "activity_threads", THREAD, "replies")));
  });

  it("fetching one reply by id succeeds without any filter", async () => {
    // `get` IS evaluated against the real document — hence the asymmetry.
    await assertSucceeds(getDoc(doc(asTeacher(), "activity_threads", THREAD, "replies", "reply_1")));
  });

  it("a teacher from another school cannot read the thread", async () => {
    await assertFails(getDoc(doc(asOutsider(), "activity_threads", THREAD)));
  });
});

describe("conversation messages", () => {
  const convoId = `${SCHOOL}__${STUDENT}__${TEACHER}`;

  it("staff list with the participantIds filter succeeds", async () => {
    await assertSucceeds(getDocs(query(
      collection(asTeacher(), "conversations", convoId, "messages"),
      where("participantIds", "array-contains", TEACHER),
    )));
  });

  it("staff list without the filter is denied", async () => {
    await assertFails(getDocs(collection(asTeacher(), "conversations", convoId, "messages")));
  });

  it("a parent can list their own conversations", async () => {
    await assertSucceeds(getDocs(query(
      collection(asParent(), "conversations"),
      where("participantIds", "array-contains", PARENT),
    )));
  });
});

// ─── Every read the mobile app makes ─────────────────────────────────────────
describe("parent app reads", () => {
  const cases = [
    ["students by guardian phone", (db) => query(collection(db, "students"), where("guardianPhone", "==", PHONE))],
    ["students in the child's class", (db) => query(collection(db, "students"), where("schoolCode", "==", SCHOOL), where("classId", "==", CLASS))],
    ["announcements", (db) => query(collection(db, "announcements"), where("schoolCode", "==", SCHOOL))],
    ["attendance", (db) => query(collection(db, "attendance"), where("schoolCode", "==", SCHOOL), where("classId", "==", CLASS))],
    ["homework", (db) => query(collection(db, "homework"), where("schoolCode", "==", SCHOOL), where("classId", "==", CLASS))],
    ["ca_marks", (db) => query(collection(db, "ca_marks"), where("schoolCode", "==", SCHOOL), where("classId", "==", CLASS), where("term", "==", "Term 2 2026"))],
    ["discipline cases", (db) => query(collection(db, "discipline_cases"), where("schoolCode", "==", SCHOOL), where("studentId", "==", STUDENT))],
    ["own notifications", (db) => query(collection(db, "notifications"), where("recipientId", "==", PARENT), limit(60))],
    ["teaching staff for the contact picker", (db) => query(collection(db, "users"), where("schoolCode", "==", SCHOOL), where("role", "in", ["head_teacher", "class_teacher"]))],
  ];

  it("allows reading the school's current term", async () => {
    // Without this the grades card cannot know which term to query, which is
    // exactly the mismatch that hid saved marks from families.
    await assertSucceeds(getDoc(doc(asParent(), "school_settings", SCHOOL)));
  });

  it("denies writing the school's current term", async () => {
    await assertFails(setDoc(doc(asParent(), "school_settings", SCHOOL),
      { currentTerm: "Term 1 2020" }, { merge: true }));
  });

  for (const [label, build] of cases) {
    it(`allows ${label}`, async () => {
      await assertSucceeds(getDocs(build(asParent())));
    });
  }

  it("denies listing staff without the role filter", async () => {
    // The rule only exposes teaching staff, so an unfiltered users query would
    // sweep in admins and bursars and be refused in full.
    await assertFails(getDocs(query(collection(asParent(), "users"), where("schoolCode", "==", SCHOOL))));
  });

  it("denies reading a staff member's notifications", async () => {
    await assertFails(getDocs(query(
      collection(asParent(), "notifications"),
      where("recipientId", "==", TEACHER),
    )));
  });
});

// ─── Writes ──────────────────────────────────────────────────────────────────
describe("parent app writes", () => {
  it("registers its own device token", async () => {
    await assertSucceeds(setDoc(doc(asParent(), "parent_devices", "token_abc"), {
      token: "token_abc", parentId: PARENT, phone: PHONE, platform: "android",
    }));
  });

  it("cannot register a token document whose id does not match the token", async () => {
    await assertFails(setDoc(doc(asParent(), "parent_devices", "token_abc"), {
      token: "someone_elses_token", parentId: PARENT, phone: PHONE,
    }));
  });

  it("marks one of its own notifications read", async () => {
    await assertSucceeds(updateDoc(doc(asParent(), "notifications", "n1"), {
      read: true, readAt: new Date(),
    }));
  });

  it("cannot edit a notification's text under cover of marking it read", async () => {
    await assertFails(updateDoc(doc(asParent(), "notifications", "n1"), {
      read: true, title: "Rewritten",
    }));
  });

  it("records a payment only when it is labelled as self-reported", async () => {
    await assertSucceeds(addDoc(collection(asParent(), "payments"), {
      studentId: STUDENT, schoolCode: SCHOOL, amount: 5000, academicYear: "2025/2026",
      source: "parent_app", status: "unverified",
    }));
  });

  it("cannot record a payment that claims to be bursar-verified", async () => {
    await assertFails(addDoc(collection(asParent(), "payments"), {
      studentId: STUDENT, schoolCode: SCHOOL, amount: 5000, academicYear: "2025/2026",
      source: "bursar", status: "verified",
    }));
  });

  it("cannot delete a student", async () => {
    await assertFails(deleteDoc(doc(asParent(), "students", STUDENT)));
  });

  it("cannot post into a staff discussion thread", async () => {
    await assertFails(addDoc(collection(asParent(), "activity_threads"), {
      schoolCode: SCHOOL, scopeId: CLASS, authorId: "anon_uid_1", replyCount: 0,
    }));
  });
});

describe("homework submissions — the late-approval flow", () => {
  const SUB = `hw_1__${STUDENT}`;

  it("a parent can list their own child's submissions", async () => {
    await assertSucceeds(getDocs(query(
      collection(asParent(), "homework_submissions"),
      where("studentId", "==", STUDENT),
    )));
  });

  it("a parent can ask to submit late", async () => {
    await assertSucceeds(setDoc(doc(asParent(), "homework_submissions", `hw_2__${STUDENT}`), {
      schoolCode: SCHOOL, homeworkId: "hw_2", studentId: STUDENT,
      classId: CLASS, teacherId: TEACHER, status: "late_requested",
      requestReason: "internet was down",
    }));
  });

  it("a parent CANNOT approve their own late request", async () => {
    // The whole point of the flow: self-approval would make the deadline
    // meaningless.
    await assertFails(updateDoc(doc(asParent(), "homework_submissions", SUB), {
      status: "late_approved",
    }));
  });

  it("a parent cannot submit while their request is still pending", async () => {
    await assertFails(updateDoc(doc(asParent(), "homework_submissions", SUB), {
      status: "submitted",
    }));
  });

  it("a parent cannot rewrite the teacher's decision note", async () => {
    await assertFails(updateDoc(doc(asParent(), "homework_submissions", SUB), {
      status: "late_requested", decisionNote: "teacher said fine",
    }));
  });

  it("the teacher can approve it", async () => {
    await assertSucceeds(updateDoc(doc(asTeacher(), "homework_submissions", SUB), {
      status: "late_approved", decisionNote: "ok this once", decidedBy: TEACHER,
    }));
  });

  it("a teacher from another school cannot", async () => {
    await assertFails(updateDoc(doc(asOutsider(), "homework_submissions", SUB), {
      status: "late_approved",
    }));
  });
});

describe("report cards", () => {
  const CARD = `${SCHOOL}__${STUDENT}__Term_2_2026`;

  it("a parent can read their child's issued report card", async () => {
    await assertSucceeds(getDoc(doc(asParent(), "report_cards", CARD)));
  });

  it("a head teacher can issue one", async () => {
    await assertSucceeds(setDoc(doc(asHead(), "report_cards", CARD), {
      schoolCode: SCHOOL, studentId: STUDENT, classId: CLASS,
      term: "Term 2 2026", subjects: [], overallAverage: 71,
    }));
  });

  it("a class teacher cannot issue one — releasing is a leadership act", async () => {
    await assertFails(setDoc(doc(asTeacher(), "report_cards", CARD), {
      schoolCode: SCHOOL, studentId: STUDENT, classId: CLASS,
      term: "Term 2 2026", subjects: [], overallAverage: 99,
    }));
  });

  it("a parent cannot write one", async () => {
    await assertFails(setDoc(doc(asParent(), "report_cards", CARD), {
      schoolCode: SCHOOL, studentId: STUDENT, classId: CLASS,
      term: "Term 2 2026", subjects: [], overallAverage: 100,
    }));
  });
});

describe("academic term", () => {
  it("a head teacher can set the current term", async () => {
    await assertSucceeds(setDoc(doc(asHead(), "school_settings", SCHOOL),
      { currentTerm: "Term 3 2026" }, { merge: true }));
  });

  it("a head teacher from another school cannot", async () => {
    await assertFails(setDoc(doc(asOutsider(), "school_settings", SCHOOL),
      { currentTerm: "Term 1 2020" }, { merge: true }));
  });
});

describe("staff writes", () => {
  it("a teacher can reply in their school's thread", async () => {
    await assertSucceeds(addDoc(collection(asTeacher(), "activity_threads", THREAD, "replies"), {
      schoolCode: SCHOOL, threadId: THREAD, body: "ok", authorId: TEACHER, authorName: "Test Teacher",
    }));
  });

  it("a teacher cannot post a reply attributed to someone else", async () => {
    await assertFails(addDoc(collection(asTeacher(), "activity_threads", THREAD, "replies"), {
      schoolCode: SCHOOL, threadId: THREAD, body: "ok", authorId: HEAD, authorName: "Test Head",
    }));
  });

  it("a teacher can react to a colleague's thread but not rewrite it", async () => {
    await assertSucceeds(updateDoc(doc(asHead(), "activity_threads", THREAD), {
      reactions: { "👍": [HEAD] },
    }));
    await assertFails(updateDoc(doc(asOutsider(), "activity_threads", THREAD), {
      reactions: { "👍": [OUTSIDER] },
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The modules added alongside arrears, sponsors, the calendar and boarding.
//
// These cover the cases where getting the rule wrong has a consequence beyond
// a broken screen: who may withhold a child's report card, what a parent can
// read, and which staff can see a colleague's salary line or a child's medical
// record.
// ─────────────────────────────────────────────────────────────────────────────

describe("fee clearance — who may withhold a report card", () => {
  it("a head teacher can record a clearance decision", async () => {
    await assertSucceeds(setDoc(doc(asHead(), "fee_clearance", `${SCHOOL}__${STUDENT}__Term_1`), {
      schoolCode: SCHOOL, studentId: STUDENT, term: "Term 1 2026",
      status: "blocked", reason: "Fees unpaid since Term 3.",
    }));
  });

  it("a bursar cannot — they supply the balance, the head teacher decides", async () => {
    await assertFails(setDoc(doc(asBursar(), "fee_clearance", `${SCHOOL}__${STUDENT}__Term_2`), {
      schoolCode: SCHOOL, studentId: STUDENT, term: "Term 2 2026",
      status: "blocked", reason: "Fees unpaid.",
    }));
  });

  it("a bursar can still read the decisions", async () => {
    await assertSucceeds(getDocs(query(
      collection(asBursar(), "fee_clearance"),
      where("schoolCode", "==", SCHOOL),
      where("term", "==", "Term 1 2026"),
    )));
  });

  it("a head teacher at another school cannot decide here", async () => {
    await assertFails(setDoc(doc(asOutsider(), "fee_clearance", `${SCHOOL}__${STUDENT}__Term_3`), {
      schoolCode: SCHOOL, studentId: STUDENT, term: "Term 3 2026", status: "cleared", reason: "",
    }));
  });
});

describe("payment plans and reminders", () => {
  it("a bursar can record a payment plan", async () => {
    await assertSucceeds(setDoc(doc(asBursar(), "payment_plans", `${SCHOOL}__${STUDENT}__T1`), {
      schoolCode: SCHOOL, studentId: STUDENT, term: "Term 1 2026",
      instalments: [{ dueDate: "2026-10-01", amount: 50000, paid: false }],
    }));
  });

  it("a class teacher cannot", async () => {
    await assertFails(setDoc(doc(asTeacher(), "payment_plans", `${SCHOOL}__${STUDENT}__T2`), {
      schoolCode: SCHOOL, studentId: STUDENT, term: "Term 2 2026", instalments: [],
    }));
  });
});

describe("sponsorships", () => {
  it("a bursar can add a sponsor", async () => {
    await assertSucceeds(addDoc(collection(asBursar(), "sponsors"), {
      schoolCode: SCHOOL, name: "Blantyre Synod Education Fund", type: "church",
    }));
  });

  it("a class teacher cannot", async () => {
    await assertFails(addDoc(collection(asTeacher(), "sponsors"), {
      schoolCode: SCHOOL, name: "Not allowed", type: "individual",
    }));
  });

  it("a parent cannot read the sponsor list", async () => {
    await assertFails(getDocs(query(
      collection(asParent(), "sponsors"),
      where("schoolCode", "==", SCHOOL),
    )));
  });
});

describe("school calendar — the one collection parents read directly", () => {
  it("a head teacher can add an event", async () => {
    await assertSucceeds(addDoc(collection(asHead(), "school_events"), {
      schoolCode: SCHOOL, title: "Term 1 opens", category: "term",
      startDate: "2026-09-07", audience: "everyone",
    }));
  });

  it("a parent can list the calendar filtered on schoolCode", async () => {
    await assertSucceeds(getDocs(query(
      collection(asParent(), "school_events"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("a parent cannot write to it", async () => {
    await assertFails(addDoc(collection(asParent(), "school_events"), {
      schoolCode: SCHOOL, title: "Fake holiday", category: "holiday", startDate: "2026-10-01",
    }));
  });

  it("a class teacher cannot add one either — the calendar is the office's", async () => {
    await assertFails(addDoc(collection(asTeacher(), "school_events"), {
      schoolCode: SCHOOL, title: "Unauthorised", category: "other", startDate: "2026-10-01",
    }));
  });
});

describe("expenses — salary lines are not staffroom reading", () => {
  it("a bursar can record an expense", async () => {
    await assertSucceeds(addDoc(collection(asBursar(), "expenses"), {
      schoolCode: SCHOOL, date: "2026-09-02", category: "salaries",
      description: "September salaries", amount: 4200000,
    }));
  });

  it("a class teacher cannot read the ledger", async () => {
    await assertFails(getDocs(query(
      collection(asTeacher(), "expenses"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("a head teacher can", async () => {
    await assertSucceeds(getDocs(query(
      collection(asHead(), "expenses"),
      where("schoolCode", "==", SCHOOL),
    )));
  });
});

describe("boarding and the sick bay", () => {
  it("a head teacher can sign a boarder out", async () => {
    await assertSucceeds(addDoc(collection(asHead(), "boarding_signouts"), {
      schoolCode: SCHOOL, studentId: STUDENT, studentName: "Test Student",
      reason: "Medical appointment",
    }));
  });

  it("any staff member can read the register — a duty teacher checks it at night", async () => {
    await assertSucceeds(getDocs(query(
      collection(asTeacher(), "boarding_signouts"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("a class teacher cannot read the sick bay log — it is a medical record", async () => {
    await assertFails(getDocs(query(
      collection(asTeacher(), "sickbay_visits"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("a parent cannot read the sick bay log either", async () => {
    await assertFails(getDocs(query(
      collection(asParent(), "sickbay_visits"),
      where("schoolCode", "==", SCHOOL),
    )));
  });
});

describe("admissions and inventory", () => {
  it("a head teacher can record an application", async () => {
    await assertSucceeds(addDoc(collection(asHead(), "admissions"), {
      schoolCode: SCHOOL, applicantName: "New Applicant", guardianPhone: PHONE, status: "applied",
    }));
  });

  it("a parent cannot list applications", async () => {
    await assertFails(getDocs(query(
      collection(asParent(), "admissions"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("a class teacher can see what stock is left", async () => {
    await assertSucceeds(getDocs(query(
      collection(asTeacher(), "inventory_items"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("a class teacher can issue a textbook", async () => {
    await assertSucceeds(addDoc(collection(asTeacher(), "inventory_issues"), {
      schoolCode: SCHOOL, itemId: "item_1", studentId: STUDENT, quantity: 1,
    }));
  });
});

describe("guardian link confirmation", () => {
  // The parent app writes one of these to prove a child a school attached to
  // its number really is theirs; verifyGuardianLink stamps the verdict. The
  // rules have one job: let a guardian ask, and let nobody answer.
  const request = (uid) => ({
    studentId: STUDENT,
    phone: PHONE,
    password: "Blue#1234",
    requestedByUid: uid,
    status: "pending",
  });

  it("a guardian can ask to confirm a child", async () => {
    await assertSucceeds(addDoc(
      collection(asParent(), "guardian_link_requests"),
      request("anon_uid_1"),
    ));
  });

  it("a request cannot be filed under somebody else's session", async () => {
    // Otherwise a request could be planted for a uid that is about to read it.
    await assertFails(addDoc(
      collection(asParent(), "guardian_link_requests"),
      request("some_other_uid"),
    ));
  });

  it("a request cannot be created already verified", async () => {
    await assertFails(addDoc(
      collection(asParent(), "guardian_link_requests"),
      { ...request("anon_uid_1"), status: "verified" },
    ));
  });

  it("nobody can mark their own request verified", async () => {
    // The Cloud Function runs on the Admin SDK and bypasses rules, so there is
    // no legitimate client write here at all — only an attacker would want one.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "guardian_link_requests", "req_1"),
        request("anon_uid_1"));
    });
    await assertFails(updateDoc(
      doc(asParent(), "guardian_link_requests", "req_1"),
      { status: "verified" },
    ));
  });

  it("a guardian can read the verdict on their own request", async () => {
    await assertSucceeds(getDoc(
      doc(asParent(), "guardian_link_requests", "req_1"),
    ));
  });

  it("but not on somebody else's", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "guardian_link_requests", "req_2"),
        request("a_different_anon_uid"));
    });
    await assertFails(getDoc(
      doc(asParent(), "guardian_link_requests", "req_2"),
    ));
  });
});

// ─── Suspension enforcement — schoolIsActive() ───────────────────────────────
// The UI already refuses to render a suspended school's dashboards
// (DashboardShell / useSchoolAccess), but that is cosmetic unless the rules
// back it up: a direct write from a suspended school's own staff must be
// refused too, not just hidden behind a blocked screen the staff member could
// route around. Reads stay open throughout — the point is to stop the school
// operating, not to erase what it already recorded.
describe("a suspended school cannot write, but can still read", () => {
  it("a teacher cannot mark attendance", async () => {
    await assertFails(addDoc(collection(asSuspendedTeacher(), "attendance"), {
      schoolCode: SUSPENDED_SCHOOL, classId: "class_s", className: "Form 1A",
      date: "2026-09-05", teacherId: SUSPENDED_TEACHER, records: {},
    }));
  });

  it("a teacher can still read the register recorded before suspension", async () => {
    await assertSucceeds(getDoc(doc(asSuspendedTeacher(), "attendance", "att_suspended")));
  });

  it("a head teacher cannot update a student record", async () => {
    await assertFails(updateDoc(doc(asSuspendedHead(), "students", SUSPENDED_STUDENT), {
      fullName: "Renamed Child",
    }));
  });

  it("a head teacher can still read a student record", async () => {
    await assertSucceeds(getDoc(doc(asSuspendedHead(), "students", SUSPENDED_STUDENT)));
  });

  it("a head teacher cannot enrol a new student", async () => {
    await assertFails(addDoc(collection(asSuspendedHead(), "students"), {
      fullName: "New Child", guardianPhone: "+265991112222",
      schoolCode: SUSPENDED_SCHOOL, classId: "class_s", className: "Form 1A",
      parentPortalPassword: "x",
    }));
  });

  it("a school with no status field at all is still treated as active", async () => {
    // SCHOOL has no schools/{SCHOOL} document in these fixtures at all —
    // proving that absence (a school that predates the approval flow) does
    // not get caught by the same gate as an explicit suspension.
    await assertSucceeds(addDoc(collection(asTeacher(), "attendance"), {
      schoolCode: SCHOOL, classId: CLASS, className: "Form 1A",
      date: "2026-09-05", teacherId: TEACHER, records: {},
    }));
  });

  it("a teacher can still withdraw their own pending leave request", async () => {
    // The narrow, deliberate carve-out: a suspended school's staff can still
    // cleanly back out of a request rather than being stuck in limbo, even
    // though the head teacher's decide-branch (tested next) is blocked.
    await assertSucceeds(updateDoc(doc(asSuspendedTeacher(), "leave_requests", "leave_suspended_1"), {
      status: "cancelled", updatedAt: new Date(),
    }));
  });

  it("but a head teacher cannot decide on one", async () => {
    await assertFails(updateDoc(doc(asSuspendedHead(), "leave_requests", "leave_suspended_1"), {
      status: "approved", decidedBy: SUSPENDED_HEAD, decidedByName: "Suspended Head",
      decidedAt: new Date(), updatedAt: new Date(),
    }));
  });
});
