// src/components/fees/ArrearsModule.jsx
// Who owes, for how long, and what the school has decided about it.
//
// Shared by the bursar and the head teacher because it is one conversation
// held between them: the bursar knows the balance, the head teacher makes the
// call on exam entry. Only the head teacher may change a clearance — the
// `canDecide` prop — but both see the same list, so neither is working from a
// figure the other has not seen.
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  Wallet, Send, ShieldCheck, ShieldAlert, CalendarClock, RefreshCw, Search,
  MessageCircle,
} from "lucide-react";
import {
  buildArrears, AGE_BUCKETS, stageFor, sendReminders, fetchClearances,
  setClearance, clearClearance, CLEARANCE_STATUS, fetchPlans, savePlan,
  planBehind, fetchReminders,
} from "../../services/feeClearance";
import { sendWhatsAppReminders } from "../../services/whatsappReminders";
import { subscribeSchoolSettings } from "../../services/academicTerm";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, Pill, EmptyState, StatGrid,
  StatCard, ModuleHeader, Notice, LoadingState, FilterBar, TableWrap,
} from "../ui/ModuleKit";
import "../../pages/burser/modules/staff-management.css";
import useLoader from "../../hooks/useLoader";
import { money } from "../ui/format";

export default function ArrearsModule({ schoolCode, currentUser, canDecide = false }) {
  const [rows, setRows] = useState(null);
  const [term, setTerm] = useState("");
  const [clearances, setClearances] = useState(new Map());
  const [plans, setPlans] = useState(new Map());
  const [reminders, setReminders] = useState([]);
  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [decision, setDecision] = useState(null);   // { student, status, reason }
  const [planFor, setPlanFor] = useState(null);     // { student, instalments }

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!schoolCode || !term) return;
    try {
      // Every query filters on schoolCode: a list is authorised from its own
      // constraints, not from the documents it happens to return.
      const [studentSnap, chargeSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode))),
      ]);
      const students = studentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const charges = chargeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const payments = paySnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        // An unverified payment is a claim someone typed in, not money the
        // school has. Counting it would clear a debt that is still owed.
        .filter((p) => p.status === "verified");

      const [cl, pl, rm] = await Promise.all([
        fetchClearances(schoolCode, term),
        fetchPlans(schoolCode, term),
        fetchReminders(schoolCode, term),
      ]);
      setClearances(cl);
      setPlans(pl);
      setReminders(rm);
      setRows(buildArrears({ students, charges, payments, currentTerm: term }));
    } catch (err) {
      console.error("[arrears] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load fee records: " + err.message });
      setRows([]);
    }
  }, [schoolCode, term]);

  useLoader(load);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, (s) => setTerm(s?.currentTerm || ""));
  }, [schoolCode]);


  // ── Derived ────────────────────────────────────────────────────────────────
  const owing = useMemo(() => (rows || []).filter((r) => r.balance > 0), [rows]);

  const counts = useMemo(() => {
    const c = { all: owing.length };
    AGE_BUCKETS.forEach((b) => { c[b.id] = 0; });
    owing.forEach((r) => { if (r.bucket) c[r.bucket.id] += 1; });
    return c;
  }, [owing]);

  const totals = useMemo(() => ({
    outstanding: owing.reduce((s, r) => s + r.balance, 0),
    chronic: owing.filter((r) => r.termsOld >= 2).reduce((s, r) => s + r.balance, 0),
    withheld: [...clearances.values()].filter((c) => c.status !== "cleared").length,
    onPlan: plans.size,
  }), [owing, clearances, plans]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return owing
      .filter((r) => bucket === "all" || r.bucket?.id === bucket)
      .filter((r) => !q
        || r.fullName?.toLowerCase().includes(q)
        || r.className?.toLowerCase().includes(q))
      .sort((a, b) => b.termsOld - a.termsOld || b.balance - a.balance);
  }, [owing, bucket, search]);

  const remindedIds = useMemo(
    () => new Set(reminders.map((r) => r.studentId)), [reminders],
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  const remind = async () => {
    const targets = visible.filter((r) => r.guardianPhone);
    if (targets.length === 0) {
      setNotice({ tone: "warning", text: "None of these families has a phone number on record." });
      return;
    }
    const stages = new Set(targets.map((r) => stageFor(r)?.label).filter(Boolean));
    if (!window.confirm(
      `Send ${targets.length} reminder${targets.length === 1 ? "" : "s"} (${[...stages].join(", ")})?\n\n`
      + "Each family gets the wording their arrears warrant, with their own balance.")) return;

    setBusy(true);
    const res = await sendReminders({
      schoolCode, rows: targets, term, actor: currentUser,
    });
    setBusy(false);
    setNotice(res.ok
      ? { tone: "success", text: `${res.sent} reminder${res.sent === 1 ? "" : "s"} sent.` }
      : { tone: "danger", text: res.error });
    if (res.ok) load();
  };

  /**
   * The same escalation wording as `remind` above, sent over WhatsApp instead
   * — and, unlike the in-app channel, ending with an invitation to pay right
   * there in the chat (see docs/whatsapp-waapi.md). Capped server-side per
   * call to keep the connected WhatsApp number from looking like it is
   * blasting messages; `remaining` tells the bursar to click again.
   */
  const remindWhatsApp = async () => {
    const targets = visible.filter((r) => r.guardianPhone);
    if (targets.length === 0) {
      setNotice({ tone: "warning", text: "None of these families has a phone number on record." });
      return;
    }
    if (!window.confirm(
      `Send ${targets.length} WhatsApp reminder${targets.length === 1 ? "" : "s"}?\n\n`
      + "Each family gets the wording their arrears warrant, with an invitation to pay by replying "
      + "\"Make Payment\".")) return;

    setWaBusy(true);
    const res = await sendWhatsAppReminders(targets.map((r) => r.id));
    setWaBusy(false);

    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    const more = res.remaining
      ? ` ${res.remaining} more ${res.remaining === 1 ? "is" : "are"} still due — click again to continue.`
      : "";
    setNotice({
      tone: res.failed ? "warning" : "success",
      text: `${res.sent} WhatsApp reminder${res.sent === 1 ? "" : "s"} sent`
        + (res.failed ? `, ${res.failed} failed` : "") + `.${more}`,
    });
  };

  const submitDecision = async () => {
    setBusy(true);
    const res = decision.status === "remove"
      ? await clearClearance({ schoolCode, studentId: decision.student.id, term })
      : await setClearance({
        schoolCode, student: decision.student, term,
        status: decision.status, reason: decision.reason, actor: currentUser,
      });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setDecision(null);
    setNotice({ tone: "success", text: "Decision recorded and the family told." });
    load();
  };

  const submitPlan = async () => {
    setBusy(true);
    const res = await savePlan({
      schoolCode, student: planFor.student, term,
      instalments: planFor.instalments, note: planFor.note, actor: currentUser,
    });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setPlanFor(null);
    setNotice({ tone: "success", text: "Payment plan recorded." });
    load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!term) {
    return (
      <EmptyState
        icon={<CalendarClock size={28} />}
        title="No term is set"
        sub="Arrears are worked out per term. Set the current term on the head teacher's dashboard first."
      />
    );
  }
  if (rows === null) return <LoadingState label="Working out arrears…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Arrears & Clearance"
        subtitle={`${term} · payments applied to the oldest charge first`}
        actions={[
          <IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />,
          <Btn key="s" variant="accent" icon={<Send size={15} />} loading={busy}
            onClick={remind} disabled={visible.length === 0}>
            Send reminders ({visible.length})
          </Btn>,
          <Btn key="wa" variant="secondary" icon={<MessageCircle size={15} />} loading={waBusy}
            onClick={remindWhatsApp} disabled={visible.length === 0}>
            WhatsApp ({visible.length})
          </Btn>,
        ]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Total outstanding" value={money(totals.outstanding)} tone="warning"
          sub={`${owing.length} of ${rows.length} students`} />
        <StatCard label="Carried two terms or more" value={money(totals.chronic)} tone="danger"
          sub="The debt least likely to be recovered" />
        <StatCard label="Withheld" value={totals.withheld} tone={totals.withheld ? "danger" : "success"}
          sub="Exams or report cards held back" />
        <StatCard label="On a payment plan" value={totals.onPlan} tone="success"
          sub="Not chased while they keep to it" />
      </StatGrid>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={15} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search by name or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterBar
          value={bucket}
          onChange={setBucket}
          options={[
            { id: "all", label: "All owing", count: counts.all },
            ...AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: counts[b.id] })),
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title={owing.length === 0 ? "Nobody is in arrears" : "Nothing in this bucket"}
          sub={owing.length === 0
            ? "Every student with a charge against them has paid it."
            : "Try a different age bucket or clear the search."}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Owed</th>
                <th>Oldest debt</th>
                <th>Age</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const cl = clearances.get(r.id);
                const plan = plans.get(r.id);
                const stage = stageFor(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.fullName}</strong>
                      {!r.guardianPhone && (
                        <div className="text-danger" style={{ fontSize: 11 }}>no guardian phone</div>
                      )}
                    </td>
                    <td className="text-muted">{r.className || "—"}</td>
                    <td>
                      <strong>{money(r.balance)}</strong>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        {r.percentPaid}% of {money(r.totalCharged)} paid
                      </div>
                    </td>
                    <td className="text-muted">{r.oldestUnpaidTerm || "—"}</td>
                    <td><Pill tone={r.bucket?.tone}>{r.bucket?.label}</Pill></td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                        {cl && (
                          <Pill tone={CLEARANCE_STATUS[cl.status]?.tone}>
                            {CLEARANCE_STATUS[cl.status]?.label}
                          </Pill>
                        )}
                        {plan && (
                          <Pill tone={planBehind(plan) ? "danger" : "success"}>
                            {planBehind(plan) ? "Plan behind" : "On plan"}
                          </Pill>
                        )}
                        {!cl && !plan && stage && (
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            {remindedIds.has(r.id) ? "reminded" : `${stage.label} due`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="flex gap-2 justify-end">
                        <IconBtn
                          icon={<CalendarClock size={15} />}
                          title="Record a payment plan"
                          onClick={() => setPlanFor({
                            student: r, note: "",
                            instalments: [{ dueDate: "", amount: r.balance, paid: false }],
                          })}
                        />
                        {canDecide && (
                          <IconBtn
                            icon={cl && cl.status !== "cleared"
                              ? <ShieldAlert size={15} />
                              : <ShieldCheck size={15} />}
                            title="Set exam and report card clearance"
                            danger={Boolean(cl && cl.status !== "cleared")}
                            onClick={() => setDecision({
                              student: r,
                              status: cl?.status || "cleared",
                              reason: cl?.reason || "",
                            })}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {!canDecide && (
        <p className="text-muted" style={{ fontSize: 12 }}>
          Only the head teacher can withhold examinations or a report card. Send a reminder or record
          a payment plan from here, and raise anything else with them.
        </p>
      )}

      {/* ── Clearance decision ─────────────────────────────────────────────── */}
      {decision && (
        <Modal
          title={`Clearance — ${decision.student.fullName}`}
          subtitle={`${money(decision.student.balance)} outstanding from ${decision.student.oldestUnpaidTerm}`}
          onClose={() => setDecision(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setDecision(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submitDecision}>Record decision</Btn>
            </>
          )}
        >
          <div className="space-y-4">
            <Select
              label="Decision" required
              value={decision.status}
              onChange={(e) => setDecision((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="cleared">Cleared — may sit exams and receive the report card</option>
              <option value="exams_only">Exams only — report card held back</option>
              <option value="blocked">Withheld — no exams, no report card</option>
              <option value="remove">Remove the decision entirely</option>
            </Select>

            {decision.status !== "remove" && (
              <Textarea
                label={decision.status === "cleared" ? "Note (optional)" : "Reason"}
                required={decision.status !== "cleared"}
                hint="The family is sent this wording, so write it to them."
                value={decision.reason}
                onChange={(e) => setDecision((p) => ({ ...p, reason: e.target.value }))}
                placeholder={decision.status === "cleared"
                  ? "Cleared on the strength of the agreed payment plan."
                  : "Fees for Term 1 remain unpaid. Please come to the office before the examinations begin."}
              />
            )}

            <p className="text-muted" style={{ fontSize: 12 }}>
              This is recorded against {decision.student.fullName} for {term} and the guardian is
              notified straight away. The report card module checks it before releasing results.
            </p>
          </div>
        </Modal>
      )}

      {/* ── Payment plan ───────────────────────────────────────────────────── */}
      {planFor && (
        <Modal
          title={`Payment plan — ${planFor.student.fullName}`}
          subtitle={`${money(planFor.student.balance)} outstanding`}
          onClose={() => setPlanFor(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setPlanFor(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submitPlan}>Save plan</Btn>
            </>
          )}
        >
          <div className="space-y-4">
            {planFor.instalments.map((inst, i) => (
              <div key={i} className="grid grid-cols-2 gap-4">
                <Input
                  label={`Instalment ${i + 1} — due`} type="date"
                  value={inst.dueDate}
                  onChange={(e) => setPlanFor((p) => {
                    const next = [...p.instalments];
                    next[i] = { ...next[i], dueDate: e.target.value };
                    return { ...p, instalments: next };
                  })}
                />
                <Input
                  label="Amount" type="number" min="0"
                  value={inst.amount}
                  onChange={(e) => setPlanFor((p) => {
                    const next = [...p.instalments];
                    next[i] = { ...next[i], amount: e.target.value };
                    return { ...p, instalments: next };
                  })}
                />
              </div>
            ))}
            <Btn
              variant="secondary" size="sm"
              onClick={() => setPlanFor((p) => ({
                ...p, instalments: [...p.instalments, { dueDate: "", amount: "", paid: false }],
              }))}
            >
              Add another instalment
            </Btn>
            <Textarea
              label="Note"
              hint="What was agreed, and with whom."
              value={planFor.note}
              onChange={(e) => setPlanFor((p) => ({ ...p, note: e.target.value }))}
            />
            <p className="text-muted" style={{ fontSize: 12 }}>
              A family keeping to a plan still appears here, marked <em>On plan</em>, so they are not
              chased as though they were ignoring the school.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
