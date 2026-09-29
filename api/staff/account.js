// api/staff/account.js
// ─────────────────────────────────────────────────────────────────────────────
// A staff account's life after it is created. POST /api/staff/account
//
//   { action: "deactivate", uid }   Stop someone using the platform. Their
//                                   profile and everything they recorded stay
//                                   with the school; the login is disabled and
//                                   every open session is signed out.
//   { action: "reactivate", uid }   Let them back in at the same school. The
//                                   same profile, so their work carries on.
//   { action: "hire", email, name, role, phone, allCampuses, campusIds }
//                                   Take on someone whose email already has a
//                                   login — the new-account path in User
//                                   Management sends people here when Firebase
//                                   reports the email as taken. See
//                                   src/services/staffAccountCore.js for the
//                                   rules; in short, they must be deactivated
//                                   wherever they were, and they start this
//                                   school with nothing from the last one.
//
// Staff accounts are never deleted. Deleting one would orphan everything they
// recorded (registers, marks, lesson plans) and free their email for someone
// else to inherit their history.
//
// Runs on the Admin SDK because it has to touch Firebase Auth (disable/enable
// the login, set a new temporary password) and, for a transfer, rewrite a
// profile that belongs to another school — neither of which rules allow.
// ─────────────────────────────────────────────────────────────────────────────
import { randomInt } from "node:crypto";
import { adminAuth, adminDb, FieldValue } from "../_lib/firebaseAdmin.js";
import { readBody, requireStaff } from "../_lib/auth.js";
import {
  decideHire, buildHiredProfile, formerStaffId, isDeactivated, HIREABLE_ROLES,
} from "../../src/services/staffAccountCore.js";
import { normalisePhone } from "../../src/services/phone.js";
import { handleRename } from "../_lib/schoolRename.js";

/** Readable temporary password, same shape as the one the admin page makes. */
function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += alphabet[randomInt(alphabet.length)];
  return `${out}!${randomInt(10, 99)}`;
}

const fail = (res, status, error) => res.status(status).json({ error });

/** Load a target profile and check it belongs to the caller's school. */
async function loadOwnStaff(uid, schoolCode) {
  if (!uid || typeof uid !== "string") return { error: [400, "Which account?"] };
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists || snap.data().schoolCode !== schoolCode) {
    return { error: [404, "That account isn't on your school's staff list."] };
  }
  return { ref, profile: snap.data() };
}

async function deactivate(res, caller, uid) {
  if (uid === caller.uid) return fail(res, 400, "You can't deactivate your own account.");
  const { ref, profile, error } = await loadOwnStaff(uid, caller.user.schoolCode);
  if (error) return fail(res, ...error);
  if (profile.role === "admin") return fail(res, 400, "The school administrator account can't be deactivated here.");

  await ref.update({
    status: "deactivated",
    deactivatedAt: FieldValue.serverTimestamp(),
    deactivatedBy: caller.uid,
    deactivatedByName: caller.user.name || "Administrator",
  });
  // Disable first, then revoke: a revoked session can't mint a new token, and
  // a disabled login can't start a new one.
  await adminAuth.updateUser(uid, { disabled: true }).catch((e) => {
    if (e.code !== "auth/user-not-found") throw e;
  });
  await adminAuth.revokeRefreshTokens(uid).catch(() => {});
  return res.status(200).json({ ok: true, status: "deactivated" });
}

async function reactivate(res, caller, uid) {
  const { ref, profile, error } = await loadOwnStaff(uid, caller.user.schoolCode);
  if (error) return fail(res, ...error);
  if (!isDeactivated(profile)) return res.status(200).json({ ok: true, status: profile.status || "active" });

  await ref.update({
    status: "active",
    reactivatedAt: FieldValue.serverTimestamp(),
    reactivatedBy: caller.uid,
    deactivatedAt: FieldValue.delete(),
    deactivatedBy: FieldValue.delete(),
    deactivatedByName: FieldValue.delete(),
  });
  await adminAuth.updateUser(uid, { disabled: false });
  return res.status(200).json({ ok: true, status: "active" });
}

