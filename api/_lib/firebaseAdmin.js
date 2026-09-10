// api/_lib/firebaseAdmin.js
// ─────────────────────────────────────────────────────────────────────────────
// The Admin SDK, for serverless functions.
//
// Vercel ignores anything under `api/` whose path segment starts with an
// underscore, so this file is a shared library rather than a route — there is
// no /api/_lib/firebaseAdmin endpoint.
//
// It differs from src/lib/firebaseAdmin.js in two ways that matter: it exports
// Firestore as well as Auth, and it reuses the app across warm invocations
// instead of initialising per request (initializeApp twice in one Node process
// throws). src/lib/ is left alone because the browser bundle must never
// resolve a path that pulls firebase-admin in.
//
// Required environment variables (Vercel → Settings → Environment Variables):
//
//   FIREBASE_ADMIN_PROJECT_ID
//   FIREBASE_ADMIN_CLIENT_EMAIL
//   FIREBASE_ADMIN_PRIVATE_KEY     the full PEM, newlines escaped as \n
//
// None of these are exposed to the client: vite.config.js allowlists only the
// VITE_, EMAILJS_ and APP_URL prefixes for the bundle.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function credentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const missing = [
    !projectId && "FIREBASE_ADMIN_PROJECT_ID",
    !clientEmail && "FIREBASE_ADMIN_CLIENT_EMAIL",
    !privateKey && "FIREBASE_ADMIN_PRIVATE_KEY",
  ].filter(Boolean);

  if (missing.length) {
    // Named rather than swallowed: an unconfigured deploy and a genuinely
    // broken credential are otherwise the same opaque 500 in the logs.
    throw new Error(`Firebase Admin not configured — missing: ${missing.join(", ")}`);
  }

  return cert({
    projectId,
    clientEmail,
    // Vercel stores the key on one line; the SDK wants real newlines.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });
}

const app = getApps().length ? getApps()[0] : initializeApp({ credential: credentials() });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export { FieldValue };
