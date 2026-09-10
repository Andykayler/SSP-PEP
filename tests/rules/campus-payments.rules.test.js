// tests/rules/campus-payments.rules.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Security-rule tests for the two features that introduce a new kind of
// authority into the product:
//
//   • CAMPUSES — a school with several sites, where a student's record must not
//     cross between them without someone signing for it.
//
//   • GATEWAY PAYMENTS — where the answer to "was this paid?" comes from
//     PayChangu over a server-to-server call, never from a browser.
//
// Kept in its own file rather than appended to firestore.rules.test.js because
// it needs a director and an administrator in the fixture set, and the node
// test runner gives each file its own process. It uses its own projectId so
// the two suites cannot see each other's seed data through the shared
// emulator.
//
// Run with the rest: npm run test:rules
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, addDoc, updateDoc, deleteDoc,
} from "firebase/firestore";

const SCHOOL = "CAMPUS-SCHOOL-1";
const OTHER_SCHOOL = "CAMPUS-SCHOOL-2";

const ADMIN = "admin_uid";
const DIRECTOR = "director_uid";
const HEAD = "head_uid";
const TEACHER = "teacher_uid";
const BURSAR = "bursar_uid";
const OUTSIDER = "outsider_uid";

const CAMPUS_A = "campus_main";
const CAMPUS_B = "campus_second";
const STUDENT = "student_1";

let testEnv;

const as = (uid) => testEnv.authenticatedContext(uid).firestore();
const asAdmin = () => as(ADMIN);
const asDirector = () => as(DIRECTOR);
const asHead = () => as(HEAD);
const asTeacher = () => as(TEACHER);
const asBursar = () => as(BURSAR);
const asOutsider = () => as(OUTSIDER);

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "ssp-pep-campus-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Seeded with rules disabled — this is fixture data, not a test of writes.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "users", ADMIN), {
      name: "Admin", role: "admin", schoolCode: SCHOOL,
      allCampuses: true, campusIds: [], assignedClasses: [],
    });
    await setDoc(doc(db, "users", DIRECTOR), {
      name: "Director", role: "director", schoolCode: SCHOOL,
      allCampuses: true, campusIds: [], assignedClasses: [],
    });
    await setDoc(doc(db, "users", HEAD), {
      name: "Head", role: "head_teacher", schoolCode: SCHOOL,
      allCampuses: false, campusIds: [CAMPUS_A], assignedClasses: [],
    });
    await setDoc(doc(db, "users", TEACHER), {
      name: "Teacher", role: "class_teacher", schoolCode: SCHOOL,
      allCampuses: false, campusIds: [CAMPUS_A], assignedClasses: [],
    });
    await setDoc(doc(db, "users", BURSAR), {
      name: "Bursar", role: "bursar", schoolCode: SCHOOL,
      allCampuses: true, campusIds: [], assignedClasses: [],
    });
    await setDoc(doc(db, "users", OUTSIDER), {
      name: "Other School Head", role: "head_teacher", schoolCode: OTHER_SCHOOL,
      assignedClasses: [],
    });

    await setDoc(doc(db, "campuses", CAMPUS_A), {
      schoolCode: SCHOOL, name: "Main Campus", code: `${SCHOOL}-MC`,
      isPrimary: true, status: "active",
    });
    await setDoc(doc(db, "campuses", CAMPUS_B), {
      schoolCode: SCHOOL, name: "Second Campus", code: `${SCHOOL}-SC`,
      isPrimary: false, status: "active",
    });

    await setDoc(doc(db, "students", STUDENT), {
      fullName: "Test Child", guardianPhone: "+265991234567", schoolCode: SCHOOL,
      classId: "class_1", className: "Form 1A", campusId: CAMPUS_A,
      campusName: "Main Campus", parentPortalPassword: "x",
    });

    await setDoc(doc(db, "school_settings", SCHOOL), {
      schoolCode: SCHOOL, schoolType: "day", currentTerm: "Term 2 2026",
      multiCampus: true,
    });
  });
});

