// src/pages/director/modules/FeePosition.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The money question, at group level: what was billed, what came in, what is
// still owed, and on which campus.
//
// The bursar's modules answer this per student, which is the right unit for
// chasing a family and the wrong one for deciding whether a campus can afford
// a second science teacher. So this aggregates and stops — there is no action
// to take here, and offering one would put a director in the middle of a
// conversation between a bursar and a parent.
//
// Self-reported parent-app payments are excluded and said to be excluded. A
// collection rate that quietly counts unverified claims is the most dangerous
// number this product could show: it looks like cash and is used like cash.
// ─────────────────────────────────────────────────────────────────────────────
import { Wallet } from "lucide-react";
import { ModuleHeader, StatGrid, StatCard, TableWrap, EmptyState, Notice, LoadingState } from "../../../components/ui/ModuleKit";
import { money } from "../../../components/ui/format";

/** A bar that reads at a glance without needing a charting dependency. */
function CollectionBar({ rate }) {
  const width = Math.max(0, Math.min(100, rate ?? 0));
  const tone = rate === null ? "var(--border-color)" : rate >= 85 ? "#22c55e" : rate >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ background: "var(--border-color)", borderRadius: 6, height: 8, overflow: "hidden", minWidth: 120 }}>
      <div style={{ width: `${width}%`, height: "100%", background: tone, borderRadius: 6 }} />
    </div>
  );
}

export default function FeePosition({ overview, loading, academicYear }) {
  if (loading) return <LoadingState label="Adding up the fee ledger…" />;

  const { totals, campuses, unverifiedPayments } = overview;

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Fee position"
        subtitle={academicYear ? `Academic year ${academicYear}` : "All recorded fee activity"}
      />

      {unverifiedPayments > 0 && (
        <Notice tone="warning">
          {unverifiedPayments} payment{unverifiedPayments === 1 ? "" : "s"} reported through the
          parent app {unverifiedPayments === 1 ? "has" : "have"} not been confirmed by the bursar
          or a gateway, so {unverifiedPayments === 1 ? "it is" : "they are"} not counted below.
          Payments taken through PayChangu are confirmed automatically and do count.
        </Notice>
      )}

      <StatGrid>
        <StatCard label="Billed" value={money(totals.billed)} sub="Fee assignments raised" />
        <StatCard label="Collected" value={money(totals.collected)} tone="success" sub="Confirmed receipts only" />
        <StatCard
          label="Outstanding"
          value={money(totals.outstanding)}
          tone={totals.outstanding > 0 ? "danger" : undefined}
          sub="Still owed by families"
        />
        <StatCard
          label="Collection rate"
          value={totals.collectionRate === null ? "—" : `${totals.collectionRate}%`}
          sub={totals.billed === 0 ? "Nothing billed yet" : "Across the group"}
        />
      </StatGrid>

      {campuses.length === 0 ? (
        <EmptyState icon={<Wallet size={28} />} title="No fee activity" sub="Nothing has been billed yet." />
      ) : (
        <TableWrap>
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>Campus</th>
                <th>Learners</th>
                <th>Billed</th>
                <th>Collected</th>
                <th>Outstanding</th>
                <th style={{ minWidth: 160 }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {campuses.map((c) => (
                <tr key={c.campusId}>
                  <td data-label="Campus">
                    <div className="data-table__primary">{c.campusName}</div>
                    <div className="data-table__meta">
                      {c.learners > 0 ? money(Math.round(c.outstanding / c.learners)) : money(0)} owed per learner
                    </div>
                  </td>
                  <td data-label="Learners">{c.learners.toLocaleString()}</td>
                  <td data-label="Billed">{money(c.billed)}</td>
                  <td data-label="Collected">{money(c.collected)}</td>
                  <td data-label="Outstanding">{money(c.outstanding)}</td>
                  <td data-label="Rate">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CollectionBar rate={c.collectionRate} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {c.collectionRate === null ? "—" : `${c.collectionRate}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <p className="text-muted" style={{ fontSize: 11.5 }}>
        A payment is attributed to the campus the student is on today. A student moved between
        campuses takes their history with them, which is why the transfer needs approving.
      </p>
    </div>
  );
}
