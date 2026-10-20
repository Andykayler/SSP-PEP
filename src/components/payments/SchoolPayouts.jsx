// src/components/payments/SchoolPayouts.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Paying a school what its families paid online.
//
// Online fee payments land in Acalink's PayChangu account and are credited to
// the student in full; nothing is sent to the school automatically. This is
// where the school's share is sent on: the bursar asks for an amount, the
// director approves it, and Acalink pays it to the school's bank account.
//
// One screen for both roles. What each sees is decided by the server (canRequest
// / canApprove), which is also what enforces it — hiding a button here is only a
// courtesy.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from "react";
import useLoader from "../../hooks/useLoader";
import { Landmark, RefreshCw } from "lucide-react";
import { payoutAction } from "../../services/paychangu";
import {
  ModuleHeader, StatGrid, StatCard, TableWrap, EmptyState, Notice, LoadingState, Pill, Btn,
} from "../ui/ModuleKit";
import { money } from "../ui/format";
import { PAYOUT_STATUS_LABEL, payoutFee } from "../../../api/_lib/payoutCore";

const TONE = { requested: "warning", processing: "warning", paid: "success", failed: "danger", declined: "danger", cancelled: "neutral" };

const when = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function SchoolPayouts() {
  const [state, setState] = useState(null);
  const [notice, setNotice] = useState(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setState(await payoutAction("payout_state"));
    } catch (err) {
      setNotice({ tone: "danger", text: err.message });
      setState((s) => s || { payouts: [], balance: { available: 0, earned: 0, awaiting: 0, paidOut: 0 }, feeConfig: {} });
    }
  }, []);

  useLoader(load);

  async function run(action, payload, okText, key) {
    setBusy(key); setNotice(null);
    try {
      await payoutAction(action, payload);
      setNotice({ tone: "success", text: okText });
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: err.message });
      await load();
    }
    setBusy("");
  }

  if (!state) return <LoadingState label="Loading payouts…" />;

  const { balance, destination, feeConfig, canRequest, payouts } = state;
  const n = Math.round(Number(amount) || 0);
  const fee = n > 0 ? payoutFee(n, feeConfig) : 0;

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Payouts"
        subtitle="Send the school its share of what families paid online"
        actions={<Btn variant="secondary" onClick={load} title="Refresh"><RefreshCw size={15} /></Btn>}
      />
      <Notice tone={notice?.tone} onDismiss={() => setNotice(null)}>{notice?.text}</Notice>

      <StatGrid>
        <StatCard label="Available to pay out" value={money(balance.available)} tone={balance.available > 0 ? "success" : undefined} sub="Online payments not yet paid out" />
        <StatCard label="Awaiting approval" value={money(balance.awaiting)} sub="Requested, not yet approved" />
        <StatCard label="Paid out" value={money(balance.paidOut)} sub="Sent to the school's bank" />
        <StatCard label="Received online" value={money(balance.earned)} sub="Confirmed by PayChangu" />
      </StatGrid>

      <div className="card" style={{ padding: 20 }}>
        <p className="module-title" style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <Landmark size={15} aria-hidden="true" /> Bank account
        </p>
        {destination ? (
          <p className="module-sub" style={{ marginTop: 6 }}>
            {destination.bankName} · {destination.accountName} · {destination.accountMask}
          </p>
        ) : (
          <p className="module-sub" style={{ marginTop: 6 }}>
            No bank account yet. The school&apos;s administrator adds it in School Settings → Payout bank account.
          </p>
        )}
      </div>

      {canRequest && (
        <div className="card" style={{ padding: 20 }}>
          <p className="module-title" style={{ fontSize: 15 }}>Request a payout</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
            <div className="field" style={{ minWidth: 200 }}>
              <label className="field__label" htmlFor="payout-amount">Amount (MWK)</label>
              <input
                id="payout-amount" className="field__input" type="number" min="1" step="1"
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              />
            </div>
            <Btn variant="secondary" onClick={() => setAmount(String(balance.available))} disabled={balance.available <= 0}>
              All available
            </Btn>
            <Btn
              onClick={() => run("payout_request", { amount: n }, "Payout requested. The director has to approve it before anything is sent.", "request")}
              loading={busy === "request"} disabled={!destination || n <= 0}
            >
              Request payout
            </Btn>
          </div>
          {n > 0 && (
            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              {fee > 0
                ? <>PayChangu&apos;s payout fee of {money(fee)} is taken from this, so the school receives <strong>{money(n - fee)}</strong>.</>
                : <>The school receives <strong>{money(n)}</strong>.</>}
            </p>
          )}
        </div>
      )}

      {payouts.length === 0 ? (
        <EmptyState icon={<Landmark size={28} />} title="No payouts yet" sub="Requests and payments to the school's bank appear here." />
      ) : (
        <TableWrap>
          <table className="data-table data-table--stack">
            <thead>
              <tr><th>Requested</th><th>Amount</th><th>School receives</th><th>Status</th><th>To</th><th /></tr>
            </thead>
            <tbody>
              {payouts.map((p) => {
                const mine = p.requestedById === state.me.uid;
                const approvable = p.status === "requested" && state.canApprove && !mine;
                return (
                  <tr key={p.id}>
                    <td data-label="Requested">
                      <div className="data-table__primary">{when(p.requestedAtMs)}</div>
                      <div className="data-table__meta">{p.requestedByName}</div>
                    </td>
                    <td data-label="Amount">{money(p.amount)}</td>
                    <td data-label="School receives">
                      {money(p.netAmount)}
                      {p.fee > 0 && <div className="data-table__meta">fee {money(p.fee)}</div>}
                    </td>
                    <td data-label="Status">
                      <Pill tone={TONE[p.status] || "neutral"}>{PAYOUT_STATUS_LABEL[p.status] || p.status}</Pill>
                      {p.decidedByName && <div className="data-table__meta">{p.decidedByName}</div>}
                      {p.declineReason && <div className="data-table__meta">{p.declineReason}</div>}
                      {p.lastError && p.status !== "paid" && <div className="data-table__meta text-danger">{p.lastError}</div>}
                    </td>
                    <td data-label="To">
                      <div className="data-table__primary">{p.bankName}</div>
                      <div className="data-table__meta">{p.accountName} · {p.accountMask}</div>
                    </td>
                    <td>
                      {approvable && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn
                            size="sm" loading={busy === `a${p.id}`}
                            onClick={() => {
                              if (window.confirm(`Send ${money(p.netAmount)} to ${p.bankName}, ${p.accountName} (${p.accountMask})?\n\nThis moves real money and cannot be undone.`)) {
                                run("payout_approve", { id: p.id }, "Approved. The payout is on its way to the bank.", `a${p.id}`);
                              }
                            }}
                          >
                            Approve
                          </Btn>
                          <Btn
                            size="sm" variant="secondary" loading={busy === `d${p.id}`}
                            onClick={() => {
                              const reason = window.prompt("Why is this being declined? The bursar will see it.");
                              if (reason) run("payout_decline", { id: p.id, reason }, "Payout declined.", `d${p.id}`);
                            }}
                          >
                            Decline
                          </Btn>
                        </div>
                      )}
                      {p.status === "requested" && mine && (
                        <Btn size="sm" variant="secondary" loading={busy === `d${p.id}`}
                          onClick={() => run("payout_decline", { id: p.id }, "Request cancelled.", `d${p.id}`)}>
                          Cancel
                        </Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
