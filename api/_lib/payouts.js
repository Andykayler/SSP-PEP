// api/_lib/payouts.js
// ─────────────────────────────────────────────────────────────────────────────
// Paying a school what its families paid online. Reached through
// api/payments/initiate.js (actions payout_*), because Vercel's plan caps the
// number of functions and this already carries the same authentication.
//
//   payout_state             what the school is owed, its bank account and its payouts
//   payout_banks             the banks PayChangu can pay out to
//   payout_save_destination  the school's administrator saves the bank account
//   payout_request           the bursar (or administrator) asks for an amount
//   payout_approve           the director approves it — and only then does money move
//   payout_decline           the director declines, or the requester cancels
//
// Every payout is its own document in `payouts` and every one is written here,
// on the Admin SDK: no browser can create, edit or approve one. The two-person
// rule is enforced here, not in the page.
// ─────────────────────────────────────────────────────────────────────────────
import { adminDb, FieldValue } from "./firebaseAdmin.js";
import { listPayoutBanks, initiateBankPayout } from "./paychangu.js";
import {
  availableBalance, feeConfigFromEnv, payoutFee, checkRequestAmount, checkDestination,
  maskAccount, canApprovePayout, payoutOutcome, settlementHourFromEnv,
} from "./payoutCore.js";

export const PAYOUTS = "payouts";
export const DESTINATIONS = "payout_destinations";

class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const FINANCE = ["admin", "bursar", "director"];

function who(auth) {
  if (auth.isAnonymous || !auth.user?.schoolCode || !FINANCE.includes(auth.user.role)) {
    throw new UserError("Only the school's finance staff and director can use payouts.", 403);
  }
  return { uid: auth.uid, role: auth.user.role, schoolCode: auth.user.schoolCode, name: auth.user.name || auth.user.email || "" };
}

async function schoolBalance(schoolCode) {
  const [pay, out] = await Promise.all([
    adminDb.collection("payments").where("schoolCode", "==", schoolCode).where("source", "==", "paychangu").get(),
    adminDb.collection(PAYOUTS).where("schoolCode", "==", schoolCode).get(),
  ]);
  return availableBalance({
    payments: pay.docs.map((d) => d.data()),
    payouts: out.docs.map((d) => d.data()),
    settlementHour: settlementHourFromEnv(process.env),
  });
}

async function schoolHasDirector(schoolCode) {
  const snap = await adminDb.collection("users")
    .where("schoolCode", "==", schoolCode).where("role", "==", "director").get();
  return snap.docs.some((d) => !["deactivated", "suspended"].includes(d.data().status));
}

const ms = (t) => t?.toMillis?.() ?? (typeof t === "number" ? t : 0);

function publicPayout(id, p) {
  return {
    id, amount: p.amount, fee: p.fee, netAmount: p.netAmount, status: p.status,
    requestedByName: p.requestedByName || "", requestedAtMs: ms(p.requestedAt) || p.requestedAtMs || 0,
    decidedByName: p.decidedByName || "", decidedAtMs: ms(p.decidedAt) || 0,
    declineReason: p.declineReason || "", lastError: p.lastError || "",
    bankName: p.destination?.bankName || "", accountName: p.destination?.accountName || "",
    accountMask: maskAccount(p.destination?.accountNumber), gatewayRef: p.gatewayRef || "",
    requestedById: p.requestedById || "",
  };
}

export async function payoutState({ auth }) {
  const me = who(auth);
  const [balance, destSnap, outSnap, hasDirector] = await Promise.all([
    schoolBalance(me.schoolCode),
    adminDb.collection(DESTINATIONS).doc(me.schoolCode).get(),
    adminDb.collection(PAYOUTS).where("schoolCode", "==", me.schoolCode).get(),
    schoolHasDirector(me.schoolCode),
  ]);
  const dest = destSnap.exists ? destSnap.data() : null;
  const payouts = outSnap.docs.map((d) => publicPayout(d.id, d.data()))
    .sort((a, b) => b.requestedAtMs - a.requestedAtMs).slice(0, 50);
  return {
    me: { uid: me.uid, role: me.role },
    balance,
    destination: dest && {
      bankName: dest.bankName, accountName: dest.accountName, accountMask: maskAccount(dest.accountNumber),
    },
    feeConfig: feeConfigFromEnv(process.env),
    settlementHour: settlementHourFromEnv(process.env),
    canRequest: ["bursar", "admin"].includes(me.role),
    canEditDestination: me.role === "admin",
    approverIsDirector: hasDirector,
    canApprove: canApprovePayout({ role: me.role, uid: me.uid, requestedById: "", schoolHasDirector: hasDirector }),
    payouts,
  };
}

