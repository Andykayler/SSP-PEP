// The platform owner's landing page: who is waiting to be let in, who is
// about to lapse, and what was decided recently.
import { useEffect, useMemo, useState } from "react";
import {
  Building2, Hourglass, BadgeCheck, AlertTriangle, ScrollText, ShieldCheck, Clock,
} from "lucide-react";
import { subscribeSchools, subscribeAudit } from "../../../services/platform";
import { schoolAccess, toMs } from "../../../services/subscriptionState";
import { countSchools, trialsEndingWithin } from "../../../services/platformSummary";
import { plural } from "../../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Panel, EmptyNote, Banner, Skeleton,
} from "../../../components/overview/OverviewKit";

const ACTION_LABELS = {
  approve: "Approved", reject: "Rejected", suspend: "Suspended",
  reinstate: "Reinstated", extend_trial: "Trial extended", legacy_plan: "Put on a plan",
};

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

export default function PlatformOverview({ displayName, onOpenSchools, onOpenActivity }) {
  const [schools, setSchools] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => subscribeSchools(setSchools, (e) => { setError(e.message); setSchools([]); }), []);
  useEffect(() => subscribeAudit(setAudit, 6), []);

  const rows = useMemo(() => (schools || []).map((s) => ({ ...s, access: schoolAccess(s) })), [schools]);
  const counts = useMemo(() => countSchools(rows), [rows]);
  const ending = useMemo(() => trialsEndingWithin(rows, 7), [rows]);
  const pending = rows.filter((s) => s.status === "pending");
  const loading = schools === null;
  const live = counts.trial + counts.paying + counts.attention + counts.legacy;

  const stats = [
    { label: "Awaiting Approval", value: String(counts.pending), sub: "New registrations", icon: <Hourglass size={17} />, tone: "gold" },
    { label: "On Trial", value: String(counts.trial), sub: `${plural(ending.length, "trial")} ending this week`, icon: <Clock size={17} />, tone: "teal" },
    {
      label: "Paying", value: String(counts.paying),
      sub: live ? `${Math.round((counts.paying / live) * 100)}% of live schools` : "No live schools yet",
      icon: <BadgeCheck size={17} />, tone: "green",
      meter: live ? Math.round((counts.paying / live) * 100) : null,
    },
    { label: "Needs Attention", value: String(counts.attention), sub: "Trial or payment lapsed", icon: <AlertTriangle size={17} />, tone: "red" },
  ];

  const todos = loading ? [] : [
    {
      key: "pending", tab: "pending", done: counts.pending === 0, urgent: counts.pending > 0,
      text: counts.pending === 0 ? "No registrations waiting" : `Review ${plural(counts.pending, "new registration")}`,
    },
    {
      key: "attention", tab: "attention", done: counts.attention === 0, urgent: counts.attention > 0,
      text: counts.attention === 0 ? "No lapsed schools" : `${plural(counts.attention, "school")} lapsed or in grace`,
    },
    {
      key: "ending", tab: "active", done: ending.length === 0,
      text: ending.length === 0 ? "No trials ending this week" : `${plural(ending.length, "trial")} ending within 7 days`,
    },
    {
      key: "legacy", tab: "legacy", done: counts.legacy === 0,
      text: counts.legacy === 0 ? "No legacy schools left" : `Move ${plural(counts.legacy, "legacy school")} onto a plan`,
    },
  ];

  const quickActions = [
    { label: "Approvals", hint: "New registrations", icon: <Hourglass size={22} />, tab: "pending", tone: "gold" },
    { label: "Needs Attention", hint: "Lapsed and in grace", icon: <AlertTriangle size={22} />, tab: "attention", tone: "red" },
    { label: "All Schools", hint: "Search and manage", icon: <Building2 size={22} />, tab: "all", tone: "" },
    { label: "Activity Log", hint: "Every decision made", icon: <ScrollText size={22} />, tab: "__activity", tone: "teal" },
  ];
  const open = (tab) => (tab === "__activity" ? onOpenActivity() : onOpenSchools(tab));

  return (
    <div className="tp">
      <OverviewHero
        name={displayName.split(" ")[0]}
        lead={
          loading ? "Counting schools…" : (
            <>
              <strong>{plural(live, "school")}</strong> live on Acalink, <strong>{counts.paying}</strong> of them paying.{" "}
              {counts.pending ? <><strong>{plural(counts.pending, "registration")}</strong> waiting for you.</> : "No one is waiting for approval."}
            </>
          )
        }
        chips={[{ label: "Platform owner", icon: <ShieldCheck size={14} aria-hidden="true" /> }]}
        aside={<TodoSheet title="Back office" todos={todos} loading={loading} emptyText="" onOpen={open} />}
      />

      {error && <Banner tone="error" icon={<AlertTriangle size={17} aria-hidden="true" />}>Could not load schools: {error}</Banner>}

      <section aria-labelledby="tp-glance">
        <SectionTitle id="tp-glance">At a glance</SectionTitle>
        <StatGrid stats={stats} loading={loading} />
      </section>

      <section aria-labelledby="tp-quick">
        <SectionTitle id="tp-quick">Quick actions</SectionTitle>
        <QuickActions actions={quickActions} onOpen={open} />
      </section>

      <div className="tp-grid">
        <Panel id="tp-pending" icon={<Hourglass size={18} aria-hidden="true" />} title="Waiting for approval" linkLabel="Review" onLink={() => onOpenSchools("pending")}>
          {loading ? <Skeleton /> : pending.length === 0 ? (
            <EmptyNote icon={<BadgeCheck size={20} />} title="All caught up">New school registrations will appear here.</EmptyNote>
          ) : (
            <ul className="tp-hw">
              {pending.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <div className="tp-hw__row">
                    <span className="tp-hw__title">{s.name || s.code}</span>
                    <span className="tp-hw__count">{fmtDate(toMs(s.createdAt))}</span>
                  </div>
                  <div className="tp-hw__meta">{[s.district, s.email || s.phone].filter(Boolean).join(" · ") || s.code}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="tp-activity" icon={<ScrollText size={18} aria-hidden="true" />} title="Recent decisions" linkLabel="Activity" onLink={onOpenActivity}>
          {audit === null ? <Skeleton lines={2} /> : audit.length === 0 ? (
            <EmptyNote icon={<ScrollText size={20} />} title="Nothing yet">Approvals and suspensions will be listed here.</EmptyNote>
          ) : (
            <ul className="tp-hw">
              {audit.map((e) => (
                <li key={e.id}>
                  <div className="tp-hw__row">
                    <span className="tp-hw__title">{e.schoolName || e.schoolCode}</span>
                    <span className="tp-hw__count">{fmtDate(toMs(e.createdAt))}</span>
                  </div>
                  <div className="tp-hw__meta">{ACTION_LABELS[e.action] || e.action}{e.actorName ? ` by ${e.actorName}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
