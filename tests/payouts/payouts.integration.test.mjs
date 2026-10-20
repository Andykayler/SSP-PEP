// The payout flow against the real Firestore emulator and the real Admin SDK,
// with PayChangu's HTTP API stubbed. Run: npm run test:payouts
//
// It exercises what moves money: balance, the request, the two-person approval,
// the transaction guarding the balance, and how a refused or unanswered
// PayChangu call is treated.
import { generateKeyPairSync } from "node:crypto";
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_ADMIN_PROJECT_ID = "ssp-pep-payout-test";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@ssp-pep-payout-test.iam.gserviceaccount.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n");
process.env.PAYCHANGU_SECRET_KEY = "sec-test-x";
process.env.PAYCHANGU_BANK_PAYOUT_FEE_RATE = "0.01";
process.env.PAYCHANGU_BANK_PAYOUT_FEE_FLAT = "0";

// PayChangu, stubbed.
let calls = [];
let nextReply = { status: 200, body: { data: { status: "pending", ref_id: "REF-1" } } };
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
  if (String(url).includes("supported-banks")) {
    return new Response(JSON.stringify({ data: [{ uuid: "bank-1", name: "National Bank" }] }), { status: 200 });
  }
  if (nextReply.throws) throw new Error("socket hang up");
  return new Response(JSON.stringify(nextReply.body), { status: nextReply.status });
};

const { adminDb } = await import("../../api/_lib/firebaseAdmin.js");
const P = await import("../../api/_lib/payouts.js");

const SCHOOL = "S1";
const bursar = { uid: "b1", isAnonymous: false, user: { role: "bursar", schoolCode: SCHOOL, name: "Bursar" } };
const director = { uid: "d1", isAnonymous: false, user: { role: "director", schoolCode: SCHOOL, name: "Director" } };
const admin = { uid: "a1", isAnonymous: false, user: { role: "admin", schoolCode: SCHOOL, name: "Admin" } };
const teacher = { uid: "t1", isAnonymous: false, user: { role: "class_teacher", schoolCode: SCHOOL } };

