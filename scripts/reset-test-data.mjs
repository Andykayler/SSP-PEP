// scripts/reset-test-data.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Wipes the project back to an empty platform for testing from scratch:
// every Firestore document (sub-collections included) and every Firebase Auth
// account — EXCEPT the platform owner(s): users with role "superadmin" keep
// both their users/{uid} profile and their login.
//
// DESTRUCTIVE AND IRREVERSIBLE. Only for a project with no real schools on it.
//
// By default it only REPORTS what it would delete. To actually delete, pass
// --confirm followed by the project id, typed out, so it can't be run against
// the wrong project by accident:
//
//     node scripts/reset-test-data.mjs --key ./ssp-pep-firebase-adminsdk-xxxx.json
//     node scripts/reset-test-data.mjs --key ./ssp-pep-firebase-adminsdk-xxxx.json --confirm ssp-pep
//
// Credentials: --key <service-account.json>, or FIREBASE_ADMIN_PROJECT_ID /
// CLIENT_EMAIL / PRIVATE_KEY from .env, like the other scripts.
//
// About "keeping the collections": Firestore has no empty collections — a
// collection exists only while it holds a document, so the console stops
// listing a collection once it is emptied. Nothing needs to be recreated: each
// one reappears the moment the app writes its first document (registering a
// school creates `schools`, `users`, `school_settings`, and so on). The rules,
// indexes and app code are untouched.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

function credential() {
  const keyPath = argValue("--key");
  if (keyPath) return JSON.parse(readFileSync(keyPath, "utf8"));
  const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail, FIREBASE_ADMIN_PRIVATE_KEY: privateKey } = process.env;
  if (!projectId || !clientEmail || !privateKey) {
    console.error("No credentials. Pass --key <service-account.json>, or set FIREBASE_ADMIN_* in .env.");
    process.exit(1);
  }
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

const creds = credential();
const projectId = creds.project_id || creds.projectId;
const app = initializeApp({ credential: cert(creds) });
const db = getFirestore(app);
const auth = getAuth(app);

const confirmed = argValue("--confirm");
const live = confirmed !== undefined;
if (live && confirmed !== projectId) {
  console.error(`--confirm must be followed by the project id, "${projectId}". Nothing was deleted.`);
  process.exit(1);
}

console.log(`Project: ${projectId}   Mode: ${live ? "DELETE" : "dry run (nothing will be deleted)"}\n`);

// ── Who to keep ─────────────────────────────────────────────────────────────
const owners = await db.collection("users").where("role", "==", "superadmin").get();
const keepUids = new Set(owners.docs.map((d) => d.id));
if (keepUids.size === 0) {
  console.error("No superadmin profile found. Refusing to continue — you would lock yourself out of /platform.");
  process.exit(1);
}
for (const d of owners.docs) console.log(`Keeping platform owner: ${d.data().email || "(no email)"}  [${d.id}]`);
console.log("");

// ── Firestore ───────────────────────────────────────────────────────────────
const collections = await db.listCollections();
let docTotal = 0;
for (const col of collections) {
  if (col.id === "users") {
    const users = await col.get();
    const doomed = users.docs.filter((d) => !keepUids.has(d.id));
    docTotal += doomed.length;
    console.log(`${col.id.padEnd(28)} ${String(doomed.length).padStart(5)} to delete (keeping ${users.size - doomed.length})`);
    if (live) {
      for (const d of doomed) await db.recursiveDelete(d.ref);
      // A kept owner's own sub-collections, if any, are left alone.
    }
    continue;
  }
  const n = (await col.count().get()).data().count;
  docTotal += n;
  console.log(`${col.id.padEnd(28)} ${String(n).padStart(5)} to delete`);
  // recursiveDelete also removes sub-collections (conversation messages,
  // thread replies, announcement read markers).
  if (live) await db.recursiveDelete(col);
}
console.log(`\nFirestore: ${docTotal} documents across ${collections.length} collections${live ? " deleted" : ""}.`);

// ── Auth ────────────────────────────────────────────────────────────────────
const doomedUids = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  page.users.forEach((u) => { if (!keepUids.has(u.uid)) doomedUids.push(u.uid); });
  pageToken = page.pageToken;
} while (pageToken);

let failed = 0;
if (live) {
  for (let i = 0; i < doomedUids.length; i += 1000) {
    const r = await auth.deleteUsers(doomedUids.slice(i, i + 1000));
    failed += r.failureCount;
    r.errors.forEach((e) => console.error(`  could not delete ${doomedUids[i + e.index]}: ${e.error.message}`));
  }
}
console.log(`Auth: ${doomedUids.length} accounts${live ? ` deleted${failed ? ` (${failed} failed)` : ""}` : " would be deleted"}; ${keepUids.size} kept.`);

if (!live) {
  console.log(`\nDry run only. To delete for real:\n  node scripts/reset-test-data.mjs ${args.join(" ")} --confirm ${projectId}`);
}
process.exit(0);
