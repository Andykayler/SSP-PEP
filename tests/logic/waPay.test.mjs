// The WhatsApp bot asks which mobile money number to pay from. These pin how a
// reply is read, without any network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePayNumber, numberFitsNetwork, localDisplay } from "../../src/services/waPayCore.js";

const SENDER = "+265991234567";

describe("parsePayNumber", () => {
  it("reads SAME and friends as the WhatsApp number", () => {
    for (const t of ["same", "SAME", "this number", "mine", "yes"]) {
      assert.deepEqual(parsePayNumber(t, SENDER), { ok: true, mobile: SENDER }, t);
    }
  });
  it("normalises a typed number however it is written", () => {
    for (const t of ["0881234567", "0881 234 567", "+265881234567", "265881234567", "881234567"]) {
      assert.deepEqual(parsePayNumber(t, SENDER), { ok: true, mobile: "+265881234567" }, t);
    }
  });
  it("refuses things that are not a Malawian mobile number", () => {
    for (const t of ["", "hello", "12345", "0771234567", "+27821234567", "099123"]) {
      assert.equal(parsePayNumber(t, SENDER).ok, false, t);
    }
  });
  it("refuses SAME when the WhatsApp number itself is not a Malawian mobile", () => {
    assert.equal(parsePayNumber("same", "+27821234567").ok, false);
  });
});

describe("numberFitsNetwork", () => {
  it("rejects only a clear mismatch", () => {
    assert.equal(numberFitsNetwork("+265881234567", "airtel"), false);
    assert.equal(numberFitsNetwork("+265991234567", "tnm"), false);
    assert.equal(numberFitsNetwork("+265991234567", "airtel"), true);
    assert.equal(numberFitsNetwork("+265881234567", "tnm"), true);
  });
  it("lets an unfamiliar prefix through for the gateway to judge", () => {
    assert.equal(numberFitsNetwork("+265311234567", "airtel"), true);
    assert.equal(numberFitsNetwork("+265971234567", "tnm"), true);
  });
});

describe("localDisplay", () => {
  it("shows a number the way it is written on a phone", () => {
    assert.equal(localDisplay("+265991234567"), "0991 234 567");
    assert.equal(localDisplay("weird"), "weird");
  });
});
