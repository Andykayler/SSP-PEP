// Pure rules for a staff account's life: deactivating, reactivating, and a
// person moving from one school to another. No Firebase here — api/staff/account.js
// and tests/logic both use it.
//
// One person has one login (Firebase Auth is keyed by email) and one
// `users/{uid}` profile, which belongs to exactly one school at a time.
// Everything they record is stamped with that school's code, so what they did
// at a school stays with that school:
//
//   • Deactivated and reactivated at the same school → the same profile comes
//     back, and so does all of their work there.
//   • Taken on by a different school → they start that school as new staff.
//     The old school keeps a `former_staff` record of them; nothing of theirs
//     from the old school is visible at the new one.
//   • Taken back later by a school they worked at before → that school's
//     former_staff record is used to restore their profile, and their old
//     work there is theirs again.

/** Status values that mean "this person may not use the platform". */
export const INACTIVE_STATUSES = ["deactivated", "suspended"];

export function isDeactivated(profile) {
  return INACTIVE_STATUSES.includes(profile?.status);
}

/** Roles a school administrator may take on through User Management. */
export const HIREABLE_ROLES = ["director", "head_teacher", "class_teacher", "bursar", "librarian"];

/**
 * What should happen when `hiringSchool` asks to take on a person whose login
 * already exists. `profile` is their current users/{uid} data, or null when
 * the login has no profile at all.
 *
 * Returns { kind, message? }:
 *   "fresh"          no profile — create one for the hiring school
 *   "transfer"       deactivated elsewhere — archive there, start fresh here
 *   "same_school"    they already belong to this school — reactivate instead
 *   "active_elsewhere" still working at another school — refuse
 *   "not_staff"      a platform or school-owner account — refuse
 */
export function decideHire(profile, hiringSchool) {
  if (!profile) return { kind: "fresh" };
  if (profile.role === "superadmin" || profile.role === "admin") {
    return {
      kind: "not_staff",
      message: "That email belongs to a school administrator account and can't be added as staff.",
    };
  }
  if (profile.schoolCode === hiringSchool) {
    return {
      kind: "same_school",
      message: isDeactivated(profile)
        ? "This person already has an account at your school. Reactivate them from the staff list."
        : "This person is already on your staff list.",
    };
  }
  if (!isDeactivated(profile)) {
    return {
      kind: "active_elsewhere",
      message: "This email is in use by an active staff member at another school. That school must deactivate the account before you can add them.",
    };
  }
  return { kind: "transfer" };
}

// Fields that describe the person rather than their job at one school. These
// are the only things carried to a new school, and the hiring admin's form
// overrides each of them.
const PERSONAL_FIELDS = ["uid", "email", "name", "phone"];

// Fields that only make sense on a former_staff record or a deactivated profile.
const ARCHIVE_FIELDS = [
  "leftAt", "archivedFrom", "deactivatedAt", "deactivatedBy", "deactivatedByName",
];

/**
 * The profile a person starts with at `schoolCode`. `form` is what the hiring
 * admin entered; `restored` is the profile they had at this school before, if
 * they worked here once (from former_staff), so their work there continues.
 */
export function buildHiredProfile({ uid, email, form, schoolCode, restored = null }) {
  const base = restored ? { ...restored } : {};
  // Housekeeping from the archive must not leak back onto the live profile.
  for (const k of [...PERSONAL_FIELDS, ...ARCHIVE_FIELDS]) delete base[k];

  const wide = form.role === "director" || !!form.allCampuses;
  return {
    ...base,
    uid,
    email,
    name: form.name,
    role: form.role,
    phone: form.phone || "",
    schoolCode,
    allCampuses: wide,
    campusIds: wide ? [] : (form.campusIds || []),
    status: "active",
    mustChangePassword: true,
  };
}

/** The former_staff document id for a person who left `schoolCode`. */
export function formerStaffId(schoolCode, uid) {
  return `${schoolCode}__${uid}`;
}
