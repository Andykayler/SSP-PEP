// A staff account moving between schools. One login per person; the profile
// belongs to one school at a time; nothing from an old school rides along to
// a new one, but a school taking someone back gets its old record restored.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideHire, buildHiredProfile, isDeactivated, formerStaffId,
} from "../../src/services/staffAccountCore.js";

const FORM = { name: "Chikondi Phiri", role: "class_teacher", phone: "+265991000001", allCampuses: false, campusIds: [] };

describe("isDeactivated", () => {
  it("treats the older 'suspended' status the same as 'deactivated'", () => {
    assert.equal(isDeactivated({ status: "deactivated" }), true);
    assert.equal(isDeactivated({ status: "suspended" }), true);
    assert.equal(isDeactivated({ status: "active" }), false);
    assert.equal(isDeactivated({}), false);
  });
});

describe("decideHire", () => {
  it("a login with no profile is taken on fresh", () => {
    assert.equal(decideHire(null, "B").kind, "fresh");
  });
  it("someone deactivated at another school can transfer", () => {
    assert.equal(decideHire({ schoolCode: "A", role: "class_teacher", status: "deactivated" }, "B").kind, "transfer");
  });
  it("someone still active at another school cannot be taken", () => {
    const d = decideHire({ schoolCode: "A", role: "class_teacher", status: "active" }, "B");
    assert.equal(d.kind, "active_elsewhere");
    assert.match(d.message, /deactivate/);
  });
  it("someone already at this school is reactivated, not hired again", () => {
    assert.equal(decideHire({ schoolCode: "B", role: "class_teacher", status: "deactivated" }, "B").kind, "same_school");
    assert.equal(decideHire({ schoolCode: "B", role: "class_teacher", status: "active" }, "B").kind, "same_school");
  });
  it("school administrator and platform accounts are never taken on as staff", () => {
    assert.equal(decideHire({ schoolCode: "A", role: "admin", status: "deactivated" }, "B").kind, "not_staff");
    assert.equal(decideHire({ schoolCode: "", role: "superadmin" }, "B").kind, "not_staff");
  });
});

describe("buildHiredProfile", () => {
  it("a new school gets a clean profile — nothing from the old school survives", () => {
    const p = buildHiredProfile({ uid: "u1", email: "c@x.mw", form: FORM, schoolCode: "B" });
    assert.equal(p.schoolCode, "B");
    assert.equal(p.status, "active");
    assert.equal(p.mustChangePassword, true);
    assert.equal(p.assignedClasses, undefined);
    assert.equal(p.assignedSubjects, undefined);
  });

  it("a school taking someone back restores what they had there", () => {
    const restored = {
      uid: "u1", email: "old@x.mw", name: "Old Name", schoolCode: "A",
      assignedClasses: ["Form 1"], assignedSubjects: ["English"], whatsappAlerts: true,
      status: "deactivated", deactivatedAt: "t", deactivatedBy: "admin", archivedFrom: "A",
    };
    const p = buildHiredProfile({ uid: "u1", email: "c@x.mw", form: FORM, schoolCode: "A", restored });
    assert.deepEqual(p.assignedClasses, ["Form 1"]);
    assert.deepEqual(p.assignedSubjects, ["English"]);
    assert.equal(p.whatsappAlerts, true);
    // The form wins for who they are and what they do now…
    assert.equal(p.name, "Chikondi Phiri");
    assert.equal(p.email, "c@x.mw");
    // …and the archive's housekeeping doesn't leak back.
    assert.equal(p.status, "active");
    assert.equal(p.deactivatedAt, undefined);
    assert.equal(p.archivedFrom, undefined);
  });

  it("a director is always school-wide", () => {
    const p = buildHiredProfile({ uid: "u1", email: "d@x.mw", form: { ...FORM, role: "director", campusIds: ["c1"] }, schoolCode: "B" });
    assert.equal(p.allCampuses, true);
    assert.deepEqual(p.campusIds, []);
  });
});

describe("formerStaffId", () => {
  it("is per school and person", () => {
    assert.equal(formerStaffId("A", "u1"), "A__u1");
  });
});