async function hire(res, caller, body) {
  const schoolCode = caller.user.schoolCode;
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = String(body.role || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Enter a valid email.");
  if (name.length < 2) return fail(res, 400, "Enter their full name.");
  if (!HIREABLE_ROLES.includes(role)) return fail(res, 400, "Choose a staff role.");

  let authUser;
  try {
    authUser = await adminAuth.getUserByEmail(email);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      return fail(res, 404, "No existing account uses that email — add them as a new staff member.");
    }
    throw e;
  }
  const uid = authUser.uid;
  const userRef = adminDb.collection("users").doc(uid);
  const current = await userRef.get();
  const profile = current.exists ? current.data() : null;

  const decision = decideHire(profile, schoolCode);
  if (decision.kind !== "fresh" && decision.kind !== "transfer") {
    return fail(res, 409, decision.message);
  }

  // If they worked at THIS school before, that record brings their profile
  // (assignments, campus access, settings) back so their old work continues.
  const returningRef = adminDb.collection("former_staff").doc(formerStaffId(schoolCode, uid));
  const returning = await returningRef.get();

  const next = buildHiredProfile({
    uid,
    email,
    schoolCode,
    form: {
      name,
      role,
      phone: normalisePhone(body.phone || ""),
      allCampuses: !!body.allCampuses,
      campusIds: Array.isArray(body.campusIds) ? body.campusIds.filter((x) => typeof x === "string") : [],
    },
    restored: returning.exists ? returning.data().profile : null,
  });

  const batch = adminDb.batch();
  if (decision.kind === "transfer") {
    // The school they're leaving keeps a record of who they were there.
    batch.set(adminDb.collection("former_staff").doc(formerStaffId(profile.schoolCode, uid)), {
      uid,
      schoolCode: profile.schoolCode,
      name: profile.name || "",
      email: profile.email || email,
      role: profile.role || "",
      phone: profile.phone || "",
      leftAt: FieldValue.serverTimestamp(),
      profile: { ...profile, archivedFrom: profile.schoolCode },
    });
  }
  if (returning.exists) batch.delete(returningRef);
  // set() without merge: nothing from the previous school survives on the
  // live profile except what buildHiredProfile put there.
  batch.set(userRef, {
    ...next,
    createdAt: FieldValue.serverTimestamp(),
    hiredBy: caller.uid,
    ...(returning.exists ? { rehiredAt: FieldValue.serverTimestamp() } : {}),
  });
  await batch.commit();

  const password = tempPassword();
  await adminAuth.updateUser(uid, { password, disabled: false, displayName: name });
  await adminAuth.revokeRefreshTokens(uid).catch(() => {});

  return res.status(200).json({
    ok: true,
    uid,
    password,
    returning: returning.exists,
    transferred: decision.kind === "transfer",
  });
}

export default async function handler(req, res) {
  // Class and subject renames share this function to stay inside the Hobby
  // plan's 12-function limit: POST /api/staff/account?op=rename.
  if (req.query?.op === "rename") return handleRename(req, res);

  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  const caller = await requireStaff(req, { roles: ["admin"] });
  if (!caller.ok) return fail(res, caller.status, caller.error);
  if (!caller.user.schoolCode) return fail(res, 403, "Your account isn't attached to a school.");

  const body = readBody(req);
  if (!body) return fail(res, 400, "Bad request.");

  try {
    switch (body.action) {
      case "deactivate": return await deactivate(res, caller, body.uid);
      case "reactivate": return await reactivate(res, caller, body.uid);
      case "hire": return await hire(res, caller, body);
      default: return fail(res, 400, "Unknown action.");
    }
  } catch (err) {
    console.error(`[staff/account] ${body.action} failed:`, err);
    return fail(res, 500, "Something went wrong. Please try again.");
  }
}
