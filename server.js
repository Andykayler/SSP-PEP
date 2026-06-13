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
const serviceAccount                    = require("./ssp-pep-firebase-adminsdk-fbsvc-a71809ca23.json");

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
  console.log("🔥  Firebase Admin initialized");
}

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