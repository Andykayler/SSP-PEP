// src/pages/director/modules/SchoolOverview.jsx
// ─────────────────────────────────────────────────────────────────────────────
// What the director actually asks on a Monday morning.
//
// The head teacher's dashboard answers "how is my school doing"; this answers
// "how is the group doing, and which site needs me". Those are different
// screens because they lead to different actions — a head reallocates a
// teacher, a director reallocates a budget — and squeezing both into one
// leaves neither legible.
//
// Nothing here is editable. A director who can quietly change a roll or a
// balance while also being the person who signs off on them is an audit
// finding waiting to happen; the one thing they decide is a campus transfer,
// and that has its own screen with a name and a date attached to every
// decision.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Users, GraduationCap, Wallet, AlertTriangle, Building2, ArrowLeftRight, CreditCard,
  School, Hash, ShieldCheck, BarChart3,
} from "lucide-react";
import { TableWrap, Pill } from "../../../components/ui/ModuleKit";
import { money } from "../../../components/ui/format";
import { roleMap } from "../../admin/modules/constants";
import useSchoolAccess from "../../../components/subscription/useSchoolAccess";
import { plural } from "../../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Panel, EmptyNote, Banner, ModuleDirectory,
} from "../../../components/overview/OverviewKit";

/** A percentage where "no data" and "zero per cent" must not look the same. */
function pct(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/** Below this, a campus's collection needs the director's attention. */
const LOW_COLLECTION = 60;

/**
 * Collection health, banded rather than shaded continuously — a director
 * scanning six campuses needs "which one is in trouble", not a gradient.
 */
function collectionTone(rate) {
  if (rate === null) return "neutral";
  if (rate >= 85) return "success";
  if (rate >= LOW_COLLECTION) return "warning";
  return "danger";
}

const quickActions = [
  { label: "Campus Transfers", hint: "Approve or decline moves", icon: <ArrowLeftRight size={22} />, tab: "transfers", tone: "gold" },
  { label: "Fee Position", hint: "Billed, collected, owed", icon: <Wallet size={22} />, tab: "finance", tone: "green" },
  { label: "Campuses", hint: "Each site side by side", icon: <Building2 size={22} />, tab: "campuses", tone: "" },
  { label: "Subscription", hint: "What the group pays Acalink", icon: <CreditCard size={22} />, tab: "billing", tone: "teal" },
];

export default function SchoolOverview({
  displayName = "Director", schoolName, schoolCode, overview, loading, pendingTransfers = 0, onOpenTab, navItems = [], moduleGroups = [], moduleHints = {},
}) {
  const { access } = useSchoolAccess(schoolCode);
  const { totals, campuses, staffByRole, unverifiedPayments } = overview;
  const multi = campuses.length > 1;
  const lagging = campuses.filter((c) => c.collectionRate !== null && c.collectionRate < LOW_COLLECTION);

  const stats = [
    {
      label: "Learners on Roll",
      value: totals.learners.toLocaleString("en-GB"),
      sub: `${totals.boarders.toLocaleString("en-GB")} boarding`,
      icon: <GraduationCap size={17} />,
    },
    {
      label: "Teaching Staff",
      value: totals.teachers.toLocaleString("en-GB"),
      sub: totals.ratio ? `1 teacher to ${totals.ratio} learners` : "No class teachers recorded",
      icon: <Users size={17} />, tone: "teal",
    },
    {
      label: "Fees Collected",
      value: money(totals.collected),
      sub: `${pct(totals.collectionRate)} of ${money(totals.billed)} billed`,
      icon: <Wallet size={17} />, tone: "green",
      meter: totals.collectionRate,
    },
    {
      label: "Outstanding",
      value: money(totals.outstanding),
      sub: multi ? `Across ${plural(campuses.length, "campus", "es")}` : "Whole school",
      icon: <AlertTriangle size={17} />, tone: "red",
    },
  ];

  const todos = loading ? [] : [
    {
      key: "transfers", tab: "transfers",
      done: pendingTransfers === 0, urgent: pendingTransfers > 0,
      text: pendingTransfers === 0 ? "No campus transfers waiting" : `Decide ${plural(pendingTransfers, "campus transfer")}`,
    },
    {
      key: "lagging", tab: "campuses",
      done: lagging.length === 0, urgent: lagging.length > 0,
      text: lagging.length === 0
        ? "Every campus collecting well"
        : `${lagging.map((c) => c.campusName).slice(0, 2).join(", ")}${lagging.length > 2 ? ` +${lagging.length - 2}` : ""} below ${LOW_COLLECTION}% collected`,
    },
    {
      key: "claims", tab: "finance",
      done: unverifiedPayments === 0,
      text: unverifiedPayments === 0 ? "No unconfirmed parent payments" : `${plural(unverifiedPayments, "parent payment")} awaiting the bursar`,
    },
    {
      key: "subscription", tab: "billing",
      done: !access.warn && !access.restricted,
      urgent: access.restricted,
      text: access.warn || access.restricted ? access.title || "Check the subscription" : "Subscription in good standing",
    },
  ];

  return (
    <div className="tp">
      <OverviewHero
        name={displayName.split(" ")[0]}
        lead={
          loading ? "Reading the whole school…" : (
            <>
              <strong>{schoolName}</strong> has <strong>{plural(totals.learners, "learner")}</strong>
              {multi ? <> across <strong>{plural(campuses.length, "campus", "es")}</strong></> : null}, and has
              collected <strong>{pct(totals.collectionRate)}</strong> of this year&apos;s fees.
            </>
          )
        }
        chips={[
          { label: "Director", icon: <ShieldCheck size={14} aria-hidden="true" /> },
          { label: multi ? `${campuses.length} campuses` : "Single campus", icon: <School size={14} aria-hidden="true" /> },
          schoolCode && { label: schoolCode, icon: <Hash size={13} aria-hidden="true" />, mono: true, title: "School code" },
        ]}
        aside={
          <TodoSheet
            title="Needs you"
            todos={todos}
            loading={loading}
            emptyText="Nothing to decide yet."
            onOpen={onOpenTab}
          />
        }
      />

      {!loading && unverifiedPayments > 0 && (
        <Banner icon={<AlertTriangle size={17} aria-hidden="true" />}>
          {plural(unverifiedPayments, "payment")} {unverifiedPayments === 1 ? "is" : "are"} self-reported from the
          parent app and not yet confirmed. They are left out of the collection figures.
        </Banner>
      )}

      <section aria-labelledby="tp-glance">
        <SectionTitle id="tp-glance">At a glance</SectionTitle>
        <StatGrid stats={stats} loading={loading} />
      </section>

      <section aria-labelledby="tp-quick">
        <SectionTitle id="tp-quick">Quick actions</SectionTitle>
        <QuickActions actions={quickActions} onOpen={onOpenTab} />
      </section>

      <Panel
        id="tp-campuses"
        icon={<BarChart3 size={18} aria-hidden="true" />}
        title="By campus"
        linkLabel="Campuses"
        onLink={() => onOpenTab?.("campuses")}
      >
        {loading ? null : campuses.length === 0 ? (
          <EmptyNote icon={<Building2 size={20} />} title="No campuses set up">
            Add the school&apos;s sites from the administrator&apos;s Campuses page and this fills in.
          </EmptyNote>
        ) : (
          <TableWrap>
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Campus</th><th>Learners</th><th>Teachers</th><th>Ratio</th>
                  <th>Billed</th><th>Collected</th><th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {campuses.map((c) => (
                  <tr key={c.campusId}>
                    <td data-label="Campus">
                      <div className="data-table__primary">
                        {c.campusName}
                        {c.isPrimary && <span className="tag tag--neutral" style={{ marginLeft: 8 }}>Main</span>}
                      </div>
                      <div className="data-table__meta">{c.district || "—"} · {c.boys} boys / {c.girls} girls</div>
                    </td>
                    <td data-label="Learners">
                      {c.learners.toLocaleString("en-GB")}
                      {c.boarders > 0 && <div className="data-table__meta">{c.boarders} boarding</div>}
                    </td>
                    <td data-label="Teachers">{c.teachers}</td>
                    <td data-label="Ratio">{c.ratio ? `1:${c.ratio}` : "—"}</td>
                    <td data-label="Billed">{money(c.billed)}</td>
                    <td data-label="Collected">
                      {money(c.collected)}
                      <div className="data-table__meta"><Pill tone={collectionTone(c.collectionRate)}>{pct(c.collectionRate)}</Pill></div>
                    </td>
                    <td data-label="Outstanding" style={{ color: c.outstanding > 0 ? "var(--danger-light)" : undefined }}>
                      {money(c.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      <section aria-labelledby="tp-establishment">
        <SectionTitle id="tp-establishment">Establishment</SectionTitle>
        <StatGrid
          loading={loading}
          stats={
            staffByRole.some((r) => r.count > 0)
              ? staffByRole.filter((r) => r.count > 0).map((r) => ({
                label: roleMap[r.role]?.label || r.role.replace(/_/g, " "),
                value: String(r.count),
                sub: "Active accounts",
                icon: <Users size={17} />,
              }))
              : [{ label: "Staff accounts", value: "0", sub: "Nobody has been added yet", icon: <Users size={17} /> }]
          }
        />
      </section>

      {navItems.length > 0 && (
        <section aria-labelledby="tp-modules">
          <SectionTitle id="tp-modules">Every module, view only</SectionTitle>
          <ModuleDirectory groups={moduleGroups} navItems={navItems} hints={moduleHints} onOpen={onOpenTab} />
        </section>
      )}

      <p className="module-sub" style={{ fontSize: 12.5 }}>
        Figures are read live from the school&apos;s own records, so they always match the bursar&apos;s ledger.
        Records with no campus recorded are counted against the main campus.
      </p>
    </div>
  );
}
