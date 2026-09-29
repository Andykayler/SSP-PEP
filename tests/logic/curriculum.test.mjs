// Sections, curricula, grading scales and the timetable import.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sectionsOf, scaleForClass, sectionIdOfClass, gradeFor, validateScale, toneFor,
  planSectionClasses, defaultSection, renameSubjectInMarks, renameInList,
  MANEB_SCALE, CAMBRIDGE_SCALE, ABEKA_SCALE, isManebScale,
} from "../../src/services/curriculumCore.js";
import { planTimetableImport, matchDay, parseExtractedLessons } from "../../src/services/timetableImportCore.js";
import { analyseSubjects } from "../../src/services/examsCore.js";

describe("sectionsOf", () => {
  it("reads a school set up before sections as one MANEB-graded section", () => {
    const [p] = sectionsOf({ schoolLevel: "Primary" });
    assert.equal(p.id, "primary");
    assert.equal(p.curriculum, "malawi");
    assert.ok(isManebScale(p.grading), "legacy schools keep the MANEB grades they always saw");
    assert.equal(sectionsOf({}).at(0).id, "secondary");
  });

  it("keeps saved sections in Kindergarten → Primary → Secondary order", () => {
    const s = sectionsOf({ sections: [defaultSection("secondary", "malawi"), defaultSection("kindergarten", "abeka")] });
    assert.deepEqual(s.map((x) => x.id), ["kindergarten", "secondary"]);
    assert.equal(s[0].grading.name, "Early years (descriptive)");
  });

  it("falls back to the curriculum's scale when a saved scale is broken", () => {
    const [s] = sectionsOf({ sections: [{ id: "primary", curriculum: "abeka", grading: { bands: [{ label: "A", min: 50 }] } }] });
    assert.equal(s.grading.name, ABEKA_SCALE.name);
  });
});

describe("grading", () => {
  it("grades on Cambridge and Abeka scales", () => {
    assert.equal(gradeFor(91, CAMBRIDGE_SCALE).label, "A*");
    assert.equal(gradeFor(10, CAMBRIDGE_SCALE).label, "U");
    assert.equal(gradeFor(93, ABEKA_SCALE).label, "B");
    assert.equal(gradeFor(69, ABEKA_SCALE).pass, false);
    assert.equal(gradeFor("", ABEKA_SCALE), null);
  });

  it("matches the old MANEB table exactly", () => {
    assert.equal(gradeFor(80).label, "1");
    assert.equal(gradeFor(79.9).label, "2");
    assert.equal(gradeFor(40).label, "8");
    assert.equal(gradeFor(39).label, "9");
  });

  it("colours passing grades best-to-lowest and fails red", () => {
    const b = MANEB_SCALE.bands;
    assert.equal(toneFor(b, 0), "success");
    assert.equal(toneFor(b, 3), "primary");
    assert.equal(toneFor(b, 7), "warning");
    assert.equal(toneFor(b, 8), "danger");
  });

  it("validates a custom scale", () => {
    assert.equal(validateScale({ bands: [{ label: "P", min: 50 }, { label: "F", min: 10 }] }).ok, false, "must reach 0");
    assert.equal(validateScale({ bands: [{ label: "P", min: 50 }, { label: "p", min: 0 }] }).ok, false, "duplicate names");
    const ok = validateScale({ bands: [{ label: "F", min: 0, pass: false }, { label: "P", min: "50" }] });
    assert.ok(ok.ok);
    assert.deepEqual(ok.scale.bands.map((b) => b.label), ["P", "F"], "sorted highest first");
    assert.equal(ok.scale.bands[0].min, 50);
  });

  it("finds a class's scale from its section, including classes made before sections", () => {
    const settings = { sections: [defaultSection("primary", "cambridge"), defaultSection("secondary", "malawi")] };
    assert.equal(scaleForClass(settings, { section: "primary" }).name, CAMBRIDGE_SCALE.name);
    assert.ok(isManebScale(scaleForClass(settings, { level: "secondary" })));
    assert.equal(sectionIdOfClass({ level: "Primary" }), "primary");
  });
});

describe("planSectionClasses", () => {
  it("keeps the old ids for Malawian classes, so re-running setup doesn't duplicate", () => {
    const c = planSectionClasses({ schoolCode: "S", section: defaultSection("secondary", "malawi"), rungs: { 1: 2 } });
    assert.deepEqual(c.map((x) => x.id), ["S_form1A", "S_form1B"]);
    assert.deepEqual(c.map((x) => x.data.name), ["Form 1A", "Form 1B"]);
  });

  it("names classes by curriculum and never collides across sections", () => {
    const kg = planSectionClasses({ schoolCode: "S", section: defaultSection("kindergarten", "abeka"), rungs: { 3: 0 } });
    const pri = planSectionClasses({ schoolCode: "S", section: defaultSection("primary", "cambridge"), rungs: { 1: 0 } });
    const sec = planSectionClasses({ schoolCode: "S", section: defaultSection("secondary", "abeka"), rungs: { 1: 0 } });
    assert.equal(kg[0].data.name, "K4");
    assert.equal(pri[0].data.name, "Year 1");
    assert.equal(sec[0].data.name, "Grade 7");
    assert.equal(new Set([kg[0].id, pri[0].id, sec[0].id]).size, 3);
    assert.equal(pri[0].data.section, "primary");
    assert.ok(pri[0].data.subjects.includes("Global Perspectives"));
  });
});

