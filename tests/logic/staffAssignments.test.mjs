// Staff assignments must only name classes and subjects the school still has
// registered. A class that closed (Form 3, say) must drop off every teacher it
// was assigned to, and a rename must carry teachers across rather than drop them.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanAssignments, hasStaleAssignments, registeredSubjects, applyRenames,
} from "../../src/services/staffAssignmentsCore.js";

const CLASSES = [
  { name: "Form 1", subjects: ["English", "Mathematics", "Biology"] },
  { name: "Form 2", subjects: ["English", "Mathematics", "Chichewa"] },
];

describe("registeredSubjects", () => {
  it("is the de-duplicated union of every class's subjects, A–Z", () => {
    assert.deepEqual(registeredSubjects(CLASSES), ["Biology", "Chichewa", "English", "Mathematics"]);
  });
  it("is empty when the school has no classes", () => {
    assert.deepEqual(registeredSubjects([]), []);
  });
});

describe("cleanAssignments", () => {
  it("drops a class the school no longer has and keeps the rest in order", () => {
    const r = cleanAssignments({ assignedClasses: ["Form 3", "Form 2", "Form 1"] }, CLASSES);
    assert.deepEqual(r.classes, ["Form 2", "Form 1"]);
    assert.deepEqual(r.staleClasses, ["Form 3"]);
  });

  it("drops a subject no registered class offers", () => {
    const r = cleanAssignments({ assignedSubjects: ["Physics", "English"] }, CLASSES);
    assert.deepEqual(r.subjects, ["English"]);
    assert.deepEqual(r.staleSubjects, ["Physics"]);
  });

  it("treats a missing assignment list as empty", () => {
    const r = cleanAssignments({}, CLASSES);
    assert.deepEqual(r, { classes: [], subjects: [], staleClasses: [], staleSubjects: [] });
  });

  it("clears everything when the school has no classes registered", () => {
    const r = cleanAssignments({ assignedClasses: ["Form 1"], assignedSubjects: ["English"] }, []);
    assert.deepEqual(r.classes, []);
    assert.deepEqual(r.subjects, []);
  });
});

describe("hasStaleAssignments", () => {
  it("is false for a clean record and true when anything would be dropped", () => {
    assert.equal(hasStaleAssignments({ assignedClasses: ["Form 1"], assignedSubjects: ["Biology"] }, CLASSES), false);
    assert.equal(hasStaleAssignments({ assignedClasses: ["Form 3"] }, CLASSES), true);
    assert.equal(hasStaleAssignments({ assignedSubjects: ["Physics"] }, CLASSES), true);
  });
});

describe("applyRenames", () => {
  it("moves a teacher to the renamed class without duplicating it", () => {
    assert.deepEqual(applyRenames(["Form 3", "Form 3A"], { "Form 3": "Form 3A" }), ["Form 3A"]);
  });
  it("leaves names that were not renamed alone", () => {
    assert.deepEqual(applyRenames(["Form 1"], { "Form 3": "Form 3A" }), ["Form 1"]);
  });
});
