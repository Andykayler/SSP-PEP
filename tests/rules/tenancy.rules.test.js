// tests/rules/tenancy.rules.test.js
// ─────────────────────────────────────────────────────────────────────────────
// The school boundary, pinned.
//
// Three defects lived in these rules for a long time and none of them looked
// like a defect on the page:
//
//   1. fee_assignments create AND delete were denied outright, because one
//      combined rule read `resource.data.schoolCode || request.resource.data
//      .schoolCode` — and exactly one of those two is null in each verb, which
//      errors rather than falling through. Assigning a fee to a student could
//      never work.
//
//   2. The students read ended in `|| isAdminOrHead()`. A same-school admin
//      already passes sameSchool(), so that branch's ONLY effect was letting
//      every administrator and head teacher read every child at every other
//      school on the platform.
//
//   3. users delete was `if isAdmin()` with no school check, so an
//      administrator at one school could delete anyone's account anywhere.
//
// Each is cheap to reintroduce and silent when reintroduced, which is what
// these tests are for.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  setDoc, addDoc, updateDoc, deleteDoc,
} from "firebase/firestore";

const OURS = "TENANCY-A";
const THEIRS = "TENANCY-B";

const OUR_ADMIN = "our_admin";
const OUR_HEAD = "our_head";
const OUR_BURSAR = "our_bursar";
const THEIR_ADMIN = "their_admin";
const THEIR_HEAD = "their_head";

const OUR_STUDENT = "our_student";
const THEIR_STUDENT = "their_student";

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "ssp-pep-tenancy-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const staff = [
      [OUR_ADMIN, "admin", OURS],
      [OUR_HEAD, "head_teacher", OURS],
      [OUR_BURSAR, "bursar", OURS],
      [THEIR_ADMIN, "admin", THEIRS],
      [THEIR_HEAD, "head_teacher", THEIRS],
    ];
    for (const [uid, role, school] of staff) {
      await setDoc(doc(db, "users", uid), {
        name: uid, role, schoolCode: school, assignedClasses: [],
      });
    }

    await setDoc(doc(db, "students", OUR_STUDENT), {
      fullName: "Our Child", studentCode: "AAA-111", schoolCode: OURS,
      guardianPhone: "+265991000001", classId: "c1", className: "Form 1A",
      parentPortalPassword: "x",
    });
    await setDoc(doc(db, "students", THEIR_STUDENT), {
      fullName: "Their Child", studentCode: "BBB-222", schoolCode: THEIRS,
      guardianPhone: "+265991000002", classId: "c9", className: "Form 3B",
      parentPortalPassword: "y",
    });

    await setDoc(doc(db, "fee_assignments", "existing_ours"), {
      schoolCode: OURS, studentId: OUR_STUDENT, amount: 1000,
      academicYear: "2025/2026", feeName: "Tuition",
    });
  });
});

after(async () => { await env?.cleanup(); });

// ─────────────────────────────────────────────────────────────────────────────
// 1. The bug that stopped the fee ledger being populated at all.
// ─────────────────────────────────────────────────────────────────────────────
describe("fee assignments — the verbs that were denied outright", () => {
  const row = (extra = {}) => ({
    schoolCode: OURS, studentId: OUR_STUDENT, amount: 5000,
    academicYear: "2025/2026", feeName: "Boarding", ...extra,
  });

  it("a bursar can CREATE one for their own school", async () => {
    // Regression guard: this was denied, so StudentFees.jsx could never assign
    // a fee to anybody.
    await assertSucceeds(addDoc(collection(as(OUR_BURSAR), "fee_assignments"), row()));
  });

  it("an admin can create one too", async () => {
    await assertSucceeds(addDoc(collection(as(OUR_ADMIN), "fee_assignments"), row()));
  });

  it("a bursar can DELETE one from their own school", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "fee_assignments", "to_delete"), row());
    });
    await assertSucceeds(deleteDoc(doc(as(OUR_BURSAR), "fee_assignments", "to_delete")));
  });

  it("a bursar can update one", async () => {
    await assertSucceeds(updateDoc(
      doc(as(OUR_BURSAR), "fee_assignments", "existing_ours"),
      { amount: 1200, schoolCode: OURS },
    ));
  });

  it("but cannot create one against another school", async () => {
    await assertFails(addDoc(
      collection(as(OUR_BURSAR), "fee_assignments"), row({ schoolCode: THEIRS }),
    ));
  });

  it("and a class teacher cannot create one at all", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "our_teacher"), {
        name: "Teacher", role: "class_teacher", schoolCode: OURS, assignedClasses: [],
      });
    });
    await assertFails(addDoc(collection(as("our_teacher"), "fee_assignments"), row()));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The blanket cross-school student read.
// ─────────────────────────────────────────────────────────────────────────────
describe("students — one school cannot read another's children", () => {
  it("our admin reads our own student", async () => {
    await assertSucceeds(getDoc(doc(as(OUR_ADMIN), "students", OUR_STUDENT)));
  });

  it("our admin CANNOT read another school's student", async () => {
    // This passed before the fix, for every admin and head teacher on the
    // platform. The transfer-in lookup that needed it now runs server-side.
    await assertFails(getDoc(doc(as(OUR_ADMIN), "students", THEIR_STUDENT)));
  });

  it("our head teacher cannot either", async () => {
    await assertFails(getDoc(doc(as(OUR_HEAD), "students", THEIR_STUDENT)));
  });

  it("their admin cannot read ours", async () => {
    await assertFails(getDoc(doc(as(THEIR_ADMIN), "students", OUR_STUDENT)));
  });

  it("a school-filtered roll query still works", async () => {
    await assertSucceeds(getDocs(query(
      collection(as(OUR_ADMIN), "students"),
      where("schoolCode", "==", OURS),
    )));
  });

  it("a platform-wide search by student code is refused", async () => {
    // The exact query the transfer-in screen used to run from the browser.
    await assertFails(getDocs(query(
      collection(as(OUR_ADMIN), "students"),
      where("studentCode", "==", "BBB-222"),
      limit(1),
    )));
  });

  it("a platform-wide search by guardian phone is refused", async () => {
    // The guardian-linking query, likewise now server-side.
    await assertFails(getDocs(query(
      collection(as(OUR_ADMIN), "students"),
      where("guardianPhone", "==", "+265991000002"),
    )));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cross-school account deletion.
// ─────────────────────────────────────────────────────────────────────────────
describe("users — an admin deletes only their own school's staff", () => {
  it("our admin can delete one of ours", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "ours_to_delete"), {
        name: "Leaver", role: "class_teacher", schoolCode: OURS, assignedClasses: [],
      });
    });
    await assertSucceeds(deleteDoc(doc(as(OUR_ADMIN), "users", "ours_to_delete")));
  });

  it("our admin CANNOT delete another school's head teacher", async () => {
    await assertFails(deleteDoc(doc(as(OUR_ADMIN), "users", THEIR_HEAD)));
  });

  it("their admin cannot delete ours", async () => {
    await assertFails(deleteDoc(doc(as(THEIR_ADMIN), "users", OUR_BURSAR)));
  });

  it("a head teacher cannot delete anyone", async () => {
    await assertFails(deleteDoc(doc(as(OUR_HEAD), "users", OUR_BURSAR)));
  });
});
