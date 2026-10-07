import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseParentCommand, pastTerms, resolveRequestedTerm, attendanceSummary, attendanceText,
  resultsText,
} from "../../src/services/waParentCore.js";
import { MANEB_SCALE } from "../../src/services/curriculumCore.js";

describe("parseParentCommand", () => {
  it("reads the menu words, case and spacing aside", () => {
    assert.equal(parseParentCommand("Results").cmd, "results");
    assert.equal(parseParentCommand("  HOME  WORK ").cmd, "homework");
    assert.equal(parseParentCommand("behaviour").cmd, "discipline");
    assert.equal(parseParentCommand("fees").cmd, "fees");
    assert.equal(parseParentCommand("menu").cmd, "menu");
  });
  it("ignores ordinary chat and payment phrases", () => {
    assert.equal(parseParentCommand("what are the results of my son please"), null);
    assert.equal(parseParentCommand("pay fees"), null);
    assert.equal(parseParentCommand("make payment"), null);
    assert.equal(parseParentCommand("homework previous"), null);
  });
  it("takes a term, or asks for the list of earlier ones", () => {
    assert.deepEqual(parseParentCommand("results previous").term, { kind: "list" });
    assert.deepEqual(parseParentCommand("attendance term 1 2025").term, { kind: "term", number: 1, year: 2025 });
    assert.deepEqual(parseParentCommand("results term 2").term, { kind: "term", number: 2, year: null });
    assert.equal(parseParentCommand("results term 7 2025"), null);
  });
});

describe("terms", () => {
  it("lists earlier terms newest first, across the year boundary", () => {
    assert.deepEqual(pastTerms("Term 1 2026", 3), ["Term 3 2025", "Term 2 2025", "Term 1 2025"]);
  });
  it("does not resolve a year-less term to the future", () => {
    assert.equal(resolveRequestedTerm({ kind: "term", number: 3, year: null }, "Term 1 2026"), "Term 3 2025");
    assert.equal(resolveRequestedTerm({ kind: "term", number: 1, year: null }, "Term 2 2026"), "Term 1 2026");
    assert.equal(resolveRequestedTerm({ kind: "term", number: 1, year: 2024 }, "Term 2 2026"), "Term 1 2024");
  });
});

describe("attendance", () => {
  const docs = [
    { date: "2026-02-02", records: { s1: "Present" } },
    { date: "2026-02-03", records: { s1: { status: "Absent" } } },
    { date: "2026-02-04", records: { s1: "Late" } },
    { date: "2025-10-01", records: { s1: "Absent" } },        // another term
    { date: "2026-02-05", records: { other: "Absent" } },     // another child
  ];
  it("counts only this child in this term", () => {
    const s = attendanceSummary(docs, "s1", { start: "2026-01-01", end: "2026-04-30" });
    assert.equal(s.recorded, 3);
    assert.equal(s.absent, 1);
    assert.equal(s.late, 1);
    assert.equal(s.present, 2);
    assert.equal(s.issues[0].date, "2026-02-04");
  });
  it("says so when nothing was recorded", () => {
    const text = attendanceText({ student: { fullName: "Chikondi" }, term: "Term 2 2026", summary: attendanceSummary([], "s1") });
    assert.match(text, /No attendance has been recorded/);
  });
});

describe("texts", () => {
  it("shows grades from the class's scale", () => {
    const text = resultsText({
      student: { fullName: "Chikondi" }, term: "Term 2 2026", scale: MANEB_SCALE, current: true,
      subjects: [{ subject: "English", weighted: 82 }], overallAverage: 82, rank: 1, classSize: 40,
    });
    assert.match(text, /English: 82% \(1 – Distinction\)/);
    assert.match(text, /Position: 1 of 40/);
  });
});

describe("natural phrasing", () => {
  it("understands polite and punctuated requests", () => {
    for (const t of ["Results please", "my results?", "Show me the RESULTS 😊", "Hi", "Hello!"]) {
      assert.ok(parseParentCommand(t), t);
    }
    assert.equal(parseParentCommand("results previous").term.kind, "list");
    assert.equal(parseParentCommand("make payment"), null);
    assert.equal(parseParentCommand("I want to pay"), null);
  });
});
