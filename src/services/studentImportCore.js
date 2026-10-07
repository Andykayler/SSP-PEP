// src/services/studentImportCore.js
// ─────────────────────────────────────────────────────────────────────────────
// The pure half of the student import: what columns a file may have, and how a
// row becomes a student with its guardians. No Firestore, so the browser and the
// tests share it. The writing lives in bulkImport.js.
// ─────────────────────────────────────────────────────────────────────────────
import { isDialablePhone } from "./phone.js";
import { pairGuardians, splitNames, splitPhones, decodeEntities } from "./guardians.js";

// ─── Column contracts ────────────────────────────────────────────────────────
// `key` is the normalised header (see csv.js), `label` is what the template
// writes out for a human to fill in.
// `present(headers)` lets a column be recognised under the names real files use:
// the headteacher's roll has "Guardians" and "Phone Numbers G1/G2", not our
// template's "Guardian Name"/"Guardian Phone".
const hasHeader = (re) => (headers) => headers.some((h) => re.test(h));
const isNameKey  = (k) => /guardian|parent/.test(k) && /name|^guardians?$|^parents?$/.test(k) && !/phone|email|relation/.test(k);
const isPhoneKey = (k) => /phone|mobile|whatsapp|contact|^tel/.test(k) && !/email/.test(k);
const isRelationKey = (k) => /relation/.test(k);

export const STUDENT_COLUMNS = [
  { key: "firstname",       label: "First Name",       required: true  },
  { key: "lastname",        label: "Last Name",        required: true  },
  { key: "gender",          label: "Gender",           required: true,  hint: "Male or Female" },
  { key: "dob",             label: "Date of Birth",    required: false, hint: "YYYY-MM-DD" },
  { key: "class",           label: "Class",            required: true,  hint: "Must match a class you have created" },
  { key: "guardianname",    label: "Guardian Name",    required: true,  hint: "Several guardians? Separate names with commas",
    present: (h) => h.some(isNameKey) },
  { key: "guardianphone",   label: "Guardian Phone",   required: true,  hint: "0991234567 or +265991234567. Several? Separate with commas, in the same order as the names",
    present: (h) => h.some(isPhoneKey) },
  { key: "guardianemail",   label: "Guardian Email",   required: false },
  { key: "guardianrelation",label: "Guardian Relation",required: false, hint: "Parent, Uncle, Grandmother…" },
  { key: "guardian2name",   label: "Guardian 2 Name",  required: false, hint: "Optional second guardian (or put both in Guardian Name)" },
  { key: "guardian2phone",  label: "Guardian 2 Phone", required: false },
  { key: "guardian2relation", label: "Guardian 2 Relation", required: false },
  { key: "nationalid",      label: "National ID",      required: false },
  { key: "district",        label: "District",         required: false },
  { key: "village",         label: "Village",          required: false },
];


const VALID_GENDER = { male: "Male", female: "Female", m: "Male", f: "Female" };

/** One example row, so the template is obviously fillable rather than abstract. */
export const STUDENT_SAMPLE = [
  "Chikondi", "Phiri", "Female", "2011-04-17", "Form 1",
  "Grace Banda", "0991234567", "", "Mother",
  "Joseph Phiri", "0881234567", "Father", "", "Ntcheu", "Chigodi",
];

/** True for a number that will actually reach a phone. */

/** True for a number that will actually reach a phone. */
export const phoneIsUsable = (raw) => isDialablePhone(raw);

/** "Year 2  Goal Getters", "year 2 goal getters" and "Year2 Goal-Getters" are one class. */
const classKeyOf = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Accepts YYYY-MM-DD and DD/MM/YYYY; returns the ISO form the app stores. */
export function normaliseDob(raw = "") {
  const s = String(raw).trim();
  if (!s) return { ok: true, value: "" };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoIfReal(m[1], m[2], m[3]);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return isoIfReal(m[3], m[2], m[1]);
  return { ok: false };
}

function isoIfReal(y, mo, d) {
  const yy = Number(y), mm = Number(mo), dd = Number(d);
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  const real = date.getUTCFullYear() === yy
            && date.getUTCMonth() === mm - 1
            && date.getUTCDate() === dd;
  if (!real) return { ok: false };
  const pad = (n) => String(n).padStart(2, "0");
  return { ok: true, value: `${yy}-${pad(mm)}-${pad(dd)}` };
}

// ─── Students ────────────────────────────────────────────────────────────────

