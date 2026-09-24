// The setup wizard's class generator.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planClasses, classDocId } from "../../src/services/classSetupCore.js";

describe("planClasses", () => {
  it("makes one class per form when there are no streams", () => {
    const c = planClasses({ schoolCode: "S", level: "Secondary", forms: { 1: 0, 2: 0 }, subjects: ["English"] });
    assert.deepEqual(c.map((x) => x.data.name), ["Form 1", "Form 2"]);
    assert.equal(c[0].id, classDocId("S", 1, null));
    assert.deepEqual(c[0].data.subjects, ["English"]);
  });
  it("adds lettered streams", () => {
    const c = planClasses({ schoolCode: "S", level: "Secondary", forms: { 3: 2 } });
    assert.deepEqual(c.map((x) => x.data.name), ["Form 3A", "Form 3B"]);
    assert.deepEqual(c.map((x) => x.id), ["S_form3A", "S_form3B"]);
  });
  it("uses Standards for a primary school", () => {
    const c = planClasses({ schoolCode: "S", level: "Primary", forms: { 8: 0 } });
    assert.equal(c[0].data.name, "Standard 8");
  });
  it("ignores forms the level doesn't have, and tidies subjects", () => {
    const c = planClasses({ schoolCode: "S", level: "Secondary", forms: { 7: 0, 1: 0 }, subjects: [" Maths ", "Maths", ""] });
    assert.deepEqual(c.map((x) => x.data.name), ["Form 1"]);
    assert.deepEqual(c[0].data.subjects, ["Maths"]);
  });
  it("matches the head teacher's class ids so re-running doesn't duplicate", () => {
    assert.equal(classDocId("MWI-X", 2, "B"), "MWI-X_form2B");
  });
});