export async function payoutBanks({ auth }) {
  who(auth);
  return { banks: await listPayoutBanks() };
}

export async function saveDestination({ auth, body }) {
  const me = who(auth);
  if (me.role !== "admin") throw new UserError("Only the school administrator can change the bank account.", 403);

  const problem = checkDestination(body);
  if (problem) throw new UserError(problem);

  const banks = await listPayoutBanks();
  const bank = banks.find((b) => b.uuid === body.bankUuid);
  if (!bank) throw new UserError("That bank is not one PayChangu can pay to.");

  await adminDb.collection(DESTINATIONS).doc(me.schoolCode).set({
    schoolCode: me.schoolCode,
    bankUuid: bank.uuid,
    bankName: bank.name,
    accountName: String(body.accountName).trim(),
    accountNumber: String(body.accountNumber).replace(/\s+/g, ""),
    updatedById: me.uid,
    updatedByName: me.name,
    updatedAt: FieldValue.serverTimestamp(),
    version: FieldValue.increment(1),
  }, { merge: true });
  return { ok: true };
}

export async function requestPayout({ auth, body }) {
  const me = who(auth);
  if (!["bursar", "admin"].includes(me.role)) throw new UserError("Only the bursar can request a payout.", 403);

  const amount = Number(body.amount);
  const feeConfig = feeConfigFromEnv(process.env);
  const destRef = adminDb.collection(DESTINATIONS).doc(me.schoolCode);
  const ref = adminDb.collection(PAYOUTS).doc();

  // A transaction on the destination document: two requests racing for the same
  // balance both read its version, and the second to commit is re-run against
  // the first's reservation, so the balance cannot be claimed twice.
  await adminDb.runTransaction(async (tx) => {
    const d = await tx.get(destRef);
    if (!d.exists) throw new UserError("Add the school's bank account in School Settings first.");
    const { available } = await schoolBalance(me.schoolCode);
    const problem = checkRequestAmount(amount, available, feeConfig);
    if (problem) throw new UserError(problem);

    const dest = d.data();
    const fee = payoutFee(amount, feeConfig);
    tx.set(ref, {
      schoolCode: me.schoolCode,
      amount,
      fee,
      netAmount: amount - fee,
      status: "requested",
      requestedById: me.uid,
      requestedByName: me.name,
      requestedAt: FieldValue.serverTimestamp(),
      requestedAtMs: Date.now(),
      // A snapshot: the director approves THIS account, even if it is changed later.
      destination: {
        bankUuid: dest.bankUuid, bankName: dest.bankName,
        accountName: dest.accountName, accountNumber: dest.accountNumber,
      },
    });
    tx.update(destRef, { version: (dest.version || 0) + 1 });
  });
  return { id: ref.id };
}

async function loadRequested(payoutId, schoolCode) {
  const ref = adminDb.collection(PAYOUTS).doc(String(payoutId || "_"));
  const snap = await ref.get();
  if (!snap.exists || snap.data().schoolCode !== schoolCode) throw new UserError("Payout not found.", 404);
  return { ref, data: snap.data() };
}