describe("renaming a subject", () => {
  it("moves every learner's mark to the new name", () => {
    const { marks, changed } = renameSubjectInMarks({ a: { Science: 60, English: 70 }, b: { English: 50 } }, "Science", "Integrated Science");
    assert.ok(changed);
    assert.deepEqual(marks.a, { English: 70, "Integrated Science": 60 });
    assert.deepEqual(marks.b, { English: 50 });
  });
  it("doesn't duplicate a subject already on the list", () => {
    assert.deepEqual(renameInList(["Maths", "Mathematics"], "Maths", "Mathematics"), ["Mathematics"]);
  });
});

describe("planTimetableImport", () => {
  const classes = [{ id: "c1", name: "Form 1A", subjects: ["Mathematics", "English"] }, { id: "c2", name: "Form 2", subjects: ["English"] }];
  const staff = [{ id: "t1", name: "Grace Banda", email: "grace@x.mw" }, { id: "t2", name: "John Phiri" }];
  const days = ["Monday", "Tuesday"];
  const periods = [{ number: 1, start: "07:30", end: "08:20" }, { number: 2, start: "08:30", end: "09:20" }];
  const row = (line, o) => ({ __line: line, ...o });

  it("builds periods, matching names loosely", () => {
    const r = planTimetableImport({
      rows: [row(2, { class: "form 1a", day: "mon", period: "P1", subject: "mathematics", teacher: "grace@x.mw", venue: "Lab" })],
      classes, staff, days, periods,
    });
    assert.deepEqual(r.errors, []);
    assert.equal(r.slots[0].subject, "Mathematics");
    assert.equal(r.slots[0].day, "Monday");
    assert.equal(r.slots[0].teacherId, "t1");
    assert.equal(r.slots[0].startTime, "07:30");
  });

  it("reports bad rows by line and skips empty periods", () => {
    const r = planTimetableImport({
      rows: [
        row(2, { class: "Form 9", day: "Mon", period: "1", subject: "English" }),
        row(3, { class: "Form 2", day: "Mon", period: "1", subject: "Mathematics" }),
        row(4, { class: "Form 2", day: "Tue", period: "2", subject: "", teacher: "", venue: "" }),
      ],
      classes, staff, days, periods,
    });
    assert.equal(r.errors.length, 2);
    assert.match(r.errors[0].message, /no class called "Form 9"/);
    assert.match(r.errors[1].message, /doesn't take "Mathematics"/);
    assert.equal(r.slots.length, 0);
  });

  it("finds a teacher double-booked against a class not in the file", () => {
    const r = planTimetableImport({
      rows: [row(2, { class: "Form 1A", day: "Monday", period: "1", subject: "English", teacher: "John Phiri" })],
      classes, staff, days, periods,
      existingSlots: [{ classId: "c2", className: "Form 2", day: "Monday", periodNumber: 1, teacherId: "t2", teacherName: "John Phiri" }],
    });
    assert.equal(r.clashes.length, 1);
  });

  it("matches days by their first three letters", () => {
    assert.equal(matchDay("TUES", days), "Tuesday");
    assert.equal(matchDay("Sat", days), null);
  });
});

describe("exam analysis on a non-MANEB scale", () => {
  it("spreads grades by the school's labels and gives no MSCE credit rate", () => {
    const rows = [{ id: "a", subjects: { English: { score: 95 } } }, { id: "b", subjects: { English: { score: 60 } } }];
    const [english] = analyseSubjects(rows, ABEKA_SCALE);
    assert.equal(english.dist.A, 1);
    assert.equal(english.dist.F, 1);
    assert.equal(english.passRate, 50);
    assert.equal(english.creditRate, null);
  });
});

describe("reading a timetable with the AI", () => {
  const classes = [{ id: "c1", name: "Form 1A", subjects: ["Mathematics", "English"] }];
  const staff = [{ id: "t1", name: "Grace Banda" }];
  const days = ["Monday", "Tuesday"];
  const periods = [{ number: 1, start: "07:30", end: "08:20" }, { number: 2, start: "08:30", end: "09:20" }];

  it("keeps every whole lesson from a reply cut off mid-way", () => {
    const rows = parseExtractedLessons('{"lessons": [["Form 1A", "Monday", 1, "Mathematics", "Grace Banda", "Lab"], ["Form 1A","Tue","2","English","",""], ["Form 1A", "Mon');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].period, "2");
    assert.equal(rows[0].__line, 1);
  });

  it("keeps a lesson whose teacher it can't match, without the teacher", () => {
    const rows = parseExtractedLessons('[["Form 1A","Monday",1,"Mathematics","Mr Unknown",""]]');
    const lenient = planTimetableImport({ rows, classes, staff, days, periods, strict: false });
    assert.equal(lenient.slots.length, 1);
    assert.equal(lenient.slots[0].teacherId, "");
    assert.equal(lenient.warnings.length, 1);
    const strict = planTimetableImport({ rows, classes, staff, days, periods });
    assert.equal(strict.slots.length, 0);
    assert.equal(strict.errors.length, 1);
  });
});
