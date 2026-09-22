// tests/rules/new-features.rules.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Rules for the platform-approval, leave/cover, lesson-plan review and payment
// claim workflows added alongside this test file. Run with the rest:
//
//     npm run test:rules
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, updateDoc, getDoc,
} from "firebase/firestore";

const SCHOOL = "NF-SCHOOL";
const OTHER_SCHOOL = "NF-SCHOOL-2";
const ADMIN = "nf_admin";
const HEAD = "nf_head";
const TEACHER = "nf_teacher";
const TEACHER2 = "nf_teacher2";
const BURSAR = "nf_bursar";
const OUTSIDER_ADMIN = "nf_outsider_admin";
const PLATFORM = "nf_platform_owner";
const RANDOM_SIGNED_IN = "nf_nobody";

let testEnv;
const as = (uid) => testEnv.authenticatedContext(uid).firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "ssp-pep-new-features-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", ADMIN), { name: "Admin", role: "admin", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", HEAD), { name: "Head", role: "head_teacher", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", TEACHER), { name: "Teacher", role: "class_teacher", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", TEACHER2), { name: "Teacher Two", role: "class_teacher", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", BURSAR), { name: "Bursar", role: "bursar", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", OUTSIDER_ADMIN), { name: "Other Admin", role: "admin", schoolCode: OTHER_SCHOOL });
    await setDoc(doc(db, "users", PLATFORM), { name: "Platform Owner", role: "superadmin" });

    await setDoc(doc(db, "schools", SCHOOL), { name: "NF School", authUid: ADMIN, status: "active", subscription_status: "trial" });
    await setDoc(doc(db, "schools", "NF-PENDING"), { name: "Pending School", authUid: RANDOM_SIGNED_IN, status: "pending", subscription_status: "trial" });

    await setDoc(doc(db, "lesson_plans", "plan_1"), {
      teacherId: TEACHER, schoolCode: SCHOOL, className: "Form 1A", subject: "Maths",
      topic: "Fractions", status: "planned", reviewStatus: "pending",
    });

    await setDoc(doc(db, "leave_requests", "leave_1"), {
      staffId: TEACHER, schoolCode: SCHOOL, type: "Annual leave", status: "pending",
    });

    await setDoc(doc(db, "substitutions", "sub_1"), {
      schoolCode: SCHOOL, substituteId: TEACHER2, status: "assigned", date: "2026-10-01", periodNumber: 1,
    });

    await setDoc(doc(db, "exams", "exam_1"), { schoolCode: SCHOOL, name: "Term 2 Exams" });
    await setDoc(doc(db, "health_profiles", "hp_1"), { schoolCode: SCHOOL, studentId: "s1" });
    await setDoc(doc(db, "library_books", "book_1"), { schoolCode: SCHOOL, title: "Biology Form 3" });
    await setDoc(doc(db, "transport_routes", "route_1"), { schoolCode: SCHOOL, name: "Route 1" });

    await setDoc(doc(db, "payments", "pay_unverified"), {
      schoolCode: SCHOOL, studentId: "s1", amount: 5000, source: "parent_app", status: "unverified",
    });
    await setDoc(doc(db, "payments", "pay_verified"), {
      schoolCode: SCHOOL, studentId: "s1", amount: 5000, source: "bursar", status: "verified",
    });
  });
});

after(async () => testEnv.cleanup());

// ── Schools: approval cannot be self-served ──────────────────────────────────
describe("school registration and approval", () => {
  it("a new school must register pending, on trial, with no approval fields", async () => {
    await assertSucceeds(setDoc(doc(as(RANDOM_SIGNED_IN), "schools", "NF-NEW-1"), {
      name: "New School", authUid: RANDOM_SIGNED_IN, status: "pending", subscription_status: "trial",
    }));
  });

  it("cannot register itself already active", async () => {
    await assertFails(setDoc(doc(as(RANDOM_SIGNED_IN), "schools", "NF-NEW-2"), {
      name: "New School", authUid: RANDOM_SIGNED_IN, status: "active", subscription_status: "trial",
    }));
  });

  it("the founder cannot approve their own school", async () => {
    await assertFails(updateDoc(doc(as(RANDOM_SIGNED_IN), "schools", "NF-PENDING"), { status: "active" }));
  });

  it("an unrelated admin cannot approve someone else's school either", async () => {
    await assertFails(updateDoc(doc(as(ADMIN), "schools", "NF-PENDING"), { status: "active" }));
  });

  it("the platform owner can approve it", async () => {
    await assertSucceeds(updateDoc(doc(as(PLATFORM), "schools", "NF-PENDING"), {
      status: "active", trialEndsAt: new Date(), approvedAt: new Date(), approvedBy: PLATFORM,
    }));
  });

  it("a non-platform-owner cannot write to platform_audit", async () => {
    await assertFails(setDoc(doc(as(ADMIN), "platform_audit", "e1"), { action: "approve", schoolCode: SCHOOL }));
  });

  it("the founder can still edit their own school's ordinary details", async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), "schools", SCHOOL), { address: "New address" }));
  });

  it("but not slip an approval field into that same edit", async () => {
    await assertFails(updateDoc(doc(as(ADMIN), "schools", SCHOOL), { address: "New address", subscription_status: "active" }));
  });
});

