// The data export must never quietly start including credentials.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, toTable, DATASETS } from "../../src/services/dataExportCore.js";

describe("data export", () => {
  it("removes anything named like a credential, at any depth, and counts what it removed", () => {
    const stats = { stripped: 0 };
    const out = cleanValue({
      fullName: "Chikondi",
      parentPortalPassword: "abc123",
      guardian: { phone: "0991", Password: "x", nested: { apiToken: "t", ok: 1 } },
      list: [{ passcode: "1", keep: true }],
    }, stats);

    assert.equal(out.fullName, "Chikondi");
    assert.ok(!("parentPortalPassword" in out));
    assert.ok(!("Password" in out.guardian));
    assert.ok(!("apiToken" in out.guardian.nested));
    assert.equal(out.guardian.nested.ok, 1);
    assert.deepEqual(out.list, [{ keep: true }]);
    assert.equal(stats.stripped, 4);
    assert.ok(!JSON.stringify(out).includes("abc123"));
  });

  it("turns Firestore timestamps and dates into ISO strings", () => {
    const ts = { toDate: () => new Date("2026-09-21T10:00:00Z") };
    const out = cleanValue({ createdAt: ts, when: new Date("2026-01-02T00:00:00Z"), n: 5, s: "x", nothing: null });
    assert.equal(out.createdAt, "2026-09-21T10:00:00.000Z");
    assert.equal(out.when, "2026-01-02T00:00:00.000Z");
    assert.equal(out.n, 5);
    assert.equal(out.nothing, null);
  });

  it("builds a spreadsheet from documents with different fields", () => {
    const t = toTable([{ id: "1", name: "A", meta: { x: 1 } }, { id: "2", name: "B", extra: "y" }]);
    assert.deepEqual(t.headers, ["id", "name", "meta", "extra"]);
    assert.deepEqual(t.rows[0], ["1", "A", '{"x":1}', ""]);
    assert.deepEqual(t.rows[1], ["2", "B", "", "y"]);
  });

  it("starts with health and discipline records unticked, and names every dataset uniquely", () => {
    const ids = DATASETS.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length);
    const sensitive = DATASETS.filter((d) => d.sensitive).map((d) => d.id);
    assert.deepEqual(sensitive.sort(), ["discipline_cases", "health_profiles", "sickbay_visits"]);
  });
});
