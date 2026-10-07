import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalisePhone, isDialablePhone } from "../../src/services/phone.js";
import { guardiansOf, guardianFields, isGuardianPhone, splitNames, splitPhones } from "../../src/services/guardians.js";
import { validateStudentRows } from "../../src/services/studentImportCore.js";
import { tableFromRows } from "../../src/services/csv.js";

describe("phone standardising", () => {
  it("writes every Malawian spelling one way", () => {
    for (const raw of ["0999541085", "999541085", "+265 999 541 085", "265999541085", "00265999541085", "0999-541-085"]) {
      assert.equal(normalisePhone(raw), "+265999541085", raw);
    }
  });
  it("keeps well-formed foreign numbers and refuses broken ones", () => {
    assert.equal(normalisePhone("16146344250"), "+16146344250");
    assert.equal(normalisePhone("+1(425)340-5496"), "+14253405496");
    assert.equal(isDialablePhone("+16146344250"), true);
    assert.equal(isDialablePhone("+142533405496"), false);   // one digit too many for the US
    assert.equal(isDialablePhone("099919398"), false);        // missing a digit
    assert.equal(isDialablePhone("0884934863099"), false);    // two numbers run together
  });
});

describe("guardians", () => {
  it("splits cells and decodes entities", () => {
    assert.deepEqual(splitNames("Godfrey Munseka, Violet Chimpikiso"), ["Godfrey Munseka", "Violet Chimpikiso"]);
    assert.deepEqual(splitNames("Kaching&#039;ona"), ["Kaching'ona"]);
    assert.deepEqual(splitPhones("0999541085, 0997998604"), ["0999541085", "0997998604"]);
    assert.deepEqual(splitPhones("NULL"), []);
  });
  it("reads old single-guardian students and new multi-guardian ones", () => {
    assert.deepEqual(guardiansOf({ guardianName: "A", guardianPhone: "0999541085" }).map((g) => g.phone), ["+265999541085"]);
    const s = { guardianPhone: "+265999541085", guardians: [{ name: "A", phone: "+265999541085" }, { name: "B", phone: "0881234567" }] };
    assert.deepEqual(guardiansOf(s).map((g) => g.phone), ["+265999541085", "+265881234567"]);
    assert.equal(isGuardianPhone(s, "0881234567"), true);
    assert.equal(isGuardianPhone(s, "0881234568"), false);
  });
  it("writes the first guardian into the legacy fields", () => {
    const f = guardianFields([{ name: "A", phone: "0999541085" }, { name: "B", phone: "0881234567" }]);
    assert.equal(f.guardianPhone, "+265999541085");
    assert.deepEqual(f.guardianPhones, ["+265999541085", "+265881234567"]);
  });
});

describe("the headteacher's layout", () => {
  const { rows } = tableFromRows([
    ["First Name", "Last Name", "Gender", "Class", "Guardians", "Phone Numbers G1", "Phone Numbers G2"],
    ["Munseka", "Atarah ", "female", "K2", "Godfrey Munseka, Violet Chimpikiso", "0999541085, 0997998604", "NULL"],
    ["Makaka", "Ethan ", "male", "k 2", "Anna Makaka", "884085769", "NULL"],
    ["Phiri", "Jil", "female", "K2", "Anthony Phiri, Patricia Phiri", "099919398, 0884166834", "NULL"],
    ["Banda", "Worship", "male", "K2", "A Banda, B Banda", "08854330440997, 08813598100995", "NULL"],
  ]);
  const out = validateStudentRows({ rows, classes: [{ id: "c1", name: "K2" }], existingStudents: [] });

  it("takes every guardian and number from the combined cells", () => {
    assert.equal(out[0].valid, true);
    assert.deepEqual(out[0].data.guardians.map((g) => [g.name, g.phone]),
      [["Godfrey Munseka", "+265999541085"], ["Violet Chimpikiso", "+265997998604"]]);
    assert.equal(out[0].data.lastName, "Atarah");
  });
  it("matches classes loosely and fixes a 9-digit number", () => {
    assert.equal(out[1].valid, true);
    assert.equal(out[1].data.classId, "c1");
    assert.equal(out[1].data.guardianPhone, "+265884085769");
  });
  it("imports the child but warns about a number it can't use", () => {
    assert.equal(out[2].valid, true);
    assert.equal(out[2].data.guardians.length, 1);
    assert.match(out[2].warnings.join(" "), /missing a digit/);
  });
  it("still enrols a child with no usable number, flagged, with a suggested fix", () => {
    assert.equal(out[3].valid, true);
    assert.match(out[3].warnings.join(" "), /0885433044/);
    assert.equal(out[3].data.guardians.length, 0);
    assert.equal(out[3].data.guardianPhone, "");
  });
});
