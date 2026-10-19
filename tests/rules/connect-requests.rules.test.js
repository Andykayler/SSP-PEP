// A school may ask for its own PayChangu account; only its administrator can,
// only as "requested", and nobody can edit or withdraw it from a browser.
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const SCHOOL = "CONNECT-1";
const OTHER = "CONNECT-2";
let env;
const as = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "ssp-pep-connect-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "admin"), { role: "admin", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", "head"), { role: "head_teacher", schoolCode: SCHOOL });
    await setDoc(doc(db, "users", "otheradmin"), { role: "admin", schoolCode: OTHER });
    await setDoc(doc(db, "users", "admin3"), { role: "admin", schoolCode: "CONNECT-3" });
    await setDoc(doc(db, "users", "owner"), { role: "superadmin", schoolCode: "" });
    await setDoc(doc(db, "connect_requests", OTHER), { schoolCode: OTHER, status: "requested" });
  });
});
after(async () => { await env?.cleanup(); });

const req = (over = {}) => ({ schoolCode: SCHOOL, status: "requested", ...over });

describe("connect requests", () => {
  it("an administrator can ask for their own school", async () => {
    await assertSucceeds(setDoc(doc(as("admin"), "connect_requests", SCHOOL), req()));
  });
  it("only as 'requested'", async () => {
    await assertFails(setDoc(doc(as("admin"), "connect_requests", SCHOOL), req({ status: "connected" })));
  });
  it("not for another school", async () => {
    await assertFails(setDoc(doc(as("admin"), "connect_requests", OTHER), req({ schoolCode: OTHER })));
  });
  it("a head teacher cannot", async () => {
    await assertFails(setDoc(doc(as("head"), "connect_requests", SCHOOL), req()));
  });
  it("nobody edits or removes it from a browser", async () => {
    await assertFails(updateDoc(doc(as("admin"), "connect_requests", SCHOOL), { status: "connected" }));
    await assertFails(deleteDoc(doc(as("admin"), "connect_requests", SCHOOL)));
  });
  it("an administrator reads their own, not another school's", async () => {
    await assertSucceeds(getDoc(doc(as("admin"), "connect_requests", SCHOOL)));
    await assertFails(getDoc(doc(as("admin"), "connect_requests", OTHER)));
  });
  it("reading a request that does not exist yet is simply empty", async () => {
    const snap = await assertSucceeds(getDoc(doc(as("admin3"), "connect_requests", "CONNECT-3")));
    if (snap.exists()) throw new Error("expected no document");
  });
  it("the platform owner can read any", async () => {
    await assertSucceeds(getDoc(doc(as("owner"), "connect_requests", OTHER)));
  });
});
