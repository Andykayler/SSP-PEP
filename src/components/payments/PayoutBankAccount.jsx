// src/components/payments/PayoutBankAccount.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin → School Settings: the bank account the school's online fee money is
// paid into. Only the administrator can change it, and the server enforces that
// — a payout goes wherever this points, so it is the one place worth protecting.
// Payouts the director is asked to approve carry a copy of the account as it was
// when they were requested, so changing it afterwards cannot redirect them.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { payoutAction } from "../../services/paychangu";

export default function PayoutBankAccount() {
  const [state, setState] = useState(null);
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({ bankUuid: "", accountName: "", accountNumber: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    payoutAction("payout_state").then((s) => alive && setState(s)).catch(() => alive && setState({}));
    payoutAction("payout_banks").then((r) => alive && setBanks(r.banks || [])).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await payoutAction("payout_save_destination", form);
      setState(await payoutAction("payout_state"));
      setForm({ bankUuid: "", accountName: "", accountNumber: "" });
      setMsg({ ok: true, text: "Bank account saved." });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  }

  const current = state?.destination;

  return (
    <div className="card" style={{ padding: 28 }}>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 8 }}>
        <Landmark size={16} aria-hidden="true" /> Payout Bank Account
      </p>
      <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, marginBottom: 14 }}>
        Online fee payments are collected by Acalink. When the bursar requests a payout and
        the director approves it, the money is sent to this bank account.
      </p>

      {current?.bankName && (
        <div className="alert alert--info" style={{ marginBottom: 14 }}>
          <span>Current: <strong>{current.bankName}</strong> · {current.accountName} · {current.accountMask}</span>
        </div>
      )}
      {msg && <div className={`alert alert--${msg.ok ? "success" : "error"}`} style={{ marginBottom: 14 }}><span>{msg.text}</span></div>}

      <div className="grid-2">
        <div className="field">
          <label className="field__label" htmlFor="payout-bank">Bank</label>
          <select id="payout-bank" className="field__select" value={form.bankUuid} onChange={(e) => setForm((f) => ({ ...f, bankUuid: e.target.value }))}>
            <option value="">{banks.length ? "Choose a bank" : "Loading banks…"}</option>
            {banks.map((b) => <option key={b.uuid} value={b.uuid}>{b.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="payout-acc-name">Account name</label>
          <input id="payout-acc-name" className="field__input" value={form.accountName}
            onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} placeholder="As the bank has it" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="payout-acc-no">Account number</label>
          <input id="payout-acc-no" className="field__input" inputMode="numeric" value={form.accountNumber}
            onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} placeholder="Digits only" />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
        <button type="button" className="btn btn--accent btn--md" onClick={save} disabled={busy}>
          {busy ? "Saving…" : current?.bankName ? "Replace bank account" : "Save bank account"}
        </button>
      </div>
    </div>
  );
}