// ── Users: an account cannot promote itself ──────────────────────────────────
describe("staff account creation", () => {
  it("a founder can create their own admin profile for the school they registered", async () => {
    await assertSucceeds(setDoc(doc(as(RANDOM_SIGNED_IN), "users", RANDOM_SIGNED_IN), {
      name: "Founder", role: "admin", schoolCode: "NF-PENDING",
    }));
  });

  it("an admin can add a teacher at their own school", async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), "users", "nf_new_teacher"), {
      name: "New Teacher", role: "class_teacher", schoolCode: SCHOOL,
    }));
  });

  it("an admin cannot add staff to a different school", async () => {
    await assertFails(setDoc(doc(as(ADMIN), "users", "nf_new_teacher2"), {
      name: "New Teacher", role: "class_teacher", schoolCode: OTHER_SCHOOL,
    }));
  });

  it("a signed-in account cannot write itself an admin profile for a school it does not own", async () => {
    // A fresh uid, so this is a genuine create — not an update of the profile
    // the earlier test in this block already wrote for RANDOM_SIGNED_IN.
    await assertFails(setDoc(doc(as("nf_land_grab"), "users", "nf_land_grab"), {
      name: "Nobody", role: "admin", schoolCode: SCHOOL,
    }));
  });

  it("a teacher cannot create their own profile with an elevated role", async () => {
    await assertFails(setDoc(doc(as("nf_self_promoter"), "users", "nf_self_promoter"), {
      name: "Sneaky", role: "admin", schoolCode: SCHOOL,
    }));
  });

  it("an owner may still update their own safe fields", async () => {
    await assertSucceeds(updateDoc(doc(as(TEACHER), "users", TEACHER), { whatsappAlerts: false }));
  });

  it("but not write their own phone or two-factor flag directly", async () => {
    await assertFails(updateDoc(doc(as(TEACHER), "users", TEACHER), { phone: "+265999999999" }));
    await assertFails(updateDoc(doc(as(TEACHER), "users", TEACHER), { twoFactor: true }));
  });
});

// ── Lesson plan review split ──────────────────────────────────────────────────
describe("lesson plan review", () => {
  it("the teacher can edit their own plan", async () => {
    await assertSucceeds(updateDoc(doc(as(TEACHER), "lesson_plans", "plan_1"), { topic: "Fractions and decimals" }));
  });

  it("but cannot approve their own plan", async () => {
    await assertFails(updateDoc(doc(as(TEACHER), "lesson_plans", "plan_1"), { reviewStatus: "approved" }));
  });

  it("the head teacher can approve it", async () => {
    await assertSucceeds(updateDoc(doc(as(HEAD), "lesson_plans", "plan_1"), {
      reviewStatus: "approved", review: "Good plan", reviewedBy: HEAD, reviewedByName: "Head", reviewedAt: new Date(),
    }));
  });

  it("the head teacher cannot rewrite the plan's own content while reviewing", async () => {
    await assertFails(updateDoc(doc(as(HEAD), "lesson_plans", "plan_1"), { reviewStatus: "approved", topic: "Rewritten" }));
  });

  it("a teacher at another school cannot review it", async () => {
    await assertFails(updateDoc(doc(as(OUTSIDER_ADMIN), "lesson_plans", "plan_1"), { reviewStatus: "approved" }));
  });
});