export async function approvePayout({ auth, body }) {
  const me = who(auth);
  const { ref, data } = await loadRequested(body.id, me.schoolCode);
  const allowed = canApprovePayout({
    role: me.role, uid: me.uid, requestedById: data.requestedById,
    schoolHasDirector: await schoolHasDirector(me.schoolCode),
  });
  if (!allowed) throw new UserError("You cannot approve this payout. It needs the director, and nobody approves their own request.", 403);

  // Claimed in a transaction so two clicks cannot send it twice.
  await adminDb.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data().status !== "requested") throw new UserError("This payout is no longer waiting for approval.", 409);
    tx.update(ref, {
      status: "processing", decidedById: me.uid, decidedByName: me.name,
      decidedAt: FieldValue.serverTimestamp(), lastError: "",
    });
  });

  const chargeId = `PYO-${ref.id}`;
  try {
    const result = await initiateBankPayout({
      chargeId,
      amount: data.netAmount,
      bankUuid: data.destination.bankUuid,
      accountName: data.destination.accountName,
      accountNumber: data.destination.accountNumber,
    });
    await ref.update({
      status: payoutOutcome(result.status) === "failed" ? "failed" : payoutOutcome(result.status),
      gatewayRef: result.gatewayRef, gatewayChargeId: chargeId, gatewayStatus: result.status,
      ...(payoutOutcome(result.status) === "failed" ? { lastError: "PayChangu reported the payout as failed." } : {}),
    });
    return { ok: true, status: payoutOutcome(result.status) };
  } catch (err) {
    // A 4xx means PayChangu answered and refused, so nothing was sent and the
    // approval can be tried again (bank payouts not switched on, a bad account).
    // Anything else — a timeout, a 5xx — may have gone through, so it is NOT
    // retried automatically: it is marked failed for a person to check against
    // the PayChangu dashboard before a new request is raised.
    const refused = Number(err.status) >= 400 && Number(err.status) < 500;
    console.error("[payout] bank payout failed for", ref.id, err);
    await ref.update(refused
      ? { status: "requested", lastError: err.message || "PayChangu refused the payout." }
      : { status: "failed", lastError: `${err.message || "No answer from PayChangu"} — check the PayChangu dashboard before requesting again.` });
    throw new UserError(
      refused ? `PayChangu refused the payout: ${err.message}` : "No clear answer from PayChangu. Check the PayChangu dashboard before trying again.",
      refused ? 400 : 502,
    );
  }
}

export async function declinePayout({ auth, body }) {
  const me = who(auth);
  const { ref, data } = await loadRequested(body.id, me.schoolCode);
  const own = data.requestedById === me.uid;
  const approver = canApprovePayout({
    role: me.role, uid: me.uid, requestedById: data.requestedById,
    schoolHasDirector: await schoolHasDirector(me.schoolCode),
  });
  if (!own && !approver) throw new UserError("You cannot decline this payout.", 403);

  const reason = String(body.reason || "").trim().slice(0, 300);
  if (!own && reason.length < 3) throw new UserError("Give a reason, so the bursar knows why.");

  await adminDb.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data().status !== "requested") throw new UserError("This payout is no longer waiting.", 409);
    tx.update(ref, {
      status: own ? "cancelled" : "declined", declineReason: reason,
      decidedById: me.uid, decidedByName: me.name, decidedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
}

/**
 * PayChangu's api.payout webhook: the outcome of a payout we sent. Only acted on
 * when its signature checks out — the verify call that guards checkout payments
 * has no payout equivalent, so an unsigned event is logged and ignored.
 */
export async function applyPayoutEvent(payload, signatureValid) {
  const chargeId = payload?.charge_id || payload?.data?.charge_id || payload?.reference || payload?.data?.reference || "";
  const statusWord = payload?.status || payload?.data?.status || "";
  console.log("[payout] webhook", JSON.stringify({ chargeId, statusWord, signatureValid }));
  if (!signatureValid || !String(chargeId).startsWith("PYO-")) return;

  const ref = adminDb.collection(PAYOUTS).doc(String(chargeId).slice(4));
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== "processing") return;

  const outcome = payoutOutcome(statusWord);
  if (outcome === "processing") return;
  await ref.update({
    status: outcome, gatewayStatus: String(statusWord),
    ...(outcome === "failed" ? { lastError: "PayChangu reported the payout as failed." } : {}),
  });
}

export const PAYOUT_ACTIONS = {
  payout_state: payoutState,
  payout_banks: payoutBanks,
  payout_save_destination: saveDestination,
  payout_request: requestPayout,
  payout_approve: approvePayout,
  payout_decline: declinePayout,
};

export function isPayoutAction(action) {
  return Object.prototype.hasOwnProperty.call(PAYOUT_ACTIONS, action);
}

export { UserError };
