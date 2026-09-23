// src/pages/platform/modules/SchoolsConsole.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Every school on Acalink, and the decisions the platform owner makes about it:
// approve a new registration, turn one away, suspend, give more trial, or put a
// school that registered before approval existed onto a proper plan.
//
// Nothing here is reachable by a school itself — the rules allow these writes
// only for the platform owner — and each action is logged to `platform_audit`.
// The school is told by the `onSchoolStatusChange` Cloud Function, not here.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, X, Pause, Play, CalendarPlus, MailCheck, MailWarning, MessageCircle, History } from "lucide-react";
import {
  subscribeSchools, approveSchool, rejectSchool, suspendSchool, reinstateSchool,
  extendTrial, putLegacyOnPlan,
} from "../../../services/platform";
import { schoolAccess, toMs, TRIAL_DAYS } from "../../../services/subscriptionState";
import { apiPost } from "../../../services/api";
import { countSchools } from "../../../services/platformSummary";
import {
  Modal, Btn, Input, Textarea, Pill, EmptyState, StatGrid, StatCard,
  ModuleHeader, Notice, LoadingState, TableWrap, FilterBar,
} from "../../../components/ui/ModuleKit";
import "../../headteacher/modules/staff-management.css";

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_TONE = { pending: "warning", active: "success", rejected: "danger", suspended: "danger" };

function planLabel(school, access) {
  if (access.state === "legacy") return "Legacy (no expiry)";
  if (school.status !== "active") return "—";
  if (school.subscription_status === "active") {
    const pt = toMs(school.paidThrough);
    return pt ? `Paid until ${fmtDate(pt)}` : "Paid";
  }
  const te = toMs(school.trialEndsAt);
  if (!te) return "Trial";
  return access.daysLeft !== null && access.state === "trial"
    ? `Trial · ${access.daysLeft} day${access.daysLeft === 1 ? "" : "s"} left`
    : `Trial ended ${fmtDate(te)}`;
}