async function wipe() {
  for (const c of ["payments", "payouts", "payout_destinations", "users", "deleted_payments"]) {
    const snap = await adminDb.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function seed({ withDirector = true, paid = 100000 } = {}) {
  await adminDb.collection("payments").add({ schoolCode: SCHOOL, source: "paychangu", status: "verified", amount: paid, payoutStatus: "held" });
  await adminDb.collection("payments").add({ schoolCode: SCHOOL, source: "parent_app", status: "unverified", amount: 999999 });
  await adminDb.collection("payments").add({ schoolCode: "OTHER", source: "paychangu", status: "verified", amount: 777777 });
  if (withDirector) await adminDb.collection("users").doc("d1").set({ schoolCode: SCHOOL, role: "director" });
  await P.saveDestination({ auth: admin, body: { bankUuid: "bank-1", accountName: "Acme School", accountNumber: "1002003004" } });
}

before(async () => { await wipe(); });
beforeEach(async () => {
  await wipe();
  calls = [];
  nextReply = { status: 200, body: { data: { status: "pending", ref_id: "REF-1" } } };
});

describe("balance and bank account", () => {
  it("counts only this school's confirmed online payments", async () => {
    await seed();
    const s = await P.payoutState({ auth: bursar });
    assert.equal(s.balance.available, 100000);
    assert.equal(s.destination.accountMask, "••••••3004");
    assert.equal(s.canRequest, true);
    assert.equal(s.canApprove, false);
    assert.equal((await P.payoutState({ auth: director })).canApprove, true);
  });
  it("only the administrator can set the bank account", async () => {
    await assert.rejects(P.saveDestination({ auth: bursar, body: { bankUuid: "bank-1", accountName: "X Y Z", accountNumber: "123456" } }), /administrator/);
    await assert.rejects(P.saveDestination({ auth: admin, body: { bankUuid: "nope", accountName: "X Y Z", accountNumber: "123456" } }), /not one PayChangu/);
  });
  it("keeps outsiders out", async () => {
    await assert.rejects(P.payoutState({ auth: teacher }), /finance staff/);
    await assert.rejects(P.payoutState({ auth: { uid: "x", isAnonymous: true } }), /finance staff/);
  });
});

describe("settlement", () => {
  it("money collected today cannot be requested until it has settled", async () => {
    await seed({ paid: 100000 });
    await adminDb.collection("payments").add({
      schoolCode: SCHOOL, source: "paychangu", status: "verified", amount: 25000, payoutStatus: "held", createdAt: new Date(),
    });
    const s = await P.payoutState({ auth: bursar });
    assert.equal(s.balance.available, 100000);
    assert.equal(s.balance.settling, 25000);
    assert.ok(s.balance.nextSettlementAtMs > Date.now());
    await assert.rejects(P.requestPayout({ auth: bursar, body: { amount: 110000 } }), /tomorrow morning/);
    await P.requestPayout({ auth: bursar, body: { amount: 100000 } });
  });
});

describe("requesting", () => {
  it("reserves the amount and takes the fee out of what the school receives", async () => {
    await seed();
    await P.requestPayout({ auth: bursar, body: { amount: 40000 } });
    const s = await P.payoutState({ auth: bursar });
    assert.equal(s.payouts[0].amount, 40000);
    assert.equal(s.payouts[0].fee, 400);
    assert.equal(s.payouts[0].netAmount, 39600);
    assert.equal(s.balance.available, 60000);
    assert.equal(calls.filter((c) => c.url.includes("initialize")).length, 0, "nothing is sent on a request");
  });
  it("refuses more than the balance, and a director cannot request", async () => {
    await seed();
    await assert.rejects(P.requestPayout({ auth: bursar, body: { amount: 100001 } }), /more than/);
    await assert.rejects(P.requestPayout({ auth: director, body: { amount: 10 } }), /bursar/);
  });
  it("two racing requests cannot claim the same balance twice", async () => {
    await seed();
    const results = await Promise.allSettled([
      P.requestPayout({ auth: bursar, body: { amount: 70000 } }),
      P.requestPayout({ auth: bursar, body: { amount: 70000 } }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await P.payoutState({ auth: bursar })).balance.available, 30000);
  });
  it("needs a bank account first", async () => {
    await adminDb.collection("payments").add({ schoolCode: SCHOOL, source: "paychangu", status: "verified", amount: 5000 });
    await assert.rejects(P.requestPayout({ auth: bursar, body: { amount: 1000 } }), /bank account/);
  });
});

describe("approving", () => {
  async function requested() {
    await seed();
    await P.requestPayout({ auth: bursar, body: { amount: 50000 } });
    return (await P.payoutState({ auth: director })).payouts[0].id;
  }

  it("the director's approval sends the net amount to the saved account, once", async () => {
    const id = await requested();
    const out = await P.approvePayout({ auth: director, body: { id } });
    assert.equal(out.status, "processing");
    const sent = calls.filter((c) => c.url.endsWith("/direct-charge/payouts/initialize"));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, {
      payout_method: "bank_transfer", bank_uuid: "bank-1", amount: "49500", charge_id: `PYO-${id}`,
      bank_account_name: "Acme School", bank_account_number: "1002003004",
    });
    await assert.rejects(P.approvePayout({ auth: director, body: { id } }), /no longer waiting/);
    assert.equal(calls.filter((c) => c.url.endsWith("/payouts/initialize")).length, 1);
  });
  it("the bursar cannot approve, and nobody approves their own request", async () => {
    const id = await requested();
    await assert.rejects(P.approvePayout({ auth: bursar, body: { id } }), /cannot approve/);
    await assert.rejects(P.approvePayout({ auth: admin, body: { id } }), /cannot approve/, "admin cannot while a director exists");
  });
  it("an administrator may approve when the school has no director", async () => {
    await seed({ withDirector: false });
    await P.requestPayout({ auth: bursar, body: { amount: 1000 } });
    const id = (await P.payoutState({ auth: admin })).payouts[0].id;
    await P.approvePayout({ auth: admin, body: { id } });
    assert.equal((await P.payoutState({ auth: admin })).payouts[0].status, "processing");
  });
  it("a payout approved against the account as it was, even if the account changes", async () => {
    const id = await requested();
    await P.saveDestination({ auth: admin, body: { bankUuid: "bank-1", accountName: "Someone Else", accountNumber: "999999999" } });
    await P.approvePayout({ auth: director, body: { id } });
    const sent = calls.find((c) => c.url.endsWith("/payouts/initialize"));
    assert.equal(sent.body.bank_account_number, "1002003004");
  });
  it("PayChangu refusing (a 4xx) leaves it waiting to be tried again", async () => {
    const id = await requested();
    nextReply = { status: 403, body: { message: "Bank payouts are not enabled" } };
    await assert.rejects(P.approvePayout({ auth: director, body: { id } }), /refused/);
    const p = (await P.payoutState({ auth: director })).payouts[0];
    assert.equal(p.status, "requested");
    assert.match(p.lastError, /not enabled/);
    nextReply = { status: 200, body: { data: { status: "pending" } } };
    await P.approvePayout({ auth: director, body: { id } });
    assert.equal((await P.payoutState({ auth: director })).payouts[0].status, "processing");
  });
  it("no answer from PayChangu is NOT retried automatically", async () => {
    const id = await requested();
    nextReply = { throws: true };
    await assert.rejects(P.approvePayout({ auth: director, body: { id } }), /dashboard/);
    const p = (await P.payoutState({ auth: director })).payouts[0];
    assert.equal(p.status, "failed");
    await assert.rejects(P.approvePayout({ auth: director, body: { id } }), /no longer waiting/);
    assert.equal((await P.payoutState({ auth: director })).balance.available, 100000, "a failed payout releases its amount");
  });
});

describe("declining and the outcome webhook", () => {
  it("the director declines with a reason; the requester can cancel their own", async () => {
    await seed();
    await P.requestPayout({ auth: bursar, body: { amount: 1000 } });
    await P.requestPayout({ auth: bursar, body: { amount: 2000 } });
    const [a, b] = (await P.payoutState({ auth: director })).payouts;
    await assert.rejects(P.declinePayout({ auth: director, body: { id: a.id } }), /reason/);
    await P.declinePayout({ auth: director, body: { id: a.id, reason: "Not this week" } });
    await P.declinePayout({ auth: bursar, body: { id: b.id } });
    const s = await P.payoutState({ auth: director });
    assert.deepEqual(s.payouts.map((p) => p.status).sort(), ["cancelled", "declined"]);
    assert.equal(s.balance.available, 100000);
  });
  it("a signed api.payout event settles a payout that is in flight; an unsigned one does not", async () => {
    await seed();
    await P.requestPayout({ auth: bursar, body: { amount: 1000 } });
    const id = (await P.payoutState({ auth: director })).payouts[0].id;
    await P.approvePayout({ auth: director, body: { id } });
    await P.applyPayoutEvent({ event_type: "api.payout", charge_id: `PYO-${id}`, status: "success" }, false);
    assert.equal((await P.payoutState({ auth: director })).payouts[0].status, "processing");
    await P.applyPayoutEvent({ event_type: "api.payout", charge_id: `PYO-${id}`, status: "success" }, true);
    const s = await P.payoutState({ auth: director });
    assert.equal(s.payouts[0].status, "paid");
    assert.equal(s.balance.paidOut, 1000);
  });
});

describe("temporary payment clean-up", () => {
  it("deletes any payment of the school, keeping a copy, and refuses the wrong people and schools", async () => {
    await adminDb.collection("payments").doc("p-online").set({ schoolCode: SCHOOL, source: "paychangu", status: "verified", amount: 500, receiptNo: "RCP-1" });
    await adminDb.collection("payments").doc("p-cash").set({ schoolCode: SCHOOL, source: "bursar", status: "verified", amount: 700, receiptNo: "RCP-2" });
    await adminDb.collection("payments").doc("p-other").set({ schoolCode: "OTHER", source: "paychangu", status: "verified", amount: 900 });

    await assert.rejects(P.PAYOUT_ACTIONS.payment_delete({ auth: director, body: { id: "p-online" } }), /bursar or administrator/);
    await assert.rejects(P.PAYOUT_ACTIONS.payment_delete({ auth: teacher, body: { id: "p-online" } }), /bursar or administrator/);
    await assert.rejects(P.PAYOUT_ACTIONS.payment_delete({ auth: bursar, body: { id: "p-other" } }), /not found/);

    for (const id of ["p-online", "p-cash"]) {
      await P.PAYOUT_ACTIONS.payment_delete({ auth: bursar, body: { id } });
      assert.equal((await adminDb.collection("payments").doc(id).get()).exists, false);
      const copy = await adminDb.collection("deleted_payments").doc(id).get();
      assert.equal(copy.data().deletedById, "b1");
    }
    assert.equal((await adminDb.collection("deleted_payments").doc("p-cash").get()).data().amount, 700);
    assert.equal((await adminDb.collection("payments").doc("p-other").get()).exists, true, "another school's payment is untouched");
  });
});
