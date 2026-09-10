// src/services/bulkImport.js
// ─────────────────────────────────────────────────────────────────────────────
// Loading a whole school in one go.
//
// Registering students one at a time through a fifteen-field form is roughly
// two days of typing for a six-hundred-pupil school, and that is where a pilot
// dies — before anybody has seen the system do anything useful. Every school
// already has the roll in a spreadsheet or an exercise book, so the job is to
// accept what they have rather than make them retype it.
//
// ── Validate everything, then write ─────────────────────────────────────────
// The whole file is checked before a single document is created, and the
// result is shown as a table the clerk can read. A half-imported roll is much
// worse than a rejected one: nobody can tell which rows landed, and re-running
// the file duplicates whatever did.
//
// ── Guardians are grouped, not repeated ─────────────────────────────────────
// Rows are grouped by normalised phone so a family sharing a number resolves to
// one credential and one message, however many children are in the file. See
// `guardianLink.js` for why an attach to an *existing* guardian lands pending.
// ─────────────────────────────────────────────────────────────────────────────
import { db, auth } from "../firebase";
import {
  collection, doc, writeBatch, setDoc, serverTimestamp,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

import { normalisePhone } from "./phone";
import { generatePassword, generateStudentCode } from "./credentials";
import { lookupSiblingsByPhone } from "./studentLookup";
import {
  resolveGuardianLink, notifyGuardianOfPendingLink, enrolmentSms,
  LINK_ACTIVE, LINK_PENDING,
} from "./guardianLink";

// ─── Column contracts ────────────────────────────────────────────────────────
// `key` is the normalised header (see csv.js), `label` is what the template
// writes out for a human to fill in.
export const STUDENT_COLUMNS = [
  { key: "firstname",       label: "First Name",       required: true  },
  { key: "lastname",        label: "Last Name",        required: true  },
  { key: "gender",          label: "Gender",           required: true,  hint: "Male or Female" },
  { key: "dob",             label: "Date of Birth",    required: false, hint: "YYYY-MM-DD" },
  { key: "class",           label: "Class",            required: true,  hint: "Must match a class you have created" },
  { key: "guardianname",    label: "Guardian Name",    required: true  },
  { key: "guardianphone",   label: "Guardian Phone",   required: true,  hint: "0991234567 or +265991234567" },
  { key: "guardianemail",   label: "Guardian Email",   required: false },
  { key: "guardianrelation",label: "Guardian Relation",required: false, hint: "Parent, Uncle, Grandmother…" },
  { key: "nationalid",      label: "National ID",      required: false },
  { key: "district",        label: "District",         required: false },
  { key: "village",         label: "Village",          required: false },
];

export const STAFF_COLUMNS = [
  { key: "name",  label: "Full Name", required: true },
  { key: "email", label: "Email",     required: true, hint: "Used to sign in" },
  { key: "role",  label: "Role",      required: true, hint: "head_teacher, class_teacher, bursar or librarian" },
  { key: "phone", label: "Phone",     required: false },
];

const VALID_ROLES  = ["head_teacher", "class_teacher", "bursar", "librarian"];
const VALID_GENDER = { male: "Male", female: "Female", m: "Male", f: "Female" };

/** One example row, so the template is obviously fillable rather than abstract. */
export const STUDENT_SAMPLE = [
  "Chikondi", "Phiri", "Female", "2011-04-17", "Form 1",
  "Grace Banda", "0991234567", "", "Mother", "", "Ntcheu", "Chigodi",
];
export const STAFF_SAMPLE = ["James Mwale", "j.mwale@example.com", "class_teacher", "0888606204"];

// ─── Shared validation helpers ───────────────────────────────────────────────

/** True for a number that will actually reach a phone and match in the app. */
function phoneIsUsable(raw) {
  return /^\+265[89]\d{8}$/.test(normalisePhone(raw));
}

/** Accepts YYYY-MM-DD and DD/MM/YYYY; returns the ISO form the app stores. */
function normaliseDob(raw = "") {
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
  const byClassName = new Map(
    (classes || []).map((c) => [String(c.name || "").trim().toLowerCase(), c])
  );

  // Same child twice in one file, and same child already on the roll.
  const seenInFile = new Map();
  const onRoll = new Set(
    (existingStudents || []).map((s) =>
      `${String(s.fullName || "").trim().toLowerCase()}|${String(s.className || "").trim().toLowerCase()}`
    )
  );

  return (rows || []).map((raw) => {
    const errors = [];
    const warnings = [];

    const firstName = (raw.firstname || "").trim();
    const lastName  = (raw.lastname  || "").trim();
    if (!firstName) errors.push("First name is missing.");
    if (!lastName)  errors.push("Last name is missing.");

    const gender = VALID_GENDER[(raw.gender || "").trim().toLowerCase()];
    if (!gender) errors.push(`Gender must be Male or Female (got "${raw.gender || ""}").`);

    const dob = normaliseDob(raw.dob);
    if (!dob.ok) errors.push(`Date of birth "${raw.dob}" is not a real date — use YYYY-MM-DD.`);

    const classKey = (raw.class || "").trim().toLowerCase();
    const cls = byClassName.get(classKey);
    if (!classKey) errors.push("Class is missing.");
    else if (!cls) errors.push(`No class called "${raw.class}" — create it in School Settings first.`);

    const guardianName = (raw.guardianname || "").trim();
    if (!guardianName) errors.push("Guardian name is missing.");

    const phoneRaw = (raw.guardianphone || "").trim();
    const phone = normalisePhone(phoneRaw);
    if (!phoneRaw) errors.push("Guardian phone is missing.");
    else if (!phoneIsUsable(phoneRaw)) {
      errors.push(`"${phoneRaw}" is not a usable Malawian mobile number — the guardian will never be able to sign in.`);
    }

    const email = (raw.guardianemail || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push("Guardian email looks wrong — it will be skipped.");
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const dupKey = `${fullName.toLowerCase()}|${classKey}`;
    if (fullName && classKey) {
      if (seenInFile.has(dupKey)) {
        errors.push(`Same name and class as row ${seenInFile.get(dupKey)} in this file.`);
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
        guardianName,
        guardianPhone: phone,
        guardianEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
        guardianRelation: (raw.guardianrelation || "").trim() || "Parent/Guardian",
        nationalId: (raw.nationalid || "").trim(),
        district: (raw.district || "").trim(),
        village: (raw.village || "").trim(),
      },
    };
  });
}

/**
 * Writes the valid rows.
 *
 * Guardians are resolved once per distinct phone number against the roll as it
 * stood *before* the import, so two siblings in the same file share one
 * credential instead of racing to create two.
 *
 * Documents go out in batched writes; the messages that follow are sent one at
 * a time and are allowed to fail without taking the import down with them —
 * a student who exists but whose guardian missed the SMS is recoverable, a
 * student who was never created is not.
 */
export async function importStudents({
  rows, schoolCode, schoolName, sendSms, appUrl, onProgress,
}) {
  const valid = rows.filter((r) => r.valid);
  if (valid.length === 0) return { created: 0, families: 0, pending: 0, messages: [], failed: [] };

  // One read of every student already attached to any phone in this file.
  const phones = [...new Set(valid.map((r) => r.data.guardianPhone))];
  const siblingsByPhone = await fetchSiblings(phones);

  // Resolve each family once, then let later rows for that family reuse it.
  const familyByPhone = new Map();
  for (const phone of phones) {
    familyByPhone.set(
      phone,
      await resolveGuardianLink({ phone, siblings: siblingsByPhone.get(phone) || [] })
    );
  }

  const created = [];
  const failed = [];

  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < valid.length; i += 400) {
    const chunk = valid.slice(i, i + 400);
    const batch = writeBatch(db);

    chunk.forEach((row) => {
      const link = familyByPhone.get(row.data.guardianPhone);
      const studentCode = generateStudentCode();
      const ref = doc(collection(db, "students"));

      batch.set(ref, {
        studentCode,
        ...row.data,
        schoolCode, schoolName,
        status: "active",
        parentPortalPassword: link.password,
        // A family new to ACALink is trusted immediately — there is no account
        // to protect yet. An existing guardian must confirm. See guardianLink.js.
        guardianLinkStatus: link.isNewGuardian ? LINK_ACTIVE : LINK_PENDING,
        guardianLinkRequestedAt: serverTimestamp(),
        transferHistory: [{
          schoolCode, schoolName,
          joinedAt: new Date().toISOString(),
          action: "enrolled",
        }],
        createdAt: serverTimestamp(),
        createdVia: "bulk_import",
      });

      created.push({ id: ref.id, studentCode, row, link });
    });

    try {
      await batch.commit();
      onProgress?.({ done: Math.min(i + chunk.length, valid.length), total: valid.length });
    } catch (err) {
      chunk.forEach((row) => failed.push({ line: row.line, error: err.message }));
    }
  }

  // ── Messages, one per family rather than one per child ──
  const messages = [];
  const notified = new Set();

  for (const entry of created) {
    const { link, row } = entry;
    if (notified.has(link.phone)) continue;
    notified.add(link.phone);

    const kids = created.filter((c) => c.link.phone === link.phone);
    const names = kids.map((k) => k.row.data.fullName).join(", ");

    if (!link.isNewGuardian) {
      // In-app + push, so it lands in the account they already have.
      await notifyGuardianOfPendingLink({
        schoolCode, schoolName,
        studentId: entry.id,
        studentName: names,
        phone: link.phone,
      });
    }

    if (sendSms) {
      try {
        const res = await sendSms(link.phone, enrolmentSms({
          link, schoolName,
          studentName: names,
          className: row.data.className,
          studentCode: kids.map((k) => k.studentCode).join(", "),
          appUrl,
        }));
        messages.push({ phone: link.phone, sent: !!res?.success });
      } catch {
        messages.push({ phone: link.phone, sent: false });
      }
    }
  }

  return {
    created: created.length,
    families: notified.size,
    pending: created.filter((c) => !c.link.isNewGuardian).length,
    messages,
    failed,
  };
}

/**
 * Every student already attached to any of these phone numbers.
 * Firestore's `in` filter takes 30 values, so this chunks.
 */
async function fetchSiblings(phones) {
  // Server-side, for the same reason as guardianLink.siblingsForPhone: this
  // query spans every school on the platform, and allowing it from the client
  // meant allowing a blanket cross-school read of every child. The endpoint
  // does its own chunking. See api/students/lookup.js.
  const byPhone = new Map(phones.map((p) => [p, []]));
  if (phones.length === 0) return byPhone;

  const found = await lookupSiblingsByPhone(phones);
  for (const [phone, list] of Object.entries(found)) {
    if (byPhone.has(phone)) byPhone.set(phone, list);
  }
  return byPhone;
}

// ─── Staff ───────────────────────────────────────────────────────────────────

export function validateStaffRows({ rows, existingUsers }) {
  const seenInFile = new Map();
  const taken = new Set(
    (existingUsers || []).map((u) => String(u.email || "").trim().toLowerCase())
  );

  return (rows || []).map((raw) => {
    const errors = [];
    const warnings = [];

    const name = (raw.name || "").trim();
    if (!name || name.length < 2) errors.push("Full name is missing.");

    const email = (raw.email || "").trim().toLowerCase();
    if (!email) errors.push("Email is missing.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`"${raw.email}" is not a valid email.`);
    else if (seenInFile.has(email)) errors.push(`Same email as row ${seenInFile.get(email)} in this file.`);
    else if (taken.has(email)) errors.push("Someone at this school already uses this email.");
    else seenInFile.set(email, raw.__line);

    const role = (raw.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!role) errors.push("Role is missing.");
    else if (!VALID_ROLES.includes(role)) {
      errors.push(`Role must be one of: ${VALID_ROLES.join(", ")} (got "${raw.role}").`);
    }

    const phoneRaw = (raw.phone || "").trim();
    if (phoneRaw && !phoneIsUsable(phoneRaw)) {
      warnings.push("Phone number looks wrong — the welcome SMS will be skipped.");
    }

    return {
      line: raw.__line,
      errors,
      warnings,
      valid: errors.length === 0,
      data: {
        name, email, role,
        phone: phoneIsUsable(phoneRaw) ? normalisePhone(phoneRaw) : "",
      },
    };
  });
}

/**
 * Creates staff accounts.
 *
 * Auth users have to be created one at a time — there is no batch API on the
 * client — but all of them go through a *single* secondary Firebase app.
 * `createUserWithEmailAndPassword` signs the caller in as whoever it just
 * created, so running it on the primary instance would throw the admin out of
 * their own session on the first row; spinning up a fresh app per row instead
 * would work but costs an initialise-and-tear-down for every teacher.
 *
 * A row that fails is recorded and the import carries on. One duplicate email
 * in the middle of a file must not cost the other forty accounts.
 */
export async function importStaff({
  rows, schoolCode, schoolName, sendSms, sendEmail, emailTemplateId, appUrl, onProgress,
}) {
  const valid = rows.filter((r) => r.valid);
  if (valid.length === 0) return { created: 0, failed: [], credentials: [] };

  const secondaryApp = initializeApp(auth.app.options, `BulkImport-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);

  const credentials = [];
  const failed = [];

  try {
    for (let i = 0; i < valid.length; i++) {
      const row = valid[i];
      const password = generatePassword();

      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, row.data.email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          name: row.data.name,
          email: row.data.email,
          role: row.data.role,
          phone: row.data.phone,
          schoolCode,
          status: "active",
          mustChangePassword: true,
          createdAt: serverTimestamp(),
          createdVia: "bulk_import",
        });
        credentials.push({ ...row.data, password });
      } catch (err) {
        failed.push({
          line: row.line,
          email: row.data.email,
          error: err.code === "auth/email-already-in-use"
            ? "This email is already registered on ACALink."
            : err.message,
        });
      }

      onProgress?.({ done: i + 1, total: valid.length });
    }
  } finally {
    // Always torn down: the secondary app holds a session for whoever was
    // created last, and leaving it alive leaks that into the tab.
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }

  // Credentials go out after every account exists, so a failure here leaves
  // accounts that can be resent to rather than accounts that were never made.
  for (const c of credentials) {
    if (sendEmail && emailTemplateId) {
      await sendEmail({
        templateId: emailTemplateId,
        toEmail: c.email,
        toName: c.name,
        params: {
          school_name: schoolName,
          user_role: c.role,
          login_email: c.email,
          password: c.password,
          login_url: `${appUrl}/login`,
        },
      }).catch(() => {});
    }
    if (sendSms && c.phone) {
      await sendSms(
        c.phone,
        `Welcome to ${schoolName}!\nYour ACALink account is ready.\nEmail: ${c.email}\nPassword: ${c.password}\nLogin: ${appUrl}/login\n\nChange your password after first login.`
      ).catch(() => {});
    }
  }

  return { created: credentials.length, failed, credentials };
}
