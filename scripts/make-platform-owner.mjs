// scripts/make-platform-owner.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Grants one Firebase Auth account the platform owner role (users/{uid}.role
// = "superadmin"), which unlocks /platform — approving, rejecting and
// suspending schools, and extending trials.
//
// There is deliberately no way to become the platform owner from inside the
// product: no sign-up form, no promotion button, nothing firestore.rules would
// ever grant to a school's own admin. This script, run by hand against the
// Admin SDK, is the only path — which is what "platform owner" is supposed to
// mean.
//
//     node scripts/make-platform-owner.mjs someone@acalink.example
//
// The account must already exist in Firebase Auth (Firebase Console →
// Authentication → Add user, or have them register normally and tell you the
// email). This script does not set a password.
//
// Requires the same server credentials as the rest of api/: FIREBASE_ADMIN_
// PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY, from .env or the shell environment.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-platform-owner.mjs <email>");
  process.exit(1);
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY. Copy .env.example to .env and fill these in.");
  process.exit(1);
}

const app = initializeApp({
  credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
});
const auth = getAuth(app);
const db = getFirestore(app);

const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No Firebase Auth account for ${email}. Create it first (Firebase Console → Authentication → Add user, or have them register).`);
  process.exit(1);
}

// schoolCode is deliberately absent: isPlatformOwner() in firestore.rules does
// not call sameSchool(), and a schoolCode here would be misleading — this
// account is not attached to any one school.
await db.collection("users").doc(user.uid).set({
  name: user.displayName || email,
  email,
  role: "superadmin",
}, { merge: true });

console.log(`${email} (${user.uid}) is now the Acalink platform owner. They can sign in and will land on /platform.`);