// ── Leave and cover ────────────────────────────────────────────────────────────
describe("leave and cover", () => {
  it("a teacher can request their own leave", async () => {
    await assertSucceeds(setDoc(doc(as(TEACHER), "leave_requests", "leave_new"), {
      staffId: TEACHER, schoolCode: SCHOOL, type: "Sick leave", status: "pending",
    }));
  });

  it("cannot request leave for somebody else", async () => {
    await assertFails(setDoc(doc(as(TEACHER), "leave_requests", "leave_fake"), {
      staffId: TEACHER2, schoolCode: SCHOOL, type: "Sick leave", status: "pending",
    }));
  });

  it("a teacher cannot approve their own leave", async () => {
    await assertFails(updateDoc(doc(as(TEACHER), "leave_requests", "leave_1"), { status: "approved" }));
  });

  it("the head teacher can decide it", async () => {
    await assertSucceeds(updateDoc(doc(as(HEAD), "leave_requests", "leave_1"), {
      status: "approved", decidedBy: HEAD, decidedByName: "Head", decidedAt: new Date(),
    }));
  });

  it("the head teacher can assign cover", async () => {
    await assertSucceeds(setDoc(doc(as(HEAD), "substitutions", "sub_new"), {
      schoolCode: SCHOOL, substituteId: TEACHER2, status: "assigned", date: "2026-10-02", periodNumber: 2,
    }));
  });

  it("a teacher cannot assign themselves cover duty", async () => {
    await assertFails(setDoc(doc(as(TEACHER), "substitutions", "sub_fake"), {
      schoolCode: SCHOOL, substituteId: TEACHER, status: "assigned", date: "2026-10-02", periodNumber: 3,
    }));
  });

  it("the assigned substitute can accept or decline", async () => {
    await assertSucceeds(updateDoc(doc(as(TEACHER2), "substitutions", "sub_1"), { status: "confirmed" }));
  });

  it("someone else cannot answer on the substitute's behalf", async () => {
    await assertFails(updateDoc(doc(as(TEACHER), "substitutions", "sub_1"), { status: "confirmed" }));
  });
});

// ── New per-school collections: same-school only ─────────────────────────────
describe("exams, health, library and transport stay inside one school", () => {
  it("staff at the school can read an exam", async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), "exams", "exam_1")));
  });
  it("staff at another school cannot", async () => {
    await assertFails(getDoc(doc(as(OUTSIDER_ADMIN), "exams", "exam_1")));
  });
  it("any teacher can read a health profile (they need to know in the classroom)", async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), "health_profiles", "hp_1")));
  });
  it("only leadership edits one", async () => {
    await assertFails(updateDoc(doc(as(TEACHER), "health_profiles", "hp_1"), { allergies: "Peanuts" }));
    await assertSucceeds(updateDoc(doc(as(HEAD), "health_profiles", "hp_1"), { allergies: "Peanuts" }));
  });
  it("a teacher can browse the library catalogue but not edit it", async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), "library_books", "book_1")));
    await assertFails(updateDoc(doc(as(TEACHER), "library_books", "book_1"), { title: "Edited" }));
  });
  it("staff can read the transport routes; only leadership edits", async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), "transport_routes", "route_1")));
    await assertFails(updateDoc(doc(as(TEACHER), "transport_routes", "route_1"), { name: "Renamed" }));
  });
  it("nobody can write to the WhatsApp outbox from the client", async () => {
    await assertFails(setDoc(doc(as(ADMIN), "wa_outbox", "m1"), { schoolCode: SCHOOL, to: "+265991234567", message: "hi" }));
  });
});

// ── Payment claims: bursar can decide, nothing else ───────────────────────────
describe("confirming a parent-app payment claim", () => {
  it("the bursar can confirm one", async () => {
    await assertSucceeds(updateDoc(doc(as(BURSAR), "payments", "pay_unverified"), {
      status: "verified", verifiedBy: "Bursar", verifiedAt: new Date(),
    }));
  });

  it("the bursar cannot also change the amount while confirming", async () => {
    await assertFails(updateDoc(doc(as(BURSAR), "payments", "pay_unverified"), {
      status: "verified", amount: 999999,
    }));
  });

  it("the bursar cannot touch a payment that is already verified through this path", async () => {
    await assertFails(updateDoc(doc(as(BURSAR), "payments", "pay_verified"), {
      status: "rejected", verifiedBy: "Bursar", verifiedAt: new Date(),
    }));
  });

  it("a class teacher cannot decide a claim", async () => {
    await assertFails(updateDoc(doc(as(TEACHER), "payments", "pay_unverified"), {
      status: "verified", verifiedBy: "Teacher", verifiedAt: new Date(),
    }));
  });
});
