// tests/rules/director-oversight.rules.test.js
// ─────────────────────────────────────────────────────────────────────────────
// The director monitors every module and changes none of them. These pin both
// halves: the reads that used to be head-teacher-only now succeed, and not one
// write does — including the ones a head teacher is allowed.
//
// Its own file and projectId, like the other suites, so seed data cannot leak
// between processes through the shared emulator.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, addDoc,
} from "firebase/firestore";

const SCHOOL = "OVERSIGHT-1";
const OTHER = "OVERSIGHT-2";
const DIRECTOR = "director_uid";
const HEAD = "head_uid";
const TEACHER = "teacher_uid";
const OTHER_DIRECTOR = "other_director_uid";

let testEnv;
const as = (uid) => testEnv.authenticatedContext(uid).firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "ssp-pep-oversight-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", DIRECTOR), { name: "D", role: "director", schoolCode: SCHOOL, assignedClasses: [] });
    await setDoc(doc(db, "users", HEAD), { name: "H", role: "head_teacher", schoolCode: SCHOOL, assignedClasses: [] });
    await setDoc(doc(db, "users", TEACHER), { name: "T", role: "class_teacher", schoolCode: SCHOOL, assignedClasses: ["Form 1A"] });
    await setDoc(doc(db, "users", OTHER_DIRECTOR), { name: "OD", role: "director", schoolCode: OTHER, assignedClasses: [] });
    await setDoc(doc(db, "school_settings", SCHOOL), { schoolCode: SCHOOL, currentTerm: "Term 1 2026" });

    // Recorded by the teacher, so only "own work" or leadership could read them.
    await setDoc(doc(db, "attendance", "a1"), { schoolCode: SCHOOL, teacherId: TEACHER, className: "Form 1A" });
    await setDoc(doc(db, "homework", "h1"), { schoolCode: SCHOOL, teacherId: TEACHER, className: "Form 1A" });
    await setDoc(doc(db, "ca_marks", "m1"), { schoolCode: SCHOOL, teacherId: TEACHER, className: "Form 1A", term: "Term 1 2026" });
    await setDoc(doc(db, "lesson_plans", "l1"), { schoolCode: SCHOOL, teacherId: TEACHER });
    await setDoc(doc(db, "expenses", "e1"), { schoolCode: SCHOOL, amount: 5000 });
    await setDoc(doc(db, "students", "s1"), { schoolCode: SCHOOL, fullName: "Child", className: "Form 1A" });
    await setDoc(doc(db, "payments", "p1"), { schoolCode: SCHOOL, studentId: "s1", amount: 100, source: "bursar", status: "verified" });
  });
});

after(async () => { await testEnv?.cleanup(); });

describe("a director can look at every module", () => {
  for (const [col, id] of [
    ["attendance", "a1"], ["homework", "h1"], ["ca_marks", "m1"], ["lesson_plans", "l1"],
    ["expenses", "e1"], ["students", "s1"], ["payments", "p1"],
  ]) {
    it(`reads ${col}`, async () => {
      await assertSucceeds(getDoc(doc(as(DIRECTOR), col, id)));
    });
  }

  it("lists a school's homework", async () => {
    await assertSucceeds(getDocs(query(collection(as(DIRECTOR), "homework"), where("schoolCode", "==", SCHOOL))));
  });
});

describe("a director changes nothing", () => {
  it("cannot edit attendance", async () => {
    await assertFails(updateDoc(doc(as(DIRECTOR), "attendance", "a1"), { className: "Form 9" }));
  });
  it("cannot create or edit homework", async () => {
    await assertFails(addDoc(collection(as(DIRECTOR), "homework"), { schoolCode: SCHOOL, teacherId: DIRECTOR }));
    await assertFails(updateDoc(doc(as(DIRECTOR), "homework", "h1"), { title: "x" }));
    await assertFails(deleteDoc(doc(as(DIRECTOR), "homework", "h1")));
  });
  it("cannot enter or alter marks", async () => {
    await assertFails(setDoc(doc(as(DIRECTOR), "ca_marks", "m2"), {
      schoolCode: SCHOOL, teacherId: DIRECTOR, term: "Term 1 2026",
    }));
    await assertFails(updateDoc(doc(as(DIRECTOR), "ca_marks", "m1"), { term: "Term 1 2026" }));
  });
  it("cannot review a lesson plan", async () => {
    await assertFails(updateDoc(doc(as(DIRECTOR), "lesson_plans", "l1"), { reviewStatus: "approved" }));
  });
  it("cannot edit a student's record or fees", async () => {
    await assertFails(updateDoc(doc(as(DIRECTOR), "students", "s1"), { fullName: "Other" }));
    await assertFails(updateDoc(doc(as(DIRECTOR), "payments", "p1"), { amount: 1 }));
    await assertFails(deleteDoc(doc(as(DIRECTOR), "payments", "p1")));
    await assertFails(addDoc(collection(as(DIRECTOR), "payments"), {
      schoolCode: SCHOOL, studentId: "s1", amount: 50, source: "bursar", status: "verified",
    }));
  });
  it("cannot record an expense", async () => {
    await assertFails(addDoc(collection(as(DIRECTOR), "expenses"), { schoolCode: SCHOOL, amount: 1 }));
  });
});

describe("oversight stops at the school's edge", () => {
  it("another school's director reads none of it", async () => {
    for (const [col, id] of [["attendance", "a1"], ["homework", "h1"], ["ca_marks", "m1"], ["expenses", "e1"]]) {
      await assertFails(getDoc(doc(as(OTHER_DIRECTOR), col, id)));
    }
  });

  it("a class teacher still cannot read a colleague's marks", async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), "ca_marks", "m1"))); // their own
    await assertFails(getDoc(doc(as(OTHER_DIRECTOR), "lesson_plans", "l1")));
  });
});