/**
 * Turns parsed CSV rows into import-ready records, each carrying its own list
 * of problems. Nothing is written here — the caller shows the result first.
 *
 * `classes` and `existingStudents` are passed in rather than fetched so the
 * whole file costs one read of each, not one per row.
 */
export function validateStudentRows({ rows, classes, existingStudents }) {
  const byClassName = new Map((classes || []).map((c) => [classKeyOf(c.name), c]));

  // Same child twice in one file, and same child already on the roll.
  const seenInFile = new Map();
  const onRoll = new Set(
    (existingStudents || []).map((s) => `${String(s.fullName || "").trim().toLowerCase()}|${classKeyOf(s.className)}`)
  );

  return (rows || []).map((raw) => {
    const errors = [];
    const warnings = [];

    const firstName = decodeEntities(raw.firstname || "").replace(/\s+/g, " ").trim();
    const lastName  = decodeEntities(raw.lastname  || "").replace(/\s+/g, " ").trim();
    if (!firstName) errors.push("First name is missing.");
    if (!lastName)  errors.push("Last name is missing.");

    const gender = VALID_GENDER[(raw.gender || "").trim().toLowerCase()];
    if (!gender) errors.push(`Gender must be Male or Female (got "${raw.gender || ""}").`);

    const dob = normaliseDob(raw.dob);
    if (!dob.ok) errors.push(`Date of birth "${raw.dob}" is not a real date — use YYYY-MM-DD.`);

    const classKey = classKeyOf(raw.class);
    const cls = byClassName.get(classKey);
    if (!classKey) errors.push("Class is missing.");
    else if (!cls) errors.push(`No class called "${raw.class}" — create it in School Settings first.`);

    // Every guardian cell in the row, however the file lays them out: one
    // "Guardians" cell holding both parents, a column per guardian, or both.
    const keys = Object.keys(raw);
    const names = keys.filter(isNameKey).flatMap((k) => splitNames(raw[k]));
    const phones = keys.filter(isPhoneKey).flatMap((k) => splitPhones(raw[k]));
    const relations = keys.filter(isRelationKey).flatMap((k) => splitNames(raw[k]));
    const { guardians, rejected, unmatched } = pairGuardians({ names, phones, relations });

    // A child is never turned away over contact details: they are enrolled and
    // the problem is flagged, so the school can add a number later. (A school
    // that skipped these rows would have children missing from the roll.)
    if (names.length === 0) warnings.push("Guardian name is missing.");
    if (phones.length === 0) warnings.push("No guardian phone — the family can't be messaged until one is added.");
    else if (guardians.length === 0) {
      warnings.push(`No usable guardian number (${rejected.map((r) => r.reason).join("; ")}) — `
        + "the family can't be messaged until one is added.");
    }
    for (const r of guardians.length > 0 ? rejected : []) {
      warnings.push(`Skipped ${r.name ? `${r.name}'s` : "a"} number — ${r.reason}.`);
    }
    if (unmatched.length) warnings.push(`No phone number for ${unmatched.join(", ")}.`);
    guardians.forEach((g, i) => { if (!g.name) g.name = names[0] || `Guardian ${i + 1}`; });
    const guardianName = guardians[0]?.name || names[0] || "";

    const email = (raw.guardianemail || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push("Guardian email looks wrong — it will be skipped.");
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const dupKey = `${fullName.toLowerCase()}|${classKey}`;
    if (fullName && classKey) {
      if (seenInFile.has(dupKey)) {
        warnings.push(`Same name and class as line ${seenInFile.get(dupKey)} in this file — check it isn't entered twice.`);
      } else {
        seenInFile.set(dupKey, raw.__line);
        if (onRoll.has(dupKey)) {
          warnings.push("A student with this name is already in this class — check it isn't a duplicate.");
        }
      }
    }

    return {
      line: raw.__line,
      errors,
      warnings,
      valid: errors.length === 0,
      data: {
        firstName, lastName, fullName, gender,
        dob: dob.ok ? dob.value : "",
        classId: cls?.id || "",
        className: cls?.name || (raw.class || "").trim(),
        guardians,
        guardianName,
        guardianPhone: guardians[0]?.phone || "",
        guardianEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
        guardianRelation: guardians[0]?.relation || "Parent/Guardian",
        nationalId: (raw.nationalid || "").trim(),
        district: (raw.district || "").trim(),
        village: (raw.village || "").trim(),
      },
    };
  });
}

