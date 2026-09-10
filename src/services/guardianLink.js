// src/services/guardianLink.js
// ─────────────────────────────────────────────────────────────────────────────
// One guardian, one password, however many children — and a confirmation step
// before a school can attach a child to a guardian who already exists.
//
// ── The problem this solves ─────────────────────────────────────────────────
// Enrolment used to mint a fresh `parentPortalPassword` for every student. A
// guardian with three children therefore had three passwords, any one of which
// unlocked all three — so the credential was really the phone number, and the
// password was decoration. Worse, the passwords were *school-issued*: a family
// moving a child to a second school got a second set of credentials for the
// same person.
//
// Now the first child a guardian ever enrols creates the credential, and every
// later child — at that school or any other — is attached to the credential
// they already have. Nothing new is sent, because there is nothing new to send.
//
// ── Why the confirmation step ───────────────────────────────────────────────
// Attaching on a phone-number match means a clerk's typo hands a child to a
// stranger's account, silently. So an attach to an *existing* guardian lands as
// `pending`: the guardian is told, and the child's records stay hidden until
// they enter their own password in the app. A wrong number then fails safe —
// the stranger cannot confirm a child they were not expecting, and the real
// guardian never sees the record appear.
//
// The first child is exempt. There is no existing account to protect and no
// password the guardian could possibly know yet, so requiring confirmation
// would lock every new family out of the system entirely.
//
// ── On legacy rows ──────────────────────────────────────────────────────────
// Students enrolled before this existed have no `guardianLinkStatus`. Missing
// is read as active, deliberately: they work today, and retro-flagging them
// pending would demand a confirmation from every existing family at once.
// ─────────────────────────────────────────────────────────────────────────────
import { normalisePhone } from "./phone";
import { generatePassword } from "./credentials";
import { lookupSiblingsByPhone } from "./studentLookup";
import { pushNotification, parentRecipientId } from "./notifications";

export const LINK_ACTIVE  = "active";
export const LINK_PENDING = "pending";

/** Missing status means a row predates this feature — those already work. */
export function isLinkActive(student) {
  return (student?.guardianLinkStatus || LINK_ACTIVE) === LINK_ACTIVE;
}

export function isLinkPending(student) {
  return student?.guardianLinkStatus === LINK_PENDING;
}

/**
 * Every student already attached to this phone number, across every school.
 *
 * Deliberately not scoped to a school code: the whole point is that a guardian
 * is one person platform-wide, and a second school enrolling their child must
 * find the account the first school created.
 */
export async function siblingsForPhone(phone) {
  const normalised = normalisePhone(phone);
  if (!normalised) return [];
  // Asked of the server rather than queried directly. A client query on
  // guardianPhone spans every school, which is the point of the feature — but
  // permitting it in firestore.rules meant permitting a blanket cross-school
  // read of every child on the platform. See api/students/lookup.js.
  const byPhone = await lookupSiblingsByPhone([normalised]);
  return byPhone[normalised] || [];
}

/**
 * Decides what credential and link status a newly enrolled student should get.
 *
 * Returns everything the caller needs to write the student document and to
 * word the message that goes out — the two differ completely between a brand
 * new guardian (here is your password) and an existing one (confirm this
 * child), and getting them the wrong way round is the difference between a
 * useful SMS and a confusing one.
 *
 * `siblings` may be passed in by a bulk import that has already fetched the
 * whole roll, so a 600-row file does not issue 600 identical queries.
 */
export async function resolveGuardianLink({ phone, siblings }) {
  const normalised = normalisePhone(phone);
  const existing = siblings ?? (await siblingsForPhone(normalised));

  if (existing.length === 0) {
    return {
      phone: normalised,
      status: LINK_ACTIVE,
      password: generatePassword(),
      isNewGuardian: true,
      siblingCount: 0,
      guardianName: "",
    };
  }

  // Reuse the family's existing password rather than issuing another. Prefer a
  // confirmed sibling: a pending one's password has never been proven to be in
  // the guardian's hands, so seeding from it could propagate a wrong number.
  const source = existing.find(isLinkActive) || existing[0];

  return {
    phone: normalised,
    status: LINK_PENDING,
    password: source.parentPortalPassword || "",
    isNewGuardian: false,
    siblingCount: existing.length,
    guardianName: source.guardianName || "",
    sourceStudentId: source.id,
  };
}

/**
 * Tells a guardian a school has attached a child to their account, and that it
 * stays hidden until they confirm.
 *
 * Sent as a normal notification document, so the existing Cloud Function
 * pushes it to their phone without any new delivery path. Never throws — a
 * failed notice must not fail the enrolment that triggered it.
 */
export async function notifyGuardianOfPendingLink({
  schoolCode, schoolName, studentId, studentName, phone,
}) {
  try {
    await pushNotification({
      schoolCode,
      recipientId: parentRecipientId(normalisePhone(phone)),
      title: `Confirm ${studentName}`,
      body: `${schoolName} has added ${studentName} to your ACALink account. `
          + `Open the app and enter your password to see their records. `
          + `If you were not expecting this, contact the school.`,
      category: "system",
      priority: "high",
      actorName: schoolName,
      entityType: "guardian_link",
      entityId: studentId,
      studentId,
      studentName,
      tab: "overview",
    });
  } catch (err) {
    console.error("[guardianLink] pending notice failed:", err);
  }
}

/** The SMS body for each case. Kept here so both enrolment paths word it alike. */
export function enrolmentSms({ link, schoolName, studentName, className, studentCode }) {
  if (link.isNewGuardian) {
    return `${schoolName}: ${studentName} has been enrolled in ${className || "school"}.\n`
         + `Student Code: ${studentCode}\n`
         + `ACALink login — Phone: ${link.phone}\nPassword: ${link.password}\n`
         + `One password covers all your children, at any school on ACALink.\n`
         + `Keep this code safe — it's used for transfers too.`;
  }
  return `${schoolName}: ${studentName} has been enrolled in ${className || "school"}.\n`
       + `Student Code: ${studentCode}\n`
       + `${studentName} has been added to your existing ACALink account. `
       + `Open the app and confirm with your password to see their records. `
       + `You do NOT need a new password.\n`
       + `If you were not expecting this, contact the school.`;
}
