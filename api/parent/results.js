// api/parent/results.js
// ─────────────────────────────────────────────────────────────────────────────
// A child's results for the current term, for the parent app.
// POST /api/parent/results   { studentId, phone }
//
// WHY THIS IS AN ENDPOINT
//
// Results are withheld from a family that owes fees, unless the bursar has
// released them (src/services/resultsAccessCore.js). The mark sheets the
// results come from (`ca_marks`) are one document per class and component,
// holding every child's marks — so a security rule can only show or hide the
// whole sheet, never one child's row. Gating per child therefore has to happen
// somewhere that can compute the child's balance and hand back only their own
// marks. That is here; firestore.rules no longer lets the parent app read
// ca_marks or report_cards directly.
//
// A side effect worth having: a guardian now receives their own child's marks
// and rank, not every classmate's marks as before.
//
// The caller is the parent app's anonymous session. It carries no identity of
// its own, so the request names the child and the guardian phone the family
// signed in with, and the phone must match the child's record.
// ─────────────────────────────────────────────────────────────────────────────
import { adminAuth, adminDb } from "../_lib/firebaseAdmin.js";
import { readBody } from "../_lib/auth.js";
import { confirmGuardianLink } from "../_lib/guardianLink.js";
import { computeStudentBalance, getCurrentTerm } from "../_lib/feeBalance.js";
import { normalisePhone } from "../../src/services/phone.js";
import { isGuardianPhone } from "../../src/services/guardians.js";
import { resultsAccess, withheldMessage, releaseId, RELEASES } from "../../src/services/resultsAccessCore.js";
import { childResults } from "../../src/services/resultsCore.js";
import { scaleForClass } from "../../src/services/curriculumCore.js";
import { isDeactivated } from "../../src/services/staffAccountCore.js";

const fail = (res, status, error) => res.status(status).json({ error });

const toIso = (v) => (v?.toDate ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : null);

async function caller(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: [401, "Sign in again."] };
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { error: [401, "Your session has expired. Sign in again."] };
  }
  if (decoded.firebase?.sign_in_provider === "anonymous") return { parent: true };
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  const user = snap.exists ? snap.data() : null;
  if (!user || isDeactivated(user)) return { error: [403, "This account can't view results."] };
  return { staff: user };
}

export default async function handler(req, res) {
  // POST /api/parent/confirm is rewritten here (vercel.json) so guardian link
  // confirmation doesn't cost a function of its own.
  if (req.query?.task === "confirm") return confirmGuardianLink(req, res);
  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  const who = await caller(req);
  if (who.error) return fail(res, ...who.error);

  const body = readBody(req);
  const studentId = String(body?.studentId || "");
  if (!studentId) return fail(res, 400, "Which child?");

  try {
    const snap = await adminDb.collection("students").doc(studentId).get();
    if (!snap.exists) return fail(res, 404, "We couldn't find that student.");
    const student = { id: snap.id, ...snap.data() };

    if (who.parent) {
      const phone = normalisePhone(body.phone || "");
      if (!phone || !isGuardianPhone(student, phone)) {
        return fail(res, 403, "This child isn't linked to your phone number.");
      }
    } else if (who.staff.schoolCode !== student.schoolCode) {
      return fail(res, 403, "That student isn't at your school.");
    }

    const schoolCode = student.schoolCode;
    const term = await getCurrentTerm(schoolCode);
    if (!term || !student.classId) {
      return res.status(200).json({ term, withheld: false, subjects: [], reportCard: null, overallAverage: null, rank: null, classSize: 0 });
    }

    const [balanceInfo, releaseSnap, clearanceSnap] = await Promise.all([
      computeStudentBalance(student),
      adminDb.collection(RELEASES).doc(releaseId(schoolCode, student.id, term)).get(),
      adminDb.collection("fee_clearance").doc(`${schoolCode}__${student.id}__${term}`).get(),
    ]);
    const balance = balanceInfo?.balance || 0;
    const release = releaseSnap.exists ? releaseSnap.data() : null;
    const clearance = clearanceSnap.exists ? clearanceSnap.data() : null;

    const access = resultsAccess({ balance, release, clearance, term });
    if (!access.visible) {
      return res.status(200).json({
        term,
        withheld: true,
        reason: access.reason,
        balance: access.reason === "balance" ? balance : 0,
        message: withheldMessage({ reason: access.reason, balance, term, clearance }),
        subjects: [], reportCard: null, overallAverage: null, rank: null, classSize: 0,
      });
    }

    const cardId = `${schoolCode}__${student.id}__${term.replace(/\s+/g, "_")}`;
    const [marksSnap, cardSnap, classCount, settingsSnap, classSnap] = await Promise.all([
      adminDb.collection("ca_marks")
        .where("schoolCode", "==", schoolCode)
        .where("classId", "==", student.classId)
        .where("term", "==", term)
        .get(),
      adminDb.collection("report_cards").doc(cardId).get(),
      adminDb.collection("students")
        .where("schoolCode", "==", schoolCode)
        .where("classId", "==", student.classId)
        .count().get(),
      adminDb.collection("school_settings").doc(schoolCode).get(),
      adminDb.collection("school_classes").doc(student.classId).get(),
    ]);
    // The grading scale of the child's class, so the app shows the grades the
    // school uses (MANEB, Cambridge, Abeka, or its own) — see curriculumCore.js.
    const grading = scaleForClass(settingsSnap.data() || {}, classSnap.exists ? classSnap.data() : null);

    const results = childResults(marksSnap.docs.map((d) => d.data()), student.id);
    const card = cardSnap.exists ? cardSnap.data() : null;

    return res.status(200).json({
      term,
      withheld: false,
      subjects: results.subjects,
      overallAverage: results.overallAverage,
      rank: results.rank,
      classSize: classCount.data().count,
      grading,
      reportCard: card && {
        term: card.term || term,
        className: card.className || "",
        subjects: card.subjects || [],
        overallAverage: card.overallAverage ?? null,
        position: card.position ?? null,
        classSize: card.classSize ?? null,
        headTeacherRemark: card.headTeacherRemark || null,
        insight: card.insight || null,
        generatedAt: toIso(card.generatedAt),
      },
    });
  } catch (err) {
    console.error("[parent/results] failed:", err);
    return fail(res, 500, "Results couldn't be loaded. Please try again.");
  }
}
