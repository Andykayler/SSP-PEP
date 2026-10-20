// What a school is owed, and the rules around paying it out.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  availableBalance, availableAtMs, settlementHourFromEnv, payoutFee, feeConfigFromEnv, checkRequestAmount, checkDestination,
  maskAccount, canApprovePayout, payoutOutcome,
} from "../../api/_lib/payoutCore.js";

const pay = (amount, extra = {}) => ({ amount, source: "paychangu", status: "verified", ...extra });

describe("availableBalance", () => {
  it("counts confirmed online payments only", () => {
    const b = availableBalance({
      payments: [pay(1000), pay(500), { amount: 9999, source: "parent_app", status: "unverified" },
        { amount: 700, source: "bursar", status: "verified" }, pay(300, { status: "rejected" })],
    });
    assert.equal(b.earned, 1500);
    assert.equal(b.available, 1500);
  });
  it("leaves out payments the old automatic payout already sent", () => {
    const b = availableBalance({ payments: [pay(1000, { payoutStatus: "sent" }), pay(400, { payoutStatus: "failed" })] });
    assert.equal(b.available, 400);
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

describe("settlement: collected money is payable the next morning", () => {
  // 10:00 Malawi time (UTC+2) on 2026-10-20 is 08:00 UTC.
  const at = (iso) => Date.parse(iso);
  const stamp = (iso) => ({ toMillis: () => at(iso) });

  it("a payment becomes payable at the settlement hour the next day, Malawi time", () => {
    assert.equal(availableAtMs(at("2026-10-20T08:00:00Z"), 8), at("2026-10-21T06:00:00Z")); // 08:00 CAT next day
    // Paid 23:30 Malawi time on the 20th: still "the next day" by Malawi's clock, so 08:00 on the 21st.
    assert.equal(availableAtMs(at("2026-10-20T21:30:00Z"), 8), at("2026-10-21T06:00:00Z"));
    // Paid 00:30 Malawi time on the 21st (22:30Z on the 20th): the 22nd, even though UTC still says the 20th.
    assert.equal(availableAtMs(at("2026-10-20T22:30:00Z"), 8), at("2026-10-22T06:00:00Z"));
  });
  it("splits what is settled from what is still settling", () => {
    const now = at("2026-10-21T07:00:00Z"); // 09:00 CAT on the 21st
    const b = availableBalance({
      now, settlementHour: 8,
      payments: [
        { ...pay(1000), createdAt: stamp("2026-10-20T08:00:00Z") },   // yesterday: settled at 08:00 today
        { ...pay(400), createdAt: stamp("2026-10-21T05:00:00Z") },    // 07:00 today: settles tomorrow
      ],
    });
    assert.equal(b.settled, 1000);
    assert.equal(b.settling, 400);
    assert.equal(b.earned, 1400);
    assert.equal(b.available, 1000);
    assert.equal(b.nextSettlementAtMs, at("2026-10-22T06:00:00Z"));
  });
  it("before the morning cut-off, yesterday's payment is still settling", () => {
    const now = at("2026-10-21T05:00:00Z"); // 07:00 CAT
    const b = availableBalance({ now, settlementHour: 8, payments: [{ ...pay(1000), createdAt: stamp("2026-10-20T08:00:00Z") }] });
    assert.equal(b.available, 0);
    assert.equal(b.settling, 1000);
  });
  it("reservations come off what has settled, and settling money is not reserved against", () => {
    const now = at("2026-10-21T07:00:00Z");
    const b = availableBalance({
      now, settlementHour: 8,
      payments: [{ ...pay(1000), createdAt: stamp("2026-10-20T08:00:00Z") }, { ...pay(500), createdAt: stamp("2026-10-21T05:00:00Z") }],
      payouts: [{ amount: 700, status: "requested" }],
    });
    assert.equal(b.available, 300);
    assert.equal(b.settling, 500);
  });
  it("falls back to the payment date, and treats a payment with no time as settled", () => {
    const now = at("2026-10-21T07:00:00Z");
    const b = availableBalance({ now, payments: [{ ...pay(200), paymentDate: "2026-10-20" }, pay(100)] });
    assert.equal(b.available, 300);
  });
  it("reads the settlement hour from configuration, defaulting to 8", () => {
    assert.equal(settlementHourFromEnv({}), 8);
    assert.equal(settlementHourFromEnv({ PAYCHANGU_SETTLEMENT_HOUR: "6" }), 6);
    assert.equal(settlementHourFromEnv({ PAYCHANGU_SETTLEMENT_HOUR: "30" }), 8);
  });
});
