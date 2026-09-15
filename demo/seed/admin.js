// demo/seed/admin.js
// firebase-admin bootstrap shared by seed.js and unseed.js. Reuses the
// service-account file already in the repo root (same one server.js uses) —
// see demo/.env.example for how to point at a different one.
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "../lib/env.js";

export function initAdmin() {
  if (getApps().length) return;

  if (process.env.FIREBASE_ADMIN_PROJECT_ID) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    return;
  }

  const serviceAccount = JSON.parse(readFileSync(env.serviceAccountPath, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
}

initAdmin();
export const db = getFirestore();
export const auth = getAuth();
