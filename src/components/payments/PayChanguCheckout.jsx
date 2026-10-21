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
import { calculateTransactionFee } from "../../services/transactionFeeCore";
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
  const [network, setNetwork] = useState("airtel");

  const stopWatching = useRef(null);

  // A poll left running against a closed dialog keeps asking the gateway about
  // a transaction nobody is looking at, so it is cancelled on unmount.
  useEffect(() => () => stopWatching.current?.(), []);

  const payable = amountEditable ? Math.round(Number(amount) || 0) : Math.round(defaultAmount || 0);
  // The subscription is Acalink billing the school directly, not a payment
  // passed through the processor on someone else's behalf — no surcharge.
  const fee = purpose === "subscription" ? null : calculateTransactionFee(payable);

  // A fee is paid with a PIN prompt on the payer's phone, inside this dialog.
  // A subscription, and anyone who wants to pay by card or bank, uses the
  // hosted checkout — a card number is never typed into anything we build.
  const canPromptPhone = purpose !== "subscription";

  async function begin(card = false, bank = false) {
    if (amountEditable && payable <= 0) { setError("Enter an amount to pay."); return; }
    const inApp = canPromptPhone && !card && !bank;
    if (inApp && phone.replace(/\D/g, "").length < 9) { setError("Enter the mobile money number to pay from."); return; }

    setBusy(true);
    setError("");
    try {
      const created = await startCheckout({
        purpose,
        amount: payable,
        payerName: name,
        payerEmail: email,
        payerPhone: phone,
        ...(inApp ? { method: "mobile_money", network, mobile: phone } : {}),
        ...(canPromptPhone && bank ? { method: "bank_transfer" } : {}),
        ...context,
      });

      setTx(created);
      setStage("waiting");

      if (!created.direct && !created.bankTransfer) {
        const sameTab = !openCheckout(created.checkoutUrl);
        if (sameTab) return;   // this tab is navigating away; nothing left to do
        setNotice("Complete the payment in the tab that just opened. This page updates on its own.");
      } else {
        setNotice("");
      }

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
            {tx?.fee > 0 && (
              <p className="text-muted" style={{ fontSize: 12 }}>
                + {money(tx.fee)} transaction fee = {money(tx.chargeAmount)} charged
              </p>
            )}
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
            {tx?.fee > 0 && (
              <p className="text-muted" style={{ fontSize: 12 }}>
                + {money(tx.fee)} transaction fee = {money(tx.chargeAmount)} charged
              </p>
            )}
            <p className="text-muted" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
              {tx?.txRef}
            </p>
          </div>

          {notice && <Notice tone="info">{notice}</Notice>}

          {tx?.bankTransfer ? (
            <>
              <div className="card p-4" style={{ fontSize: 13.5, lineHeight: 1.9 }}>
                <div className="flex justify-between"><span className="text-muted">Bank</span><b>{tx.bankTransfer.bankName}</b></div>
                <div className="flex justify-between"><span className="text-muted">Account name</span><b>{tx.bankTransfer.accountName}</b></div>
                <div className="flex justify-between"><span className="text-muted">Account number</span>
                  <b>{tx.bankTransfer.accountNumber}{" "}
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard?.writeText(tx.bankTransfer.accountNumber)}>Copy</button></b></div>
                <div className="flex justify-between"><span className="text-muted">Send exactly</span><b>{money(tx.bankTransfer.payExactly)}</b></div>
              </div>
              <ol className="text-muted" style={{ fontSize: 12.5, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Use Instant Transfer from any bank app or USSD.</li>
                <li>Send exactly {money(tx.bankTransfer.payExactly)}. A different amount is declined.</li>
                <li>This updates by itself once the transfer arrives. The account is valid for an hour.</li>
              </ol>
            </>
          ) : tx?.direct ? (
            <ol className="text-muted" style={{ fontSize: 12.5, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>A payment prompt has been sent to {phone}.</li>
              <li>Enter your {network === "tnm" ? "TNM Mpamba" : "Airtel Money"} PIN to approve it.</li>
              <li>This updates by itself once it clears, usually within a minute.</li>
            </ol>
          ) : (
            <ol className="text-muted" style={{ fontSize: 12.5, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Choose Airtel Money, TNM Mpamba or card on the PayChangu page.</li>
              <li>Approve the prompt on the phone the number belongs to.</li>
              <li>Come back here — this updates by itself, usually within a minute.</li>
            </ol>
          )}

          <Notice tone="info">
            You can close this. The payment is confirmed on our servers whether or not this
            page is open, and the receipt appears once it clears.
          </Notice>

          <div className="flex justify-between" style={{ gap: 8, alignItems: "center" }}>
            {tx?.checkoutUrl ? <a
              href={tx?.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <ExternalLink size={14} /> Reopen checkout
            </a> : <span />}
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

        {canPromptPhone ? (
          <div style={{ display: "flex", gap: 10 }}>
            {[["airtel", "Airtel Money"], ["tnm", "TNM Mpamba"]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setNetwork(id)}
                className={network === id ? "btn btn--accent" : "btn btn--ghost"}
                style={{ flex: 1 }}
              >
                <Smartphone size={14} /> {label}
              </button>
            ))}
          </div>
        ) : (
        <div className="card p-4" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {CHECKOUT_METHODS.map((m) => (
            <span key={m.id} className="tag" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {m.id === "card" ? <CreditCard size={13} /> : <Smartphone size={13} />}
              {m.label}
            </span>
          ))}
        </div>
        )}

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

        {fee && payable > 0 && (
          <div className="card p-4" style={{ fontSize: 12.5 }}>
            <div className="flex justify-between"><span className="text-muted">Fees</span><span>{money(fee.amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Transaction fee</span><span>{money(fee.fee)}</span></div>
            <div className="flex justify-between" style={{ fontWeight: 700, marginTop: 4 }}>
              <span>Total to pay</span><span>{money(fee.total)}</span>
            </div>
          </div>
        )}

        {canPromptPhone && (
          <div className="card p-4 text-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            <p><b>Mobile money:</b> a PIN prompt appears on the number you enter. Approve it there.</p>
            <p><b>Bank transfer:</b> we show an account number and the exact amount. Send it from your own bank app or USSD (Instant Transfer).</p>
            <p><b>Card:</b> opens PayChangu's secure page in a new tab.</p>
          </div>
        )}

        <Input label="Payer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Mwale" />
        <Input
          label="Mobile money number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+265 9xx xxx xxx"
          hint={canPromptPhone ? "The phone that will get the PIN prompt." : "The handset that will approve the payment."}
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
          {canPromptPhone && (
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => begin(false, true)}>Pay by bank transfer</Btn>
              <Btn variant="ghost" disabled={busy} onClick={() => begin(true)}>Pay by card</Btn>
            </>
          )}
          <Btn variant="accent" loading={busy} onClick={() => begin(false)} icon={<Smartphone size={15} />}>
            {canPromptPhone ? "Pay now" : "Continue to PayChangu"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