after(async () => { await testEnv?.cleanup(); });

// ─────────────────────────────────────────────────────────────────────────────
// The list of a school's sites is not the sensitive thing — what a campus
// CONTAINS is, and that lives in students, marks and registers. So all staff
// read all campuses of their own school, and only the two roles with authority
// over the whole school create or rename one.
// ─────────────────────────────────────────────────────────────────────────────
describe("campuses", () => {
  it("any member of staff can read their own school's campuses", async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), "campuses", CAMPUS_B)));
  });

  it("a school-filtered list is allowed", async () => {
    await assertSucceeds(getDocs(query(
      collection(asTeacher(), "campuses"),
      where("schoolCode", "==", SCHOOL),
    )));
  });

  it("an UNFILTERED list is denied — the rule reads schoolCode", async () => {
    // Same trap as everywhere else in this suite: Firestore authorises a list
    // from the query's constraints, not from the documents it would return.
    // subscribeCampuses() therefore always filters on schoolCode.
    await assertFails(getDocs(collection(asTeacher(), "campuses")));
  });

  it("another school cannot read them", async () => {
    await assertFails(getDoc(doc(asOutsider(), "campuses", CAMPUS_A)));
  });

  it("an administrator can add a campus", async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), "campuses", "campus_third"), {
      schoolCode: SCHOOL, name: "Third Campus", code: `${SCHOOL}-TC`,
      isPrimary: false, status: "active",
    }));
  });

  it("a director can add a campus", async () => {
    await assertSucceeds(setDoc(doc(asDirector(), "campuses", "campus_fourth"), {
      schoolCode: SCHOOL, name: "Fourth Campus", code: `${SCHOOL}-FC`,
      isPrimary: false, status: "active",
    }));
  });

  it("a head teacher cannot — opening a site is a school-level decision", async () => {
    await assertFails(setDoc(doc(asHead(), "campuses", "campus_bad"), {
      schoolCode: SCHOOL, name: "Sneaky Campus", code: "X",
      isPrimary: false, status: "active",
    }));
  });

  it("nobody can create a campus under another school's code", async () => {
    await assertFails(setDoc(doc(asAdmin(), "campuses", "campus_cross"), {
      schoolCode: OTHER_SCHOOL, name: "Not Mine", code: "X",
      isPrimary: false, status: "active",
    }));
  });

  it("a campus can never be deleted — years of records point at it", async () => {
    await assertFails(deleteDoc(doc(asAdmin(), "campuses", CAMPUS_B)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The split these tests defend: anyone on staff may ASK for a student to move
// campus, and only an administrator or director may GRANT it. A head teacher
// runs one campus, so letting them approve would let a site walk its own roll
// across without the receiving campus having any say.
// ─────────────────────────────────────────────────────────────────────────────
describe("campus transfers", () => {
  const pending = (extra = {}) => ({
    schoolCode: SCHOOL,
    studentId: STUDENT,
    studentName: "Test Child",
    fromCampusId: CAMPUS_A,
    toCampusId: CAMPUS_B,
    toCampusName: "Second Campus",
    status: "pending",
    requestedById: HEAD,
    ...extra,
  });

  it("a head teacher can raise a request", async () => {
    await assertSucceeds(addDoc(
      collection(asHead(), "campus_transfer_requests"), pending(),
    ));
  });

  it("a request cannot be created already approved", async () => {
    // Otherwise the approval and the request collapse into one act, and the
    // decision has nobody's name on it.
    await assertFails(addDoc(
      collection(asHead(), "campus_transfer_requests"), pending({ status: "approved" }),
    ));
  });

  it("another school cannot file one against this school", async () => {
    await assertFails(addDoc(
      collection(asOutsider(), "campus_transfer_requests"), pending(),
    ));
  });

  it("a head teacher cannot approve — that needs sight of both campuses", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "campus_transfer_requests", "ctr_1"), pending());
    });
    await assertFails(updateDoc(
      doc(asHead(), "campus_transfer_requests", "ctr_1"),
      { status: "approved", decidedById: HEAD },
    ));
  });

  it("a director can approve", async () => {
    await assertSucceeds(updateDoc(
      doc(asDirector(), "campus_transfer_requests", "ctr_1"),
      { status: "approved", decidedById: DIRECTOR, decidedByName: "Director" },
    ));
  });

  it("an approval cannot be recycled onto a different student", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "campus_transfer_requests", "ctr_2"), pending());
    });
    await assertFails(updateDoc(
      doc(asAdmin(), "campus_transfer_requests", "ctr_2"),
      { status: "approved", studentId: "some_other_child" },
    ));
  });

  it("a decided request can never be deleted", async () => {
    await assertFails(deleteDoc(doc(asAdmin(), "campus_transfer_requests", "ctr_2")));
  });

  it("a director may move a student's campus", async () => {
    await assertSucceeds(updateDoc(doc(asDirector(), "students", STUDENT), {
      campusId: CAMPUS_B, campusName: "Second Campus", classId: "", className: "",
    }));
  });

  it("but cannot touch anything else about a child", async () => {
    // The director's single write permission on /students is the narrow one
    // that completes a transfer. A director who could also edit guardians or
    // marks would be editing records they later sign off on.
    await assertFails(updateDoc(doc(asDirector(), "students", STUDENT), {
      campusId: CAMPUS_A, guardianPhone: "+265888000000",
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The whole security model for PayChangu in one sentence: a browser cannot
// create a transaction, cannot mark one paid, and cannot invent a receipt,
// because the only path to these documents runs through serverless functions
// that have asked PayChangu what happened. These tests pin the "cannot" half.
// ─────────────────────────────────────────────────────────────────────────────
describe("gateway payments", () => {
  before(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "payment_transactions", "ACL-FEE-TEST-1"), {
        txRef: "ACL-FEE-TEST-1", purpose: "school_fee", schoolCode: SCHOOL,
        status: "pending", amount: 50000, currency: "MWK", initiatedById: BURSAR,
      });
      await setDoc(doc(db, "subscription_payments", "sub_1"), {
        schoolCode: SCHOOL, amount: 262500, currency: "MWK", receiptNo: "RCP-X",
      });
    });
  });

  it("staff of the school can read a transaction", async () => {
    await assertSucceeds(getDoc(doc(asBursar(), "payment_transactions", "ACL-FEE-TEST-1")));
  });

  it("another school cannot", async () => {
    await assertFails(getDoc(doc(asOutsider(), "payment_transactions", "ACL-FEE-TEST-1")));
  });

  it("nobody can invent a transaction", async () => {
    await assertFails(setDoc(doc(asBursar(), "payment_transactions", "ACL-FEE-FAKE"), {
      txRef: "ACL-FEE-FAKE", purpose: "school_fee", schoolCode: SCHOOL,
      status: "success", amount: 9999999, initiatedById: BURSAR,
    }));
  });

  it("nobody can mark a pending transaction paid", async () => {
    // The one write that would turn a made-up payment into a real receipt.
    await assertFails(updateDoc(
      doc(asAdmin(), "payment_transactions", "ACL-FEE-TEST-1"),
      { status: "success" },
    ));
  });

  it("an administrator can read a subscription receipt", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), "subscription_payments", "sub_1")));
  });

  it("a director can too — they are the one who signs the cheque", async () => {
    await assertSucceeds(getDoc(doc(asDirector(), "subscription_payments", "sub_1")));
  });

  it("a class teacher cannot — what the school pays is not staffroom business", async () => {
    await assertFails(getDoc(doc(asTeacher(), "subscription_payments", "sub_1")));
  });

  it("nobody can write a subscription receipt", async () => {
    await assertFails(setDoc(doc(asAdmin(), "subscription_payments", "sub_fake"), {
      schoolCode: SCHOOL, amount: 1, receiptNo: "RCP-FAKE",
    }));
  });
});
