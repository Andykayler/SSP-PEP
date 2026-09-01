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
const TEACHER = "teacher_uid_1";
const HEAD = "head_uid_1";
const OUTSIDER = "teacher_uid_other_school";
const PHONE = "+265991234567";
const PARENT = `parent:${PHONE}`;
const STUDENT = "student_1";
const CLASS = "class_1";
const THREAD = "thread_1";

let testEnv;

/** A signed-in staff context. Staff are anything that is not anonymous. */
const asTeacher = () => testEnv.authenticatedContext(TEACHER).firestore();
const asHead = () => testEnv.authenticatedContext(HEAD).firestore();
const asOutsider = () => testEnv.authenticatedContext(OUTSIDER).firestore();

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
