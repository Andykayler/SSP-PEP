// server.js
// ─── Express backend server ───────────────────────────────────────────────────
// Run with: node server.js
// Listens on port 3001

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createRequire } from "module";

dotenv.config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth }                       = require("firebase-admin/auth");
const { getFirestore, FieldValue }      = require("firebase-admin/firestore");
const serviceAccount                    = require("./ssp-pep-firebase-adminsdk-fbsvc-a71809ca23.json");

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
  console.log("🔥  Firebase Admin initialized");
}

const db = getFirestore();

const app  = express();
const PORT = 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ─── POST /api/send-sms ───────────────────────────────────────────────────────
app.post("/api/send-sms", async (req, res) => {
 const { to, message } = req.body;
  
  console.log("📱 SMS request received:");
  console.log("   To     :", to);
  console.log("   From   :", process.env.TWILIO_PHONE_NUMBER);
  console.log("   Account:", process.env.TWILIO_ACC_SID?.slice(0, 8) + "...");

  if (!to || !message) {
    return res.status(400).json({ error: "Missing 'to' or 'message'." });
  }

  const accountSid = process.env.TWILIO_ACC_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("❌  Twilio env vars missing — check your .env.local");
    return res.status(500).json({ error: "SMS service not configured." });
  }

  const url  = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To:   to.replace(/\s/g, ""),
    From: fromNumber,
    Body: message,
  });

  try {
    const response = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:  "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌  Twilio error:", data.message);
      return res.status(response.status).json({ error: data.message, code: data.code });
    }

    console.log(`✅  SMS sent to ${to} — SID: ${data.sid}`);
    return res.status(200).json({ success: true, sid: data.sid });

  } catch (err) {
    console.error("❌  SMS send error:", err.message);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── POST /api/delete-user ────────────────────────────────────────────────────
app.post("/api/delete-user", async (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "UID required." });
  }

  try {
    await getAuth().deleteUser(uid);
    console.log(`✅  Auth account deleted: ${uid}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌  Auth delete error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Auth helper (shared by the transfer endpoints below) ────────────────────
// Verifies the caller's Firebase ID token, then loads users/{uid} to get
// their schoolCode + role — same schema your Firestore rules use in
// myData(). Throws { status, message } on failure.
async function getCallerProfile(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw { status: 401, message: "Missing or malformed Authorization header." };
  }

  const decoded = await getAuth().verifyIdToken(token);
  const userSnap = await db.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists || !userSnap.data().schoolCode) {
    throw { status: 403, message: "No school is associated with this account." };
  }

  const profile = userSnap.data();
  if (profile.role !== "admin" && profile.role !== "head_teacher") {
    throw { status: 403, message: "Only admins or head teachers can approve or reject transfers." };
  }

  return { uid: decoded.uid, schoolCode: profile.schoolCode, role: profile.role };
}

// ─── POST /api/transfers/:id/approve ──────────────────────────────────────────
// Only the student's CURRENT school (transfer_requests.fromSchoolCode) may
// approve. Client Firestore rules deliberately forbid updating
// transfer_requests or moving a student cross-school directly — this runs
// with the Admin SDK, in a transaction, so the student doc and the request
// doc always move together.
app.post("/api/transfers/:id/approve", async (req, res) => {
  const reqId = req.params.id;

  try {
    const caller  = await getCallerProfile(req);
    const reqRef  = db.collection("transfer_requests").doc(reqId);

    const result = await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw { status: 404, message: "Transfer request not found." };

      const request = reqSnap.data();
      if (request.status !== "pending") {
        throw { status: 409, message: `This request has already been ${request.status}.` };
      }
      if (request.fromSchoolCode !== caller.schoolCode) {
        throw { status: 403, message: "You are not authorised to approve this request." };
      }

      const studentRef  = db.collection("students").doc(request.studentId);
      const studentSnap = await tx.get(studentRef);
      if (!studentSnap.exists) throw { status: 404, message: "Student record not found." };

      const student = studentSnap.data();
      if (student.schoolCode !== request.fromSchoolCode) {
        throw { status: 409, message: "Student has already transferred elsewhere; this request is stale." };
      }

      const historyEntry = {
        schoolCode: request.toSchoolCode,
        schoolName: request.toSchoolName,
        joinedAt: new Date().toISOString(),
        action: "transferred_in",
        fromSchoolCode: request.fromSchoolCode,
        fromSchoolName: request.fromSchoolName,
        transferRequestId: reqId,
      };

      tx.update(studentRef, {
        schoolCode: request.toSchoolCode,
        schoolName: request.toSchoolName,
        classId: request.requestedClassId,
        className: request.requestedClassName,
        status: "active",
        transferHistory: FieldValue.arrayUnion(historyEntry),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(reqRef, {
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        approvedByUid: caller.uid,
      });

      return { studentCode: request.studentCode };
    });

    // Best-effort: any other pending requests for this student are now moot.
    try {
      const dupSnap = await db.collection("transfer_requests")
        .where("studentCode", "==", result.studentCode)
        .where("status", "==", "pending")
        .get();

      const batch = db.batch();
      let hasDupes = false;
      dupSnap.forEach((d) => {
        if (d.id !== reqId) {
          hasDupes = true;
          batch.update(d.ref, {
            status: "rejected",
            rejectionReason: "Student was transferred to a different school.",
            rejectedAt: FieldValue.serverTimestamp(),
            rejectedByUid: caller.uid,
          });
        }
      });
      if (hasDupes) await batch.commit();
    } catch (cleanupErr) {
      console.error("⚠️  Cleanup of duplicate requests failed:", cleanupErr.message);
    }

    console.log(`✅  Transfer approved: request ${reqId}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    const status = err.status || 500;
    console.error("❌  Approve transfer failed:", err.message || err);
    return res.status(status).json({ error: err.message || "Approval failed." });
  }
});

// ─── POST /api/transfers/:id/reject ───────────────────────────────────────────
// Only the student's current school may reject. Body: { reason?: string }
app.post("/api/transfers/:id/reject", async (req, res) => {
  const reqId  = req.params.id;
  const reason = (req.body && req.body.reason) || "No reason given";

  try {
    const caller = await getCallerProfile(req);
    const reqRef = db.collection("transfer_requests").doc(reqId);

    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw { status: 404, message: "Transfer request not found." };

      const request = reqSnap.data();
      if (request.status !== "pending") {
        throw { status: 409, message: `This request has already been ${request.status}.` };
      }
      if (request.fromSchoolCode !== caller.schoolCode) {
        throw { status: 403, message: "You are not authorised to reject this request." };
      }

      tx.update(reqRef, {
        status: "rejected",
        rejectionReason: reason,
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedByUid: caller.uid,
      });
    });

    console.log(`✅  Transfer rejected: request ${reqId}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    const status = err.status || 500;
    console.error("❌  Reject transfer failed:", err.message || err);
    return res.status(status).json({ error: err.message || "Rejection failed." });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => {
  res.json({ status: "ok", service: "SSP-PEP Server", port: PORT });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Server running on http://localhost:${PORT}`);
  console.log(`📱  Twilio number : ${process.env.TWILIO_PHONE_NUMBER || "NOT SET"}`);
  console.log(`🔑  Account SID   : ${process.env.TWILIO_ACC_SID ? process.env.TWILIO_ACC_SID.slice(0, 8) + "..." : "NOT SET"}`);
  console.log(`\n✅  Ready to receive requests from http://localhost:5173\n`);
});