export default function SchoolsConsole({ currentUser, initialFilter = "pending" }) {
  const [schools, setSchools] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState("");
  const [verified, setVerified] = useState({});
  const [dialog, setDialog] = useState(null);      // { kind, school }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [field, setField] = useState("");          // reason / days input

  useEffect(() => subscribeSchools(setSchools, (e) => { setError(e.message); setSchools([]); }), []);

  // Email verification lives in Firebase Auth, so it comes from the server.
  useEffect(() => {
    if (!schools) return;
    const need = schools.filter((s) => s.authUid && s.status === "pending" && !(s.authUid in verified)).map((s) => s.authUid);
    if (need.length === 0) return;
    apiPost("/api/platform/email-status", { authUids: need })
      .then((r) => setVerified((v) => ({ ...v, ...r.verified })))
      .catch(() => { /* the badge just stays "unknown" */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools]);

  const rows = useMemo(
    () => (schools || []).map((s) => ({ ...s, access: schoolAccess(s) })),
    [schools],
  );

  const counts = useMemo(() => countSchools(rows), [rows]);

  const visible = rows.filter((s) => {
    const q = search.trim().toLowerCase();
    if (q && ![s.name, s.code, s.district, s.email, s.phone].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    if (filter === "all") return true;
    if (filter === "pending") return s.status === "pending";
    if (filter === "legacy") return s.access.state === "legacy";
    if (filter === "attention") return s.access.restricted || s.access.state === "trial_grace" || s.access.state === "past_due_grace";
    if (filter === "closed") return s.status === "rejected" || s.status === "suspended";
    if (filter === "active") return s.status === "active" && s.access.state !== "legacy";
    return true;
  });

  const open = (kind, school) => { setField(kind === "approve" ? String(TRIAL_DAYS) : kind === "extend" ? "14" : ""); setDialog({ kind, school }); };
  const close = () => { setDialog(null); setField(""); };

  const run = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      setNotice({ tone: "success", text: label });
      close();
    } catch (err) {
      setNotice({ tone: "danger", text: err.message || "That didn't go through." });
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const { kind, school } = dialog;
    const days = Math.max(1, Math.min(365, Number(field) || 0));
    if (kind === "approve") return run(`${school.name} approved. They've been notified.`, () => approveSchool(school, currentUser, { trialDays: days }));
    if (kind === "reject") return run(`${school.name} was turned away.`, () => rejectSchool(school, currentUser, field.trim()));
    if (kind === "suspend") return run(`${school.name} suspended.`, () => suspendSchool(school, currentUser, field.trim()));
    if (kind === "reinstate") return run(`${school.name} reinstated.`, () => reinstateSchool(school, currentUser));
    if (kind === "extend") return run(`Trial extended by ${days} days.`, () => extendTrial(school, currentUser, days));
    if (kind === "legacy") return run(`${school.name} is now on a ${days}-day trial.`, () => putLegacyOnPlan(school, currentUser, { days }));
    return undefined;
  };

  const titles = {
    approve: "Approve this school", reject: "Turn this registration away", suspend: "Suspend this school",
    reinstate: "Reinstate this school", extend: "Extend the trial", legacy: "Put this school on a plan",
  };
  const needsReason = dialog && (dialog.kind === "reject" || dialog.kind === "suspend");
  const needsDays = dialog && ["approve", "extend", "legacy"].includes(dialog.kind);

  if (schools === null) return <LoadingState label="Loading schools…" />;

  return (
    <div>
      <ModuleHeader
        title="Schools"
        subtitle="Approve new registrations and manage who can use Acalink"
      />

      {error && <Notice tone="danger">Could not load schools: {error}</Notice>}
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Awaiting approval" value={counts.pending} tone={counts.pending ? "warning" : undefined} />
        <StatCard label="On trial" value={counts.trial} />
        <StatCard label="Paying" value={counts.paying} tone="success" />
        <StatCard label="Needs attention" value={counts.attention} tone={counts.attention ? "danger" : undefined} sub="Trial or payment lapsed" />
        <StatCard label="Legacy" value={counts.legacy} sub="Registered before approval existed" />
      </StatGrid>

      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
        <FilterBar
          value={filter}
          onChange={setFilter}
          options={[
            { id: "pending", label: "Awaiting approval", count: counts.pending },
            { id: "active", label: "Active" },
            { id: "attention", label: "Needs attention", count: counts.attention },
            { id: "legacy", label: "Legacy", count: counts.legacy },
            { id: "closed", label: "Rejected / suspended", count: counts.closed },
            { id: "all", label: "All", count: rows.length },
          ]}
        />
        <input
          className="search-input"
          style={{ maxWidth: 260 }}
          placeholder="Search name, code, district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title={filter === "pending" ? "No registrations are waiting" : "No schools match"}
          sub={filter === "pending" ? "New registrations will appear here the moment a school signs up." : "Try another filter or search."}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th>School</th><th>Contact</th><th>Registered</th><th>Status</th><th>Plan</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const wa = String(s.phone || "").replace(/[^\d]/g, "");
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name || "(unnamed)"}</strong>
                      <div className="text-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{s.code || s.id}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{s.district}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{s.email || "—"}</div>
                      <div style={{ fontSize: 12 }}>
                        {s.phone || "—"}
                        {wa && (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" title="Open in WhatsApp" style={{ marginLeft: 8, color: "var(--success-light)" }}>
                            <MessageCircle size={13} style={{ verticalAlign: "-2px" }} />
                          </a>
                        )}
                      </div>
                      {s.status === "pending" && (
                        verified[s.authUid] === true
                          ? <span style={{ fontSize: 11, color: "var(--success-light)" }}><MailCheck size={12} style={{ verticalAlign: "-2px" }} /> Email verified</span>
                          : verified[s.authUid] === false
                            ? <span style={{ fontSize: 11, color: "var(--warning-light)" }}><MailWarning size={12} style={{ verticalAlign: "-2px" }} /> Email not verified</span>
                            : null
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{fmtDate(toMs(s.createdAt))}</td>
                    <td>
                      <Pill tone={STATUS_TONE[s.status] || "neutral"}>{s.status ? s.status[0].toUpperCase() + s.status.slice(1) : "Legacy"}</Pill>
                      {(s.rejectedReason || s.suspendedReason) && (
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 4, maxWidth: 180 }}>{s.rejectedReason || s.suspendedReason}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{planLabel(s, s.access)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {s.status === "pending" && (
                        <>
                          <Btn size="sm" variant="accent" icon={<Check size={14} />} onClick={() => open("approve", s)}>Approve</Btn>{" "}
                          <Btn size="sm" variant="danger" icon={<X size={14} />} onClick={() => open("reject", s)}>Reject</Btn>
                        </>
                      )}
                      {s.status === "active" && (
                        <>
                          <Btn size="sm" variant="secondary" icon={<CalendarPlus size={14} />} onClick={() => open("extend", s)}>Extend trial</Btn>{" "}
                          <Btn size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => open("suspend", s)}>Suspend</Btn>
                        </>
                      )}
                      {s.status === "suspended" && (
                        <Btn size="sm" variant="accent" icon={<Play size={14} />} onClick={() => open("reinstate", s)}>Reinstate</Btn>
                      )}
                      {s.status === "rejected" && (
                        <Btn size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => open("approve", s)}>Approve after all</Btn>
                      )}
                      {s.access.state === "legacy" && (
                        <Btn size="sm" variant="secondary" icon={<History size={14} />} onClick={() => open("legacy", s)}>Put on a plan</Btn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {dialog && (
        <Modal
          title={titles[dialog.kind]}
          subtitle={dialog.school.name}
          onClose={close}
          footer={
            <>
              <Btn variant="secondary" onClick={close} disabled={busy}>Cancel</Btn>
              <Btn
                variant={dialog.kind === "reject" || dialog.kind === "suspend" ? "danger" : "accent"}
                onClick={submit}
                loading={busy}
                disabled={needsReason && !field.trim()}
              >
                Confirm
              </Btn>
            </>
          }
        >
          {dialog.kind === "approve" && (
            <p className="text-muted" style={{ marginBottom: 14, fontSize: 13 }}>
              Approving starts the free trial and tells the school on WhatsApp.
              {verified[dialog.school.authUid] === false && " Note: their email address hasn't been verified yet."}
            </p>
          )}
          {dialog.kind === "legacy" && (
            <p className="text-muted" style={{ marginBottom: 14, fontSize: 13 }}>
              This school registered before approval existed and currently has full access with no expiry. This puts it on
              a trial of the length below, after which it will need to subscribe.
            </p>
          )}
          {dialog.kind === "reinstate" && (
            <p className="text-muted" style={{ fontSize: 13 }}>Staff at this school will be able to sign in again straight away.</p>
          )}
          {needsDays && (
            <Input
              label={dialog.kind === "extend" ? "Extra days" : "Trial length (days)"}
              type="number" min="1" max="365"
              value={field}
              onChange={(e) => setField(e.target.value)}
            />
          )}
          {needsReason && (
            <Textarea
              label="Reason"
              required
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder="The school will see this."
              hint="This is sent to the school, so keep it clear and polite."
            />
          )}
        </Modal>
      )}
    </div>
  );
}
