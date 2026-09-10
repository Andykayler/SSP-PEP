// src/components/payments/PayChanguCheckout.jsx
// ─────────────────────────────────────────────────────────────────────────────
// One dialog for taking a payment, used by both the bursar's fee ledger and
// the administrator's subscription page.
//
// The two flows differ only in what they are paying for, and that difference
// is already handled on the server — so a single component here avoids the
// usual outcome, where the second payment surface is a copy of the first that
// then drifts. The states it can be in are the states a mobile-money payment
// actually has:
//
//   form      → the payer confirms the amount and who they are
//   waiting   → the checkout is open in another tab; we poll
//   success   → the gateway confirmed it, and a receipt number exists
//   failed    → the gateway said no, or the payer cancelled
//
// "Waiting" is not a spinner with no exit. A mobile-money payment can take
// minutes — the payer has to find their phone and enter a PIN — and it can
// also be completed on a device that never comes back to this browser. So the
// dialog says what to do, keeps polling, and can be closed without losing the
// payment: settlement happens on the server whether anyone is watching or not.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { CreditCard, Smartphone, CheckCircle2, XCircle, ExternalLink, Clock } from "lucide-react";
import { Modal, Btn, Input, Notice, Spinner } from "../ui/ModuleKit";
import { money } from "../ui/format";
import { startCheckout, watchTransaction, openCheckout, CHECKOUT_METHODS } from "../../services/paychangu";
import "../../pages/burser/modules/staff-management.css";

