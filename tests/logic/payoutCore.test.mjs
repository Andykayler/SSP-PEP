// What a school is owed, and the rules around paying it out.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  availableBalance, payoutFee, feeConfigFromEnv, checkRequestAmount, checkDestination,
  maskAccount, canApprovePayout, payoutOutcome,
} from "../../api/_lib/payoutCore.js";

const pay = (amount, extra = {}) => ({ amount, source: "paychangu", status: "verified", payoutStatus: "held", ...extra });

describe("availableBalance", () => {
  it("counts confirmed online payments only", () => {
    const b = availableBalance({
      payments: [pay(1000), pay(500), { amount: 9999, source: "parent_app", status: "unverified" },
        { amount: 700, source: "bursar", status: "verified" }, pay(300, { status: "rejected" })],
    });
    assert.equal(b.earned, 1500);
    assert.equal(b.available, 1500);
  });
  it("leaves out payments from before this flow, whatever happened to their old payout", () => {
    const b = availableBalance({
      payments: [pay(1000, { payoutStatus: "sent" }), pay(400, { payoutStatus: "failed" }),
        pay(300, { payoutStatus: "pending" }), pay(200, { payoutStatus: "not_configured" }),
        pay(100, { payoutStatus: undefined }), pay(50)],
    });
    assert.equal(b.available, 50);
  });
  it("reserves waiting, in-flight and finished payouts, and releases the rest", () => {
    const b = availableBalance({
      payments: [pay(10000)],
      payouts: [
        { amount: 1000, status: "requested" }, { amount: 2000, status: "processing" },
        { amount: 3000, status: "paid" }, { amount: 4000, status: "failed" },
        { amount: 500, status: "declined" }, { amount: 250, status: "cancelled" },
      ],
    });
    assert.equal(b.reserved, 6000);
    assert.equal(b.awaiting, 1000);
    assert.equal(b.paidOut, 3000);
    assert.equal(b.available, 4000);
  });
  it("never goes negative", () => {
    assert.equal(availableBalance({ payments: [pay(100)], payouts: [{ amount: 500, status: "paid" }] }).available, 0);
  });
});

describe("payout fee", () => {
  it("is zero until configured, then rate plus flat", () => {
    assert.equal(payoutFee(100000, feeConfigFromEnv({})), 0);
    const cfg = feeConfigFromEnv({ PAYCHANGU_BANK_PAYOUT_FEE_RATE: "0.01", PAYCHANGU_BANK_PAYOUT_FEE_FLAT: "500" });
    assert.equal(payoutFee(100000, cfg), 1500);
  });
  it("ignores nonsense configuration", () => {
    assert.deepEqual(feeConfigFromEnv({ PAYCHANGU_BANK_PAYOUT_FEE_RATE: "abc", PAYCHANGU_BANK_PAYOUT_FEE_FLAT: "-5" }), { rate: 0, flat: 0 });
  });
});

describe("checkRequestAmount", () => {
  const cfg = { rate: 0.01, flat: 0 };
  it("accepts a whole amount within the balance", () => assert.equal(checkRequestAmount(5000, 10000, cfg), ""));
  it("refuses more than the balance, fractions, zero and amounts the fee swallows", () => {
    assert.ok(checkRequestAmount(10001, 10000, cfg));
    assert.ok(checkRequestAmount(10.5, 10000, cfg));
    assert.ok(checkRequestAmount(0, 10000, cfg));
    assert.ok(checkRequestAmount(100, 10000, { rate: 0, flat: 100 }));
  });
});

describe("checkDestination and maskAccount", () => {
  it("wants a bank, a name and a digits-only number", () => {
    assert.equal(checkDestination({ bankUuid: "b1", accountName: "Acme School", accountNumber: "1002003004" }), "");
    assert.ok(checkDestination({ bankUuid: "", accountName: "Acme", accountNumber: "1002003004" }));
    assert.ok(checkDestination({ bankUuid: "b1", accountName: "A", accountNumber: "1002003004" }));
    assert.ok(checkDestination({ bankUuid: "b1", accountName: "Acme", accountNumber: "12ab" }));
  });
  it("shows only the last four digits", () => {
    assert.equal(maskAccount("1002003004"), "••••••3004");
    assert.equal(maskAccount("123"), "123");
  });
});

describe("canApprovePayout", () => {
  it("lets the director approve, but never their own request", () => {
    assert.equal(canApprovePayout({ role: "director", uid: "d", requestedById: "b" }), true);
    assert.equal(canApprovePayout({ role: "director", uid: "d", requestedById: "d" }), false);
  });
  it("lets an administrator approve only when the school has no director", () => {
    assert.equal(canApprovePayout({ role: "admin", uid: "a", requestedById: "b", schoolHasDirector: true }), false);
    assert.equal(canApprovePayout({ role: "admin", uid: "a", requestedById: "b", schoolHasDirector: false }), true);
  });
  it("keeps the bursar out", () => {
    assert.equal(canApprovePayout({ role: "bursar", uid: "b", requestedById: "x" }), false);
  });
});

describe("payoutOutcome", () => {
  it("reads PayChangu's status words", () => {
    assert.equal(payoutOutcome("success"), "paid");
    assert.equal(payoutOutcome("Successful"), "paid");
    assert.equal(payoutOutcome("failed"), "failed");
    assert.equal(payoutOutcome("pending"), "processing");
    assert.equal(payoutOutcome(undefined), "processing");
  });
});
