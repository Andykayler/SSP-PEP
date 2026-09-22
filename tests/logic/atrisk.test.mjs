// The early-warning ranking: the thresholds that decide who a head teacher is
// told to look at first. A threshold that is wrong in either direction is
// costly — too tight and the list is ignored, too loose and a child is missed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankAtRisk, HIGH_AT } from "../../src/services/atRiskCore.js";

const TODAY = "2026-09-21";
const day = (offset) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);

/** A register per day for the last `n` school days; `status(i)` gives the child's status. */
const registers = (n, status) => Array.from({ length: n }, (_, i) => ({
  date: day(i + 1), records: { s1: { status: status(i) } },
}));

const student = { id: "s1", fullName: "Chikondi Mwale", className: "Form 3A" };
const rank = (o) => rankAtRisk({ students: [student], today: TODAY, ...o });

describe("at-risk ranking", () => {
  it("lists nobody when nothing is wrong", () => {
    assert.equal(rank({ attendance: registers(20, () => "Present") }).length, 0);
  });

  it("flags three absences in a row even when the overall rate is fine", () => {
    // newest three days absent, then 17 present: rate 15% would only be 'medium'.
    const r = rank({ attendance: registers(20, (i) => (i < 3 ? "Absent" : "Present")) });
    assert.equal(r[0].signals[0].level, "high");
    assert.match(r[0].signals[0].text, /3 days in a row/);
  });

  it("flags a high absence rate, and says how many days", () => {
    const r = rank({ attendance: registers(20, (i) => (i % 3 === 0 ? "Absent" : "Present")) });   // 7 of 20 = 35%
    assert.equal(r[0].signals[0].level, "high");
    assert.match(r[0].signals[0].text, /Absent 7 of the last 20/);
  });

  it("ignores a child with too few register days to judge", () => {
    assert.equal(rank({ attendance: registers(3, () => "Absent") }).length, 0);
  });

  it("only reads the last 28 days of attendance", () => {
    const old = Array.from({ length: 10 }, (_, i) => ({ date: day(60 + i), records: { s1: { status: "Absent" } } }));
    assert.equal(rank({ attendance: [...old, ...registers(10, () => "Present")] }).length, 0);
  });

  it("flags failing results but not a couple of low scores among good ones", () => {
    const marks = (o) => new Map([["s1", Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { score: v }]))]]);
    const low = rank({ marks: marks({ Maths: 30, English: 35, Biology: 38, Geography: 60 }) });
    assert.equal(low[0].signals[0].level, "high");
    assert.match(low[0].signals[0].text, /Failing 3 subjects/);

    assert.equal(rank({ marks: marks({ Maths: 30, English: 70, Biology: 72, Geography: 80 }) }).length, 0,
      "one weak subject among strong ones is not a warning by itself");
  });

  it("does not judge on fewer than three subjects", () => {
    assert.equal(rank({ marks: new Map([["s1", { Maths: { score: 10 }, English: { score: 12 } }]]) }).length, 0);
  });

  it("flags discipline: a high-severity case, or repeated cases", () => {
    assert.equal(rank({ discipline: [{ studentId: "s1", severity: "High", date: day(5) }] })[0].signals[0].level, "high");
    assert.equal(rank({ discipline: [{ studentId: "s1", severity: "Low", date: day(5) }] }).length, 0);
    const twiceCases = [{ studentId: "s1", severity: "Low", date: day(5) }, { studentId: "s1", severity: "Low", date: day(9) }];
    // Two minor cases is a medium signal (1.5 points): not enough on its own to be listed...
    assert.equal(rank({ discipline: twiceCases }).length, 0);
    // ...but a second medium signal alongside it is, because two things at once is a pattern.
    const both = rank({ discipline: twiceCases, attendance: registers(20, (i) => (i % 5 === 0 ? "Absent" : "Present")) });   // 4 of 20 = 20% absent
    assert.equal(both[0].level, "watch");
  });

  it("weighs fees less than the child's own attendance, marks and behaviour", () => {
    const feesOnly = rank({ arrears: [{ id: "s1", totalCharged: 100, balance: 100, termsOld: 3 }] });
    assert.equal(feesOnly[0].level, "watch", "fees alone is worth watching, not a high-risk flag");
    assert.ok(feesOnly[0].score < HIGH_AT);
  });

  it("ranks a child with several signals above one with a single signal", () => {
    const two = [
      { id: "a", fullName: "A Many", className: "F2" },
      { id: "b", fullName: "B One", className: "F2" },
    ];
    const attendance = [
      ...Array.from({ length: 10 }, (_, i) => ({ date: day(i + 1), records: { a: { status: "Absent" }, b: { status: i < 3 ? "Absent" : "Present" } } })),
    ];
    const ranked = rankAtRisk({
      students: two, today: TODAY, attendance,
      discipline: [{ studentId: "a", severity: "High", date: day(3) }],
      marks: new Map([["a", { M: { score: 20 }, E: { score: 25 }, B: { score: 30 } }]]),
    });
    assert.equal(ranked[0].student.id, "a");
    assert.ok(ranked[0].score > ranked[1].score);
    assert.equal(ranked[0].level, "high");
  });

  it("adds a point when three different kinds of trouble coincide", () => {
    const base = rank({
      attendance: registers(20, (i) => (i < 3 ? "Absent" : "Present")),
      discipline: [{ studentId: "s1", severity: "High", date: day(2) }],
    })[0].score;
    const three = rank({
      attendance: registers(20, (i) => (i < 3 ? "Absent" : "Present")),
      discipline: [{ studentId: "s1", severity: "High", date: day(2) }],
      marks: new Map([["s1", { M: { score: 20 }, E: { score: 25 }, B: { score: 30 } }]]),
    })[0].score;
    assert.equal(three, base + 3 + 1);
  });

  it("never puts fee details in the text meant for a guardian", () => {
    const r = rank({
      arrears: [{ id: "s1", totalCharged: 100, balance: 100, termsOld: 3 }],
      attendance: registers(20, (i) => (i < 3 ? "Absent" : "Present")),
    })[0];
    assert.match(r.guardianReasons, /Absent/);
    assert.doesNotMatch(r.guardianReasons, /fee|owed|paid/i);
    assert.ok(r.signals.some((s) => s.kind === "fees"), "but the head teacher still sees it");
  });

  it("leaves withdrawn learners out", () => {
    assert.equal(rankAtRisk({
      students: [{ ...student, status: "withdrawn" }], today: TODAY,
      attendance: registers(20, () => "Absent"),
    }).length, 0);
  });
});