export default function PayChanguCheckout({
  purpose = "school_fee",
  title = "Pay online",
  subtitle = "",
  // What is being paid for. For a fee: student + term. For a subscription:
  // cadence. Anything else is ignored by the server.
  context = {},
  // Suggested amount. Editable for a fee (part-payment is normal), fixed for a
  // subscription, where the server reprices from the roll and would reject it.
  defaultAmount = 0,
  amountEditable = true,
  payerName = "",
  payerEmail = "",
  payerPhone = "",
  onClose,
  onSettled,
}) {
  const [stage, setStage] = useState("form");
  const [amount, setAmount] = useState(defaultAmount ? String(Math.round(defaultAmount)) : "");
  const [name, setName] = useState(payerName);
  const [email, setEmail] = useState(payerEmail);
  const [phone, setPhone] = useState(payerPhone);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState(null);

  const stopWatching = useRef(null);

  // A poll left running against a closed dialog keeps asking the gateway about
  // a transaction nobody is looking at, so it is cancelled on unmount.
  useEffect(() => () => stopWatching.current?.(), []);

  const payable = amountEditable ? Math.round(Number(amount) || 0) : Math.round(defaultAmount || 0);

  async function begin() {
    if (amountEditable && payable <= 0) { setError("Enter an amount to pay."); return; }

    setBusy(true);
    setError("");
    try {
      const created = await startCheckout({
        purpose,
        amount: payable,
        payerName: name,
        payerEmail: email,
        payerPhone: phone,
        ...context,
      });

      setTx(created);
      setStage("waiting");

      const sameTab = !openCheckout(created.checkoutUrl);
      if (sameTab) return;   // this tab is navigating away; nothing left to do

      setNotice("Complete the payment in the tab that just opened. This page updates on its own.");

      stopWatching.current = watchTransaction(created.txRef, {
        onSettled: (state) => {
          setTx((prev) => ({ ...prev, ...state }));
          if (state.status === "success") {
            setStage("success");
            onSettled?.(state);
          } else {
            setStage("failed");
            setError(
              state.status === "underpaid"
                ? "The gateway received less than the amount requested. Acalink support has the details."
                : "The payment did not go through. Nothing has been charged."
            );
          }
        },
        onError: (err) => setNotice(err.message),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Settled ───────────────────────────────────────────────────────────────
  if (stage === "success") {
    return (
      <Modal title="Payment received" subtitle={subtitle} onClose={onClose}>
        <div className="space-y-4" style={{ textAlign: "center", padding: "12px 0" }}>
          <CheckCircle2 size={44} style={{ color: "var(--success, #22c55e)", margin: "0 auto" }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 18 }}>{money(tx?.amount ?? payable)}</p>
            <p className="text-muted" style={{ fontSize: 13 }}>
              confirmed by PayChangu{tx?.receiptNo ? ` · receipt ${tx.receiptNo}` : ""}
            </p>
          </div>
          <p className="text-muted" style={{ fontSize: 12.5 }}>
            {purpose === "subscription"
              ? "Your subscription is now active. The receipt is on the Billing page."
              : "The ledger has been updated and the receipt is available in Receipts."}
          </p>
          <Btn variant="accent" onClick={onClose}>Done</Btn>
        </div>
      </Modal>
    );
  }

  if (stage === "failed") {
    return (
      <Modal title="Payment not completed" subtitle={subtitle} onClose={onClose}>
        <div className="space-y-4" style={{ textAlign: "center", padding: "12px 0" }}>
          <XCircle size={44} style={{ color: "var(--danger, #ef4444)", margin: "0 auto" }} />
          <p style={{ fontSize: 13.5 }}>{error}</p>
          <div className="flex justify-center" style={{ gap: 8 }}>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            <Btn variant="accent" onClick={() => { setStage("form"); setError(""); setNotice(""); }}>
              Try again
            </Btn>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Waiting on the gateway ────────────────────────────────────────────────
  if (stage === "waiting") {
    return (
      <Modal title="Waiting for payment" subtitle={subtitle} onClose={onClose}>
        <div className="space-y-4" style={{ padding: "8px 0" }}>
          <div style={{ textAlign: "center" }}>
            <Clock size={40} style={{ color: "var(--primary)", margin: "0 auto 10px" }} />
            <p style={{ fontWeight: 700, fontSize: 18 }}>{money(tx?.amount ?? payable)}</p>
            <p className="text-muted" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
              {tx?.txRef}
            </p>
          </div>

          {notice && <Notice tone="info">{notice}</Notice>}

          <ol className="text-muted" style={{ fontSize: 12.5, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Choose Airtel Money, TNM Mpamba or card on the PayChangu page.</li>
            <li>Approve the prompt on the phone the number belongs to.</li>
            <li>Come back here — this updates by itself, usually within a minute.</li>
          </ol>

          <Notice tone="info">
            You can close this. The payment is confirmed on our servers whether or not this
            page is open, and the receipt appears once it clears.
          </Notice>

          <div className="flex justify-between" style={{ gap: 8, alignItems: "center" }}>
            <a
              href={tx?.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <ExternalLink size={14} /> Reopen checkout
            </a>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <Spinner /> <span className="text-muted" style={{ fontSize: 12 }}>Checking…</span>
            </span>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}

        <div className="card p-4" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {CHECKOUT_METHODS.map((m) => (
            <span key={m.id} className="tag" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {m.id === "card" ? <CreditCard size={13} /> : <Smartphone size={13} />}
              {m.label}
            </span>
          ))}
        </div>

        {amountEditable ? (
          <Input
            label="Amount to pay (MWK)"
            required
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="Part-payment is fine. Whatever clears is what the ledger is credited with."
          />
        ) : (
          <div className="card p-4">
            <p className="text-muted" style={{ fontSize: 12 }}>Amount due</p>
            <p style={{ fontWeight: 700, fontSize: 22 }}>{money(defaultAmount)}</p>
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Recalculated from your roll when the checkout opens, so this cannot drift from
              your invoice.
            </p>
          </div>
        )}

        <Input label="Payer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Mwale" />
        <Input
          label="Mobile money number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+265 9xx xxx xxx"
          hint="The handset that will approve the payment."
        />
        <Input
          label="Email for the receipt"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="optional"
        />

        <div className="flex justify-end" style={{ gap: 8, paddingTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="accent" loading={busy} onClick={begin} icon={<CreditCard size={15} />}>
            Continue to PayChangu
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
