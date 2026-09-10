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
import { Users, GraduationCap, Wallet, AlertTriangle, Building2, TrendingUp } from "lucide-react";
import { StatGrid, StatCard, TableWrap, EmptyState, Notice, LoadingState, Pill } from "../../../components/ui/ModuleKit";
import { money } from "../../../components/ui/format";
import { roleMap } from "../../admin/modules/constants";

/** A percentage where "no data" and "zero per cent" must not look the same. */
function pct(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/**
 * Collection health, banded rather than shaded continuously — a director
 * scanning six campuses needs "which one is in trouble", not a gradient.
 */
function collectionTone(rate) {
  if (rate === null) return "neutral";
  if (rate >= 85) return "success";
  if (rate >= 60) return "warning";
  return "danger";
}

export default function SchoolOverview({
  schoolName, schoolCode, overview, loading, pendingTransfers = 0, onOpenTab,
}) {
  if (loading) return <LoadingState label="Reading the whole school…" />;

  const { totals, campuses, staffByRole, unverifiedPayments } = overview;
  const multi = campuses.length > 1;

  return (
    <div className="space-y-8">
      <div className="overview-hero">
        <div>
          <p className="overview-hero__greeting">Group position</p>
          <h2 className="overview-hero__name">
            <span className="overview-hero__name-gradient">{schoolName}</span>
          </h2>
          <p className="overview-hero__school">
            {multi ? `${campuses.length} campuses` : "Single campus"} · {schoolCode}
          </p>
        </div>
      </div>

      {/* Things that need the director specifically, before the numbers they
          might otherwise scroll past. */}
      {pendingTransfers > 0 && (
        <Notice tone="warning">
          {pendingTransfers} campus transfer{pendingTransfers === 1 ? "" : "s"} waiting on your
          decision. No student moves until you act.{" "}
          <button
            type="button"
            onClick={() => onOpenTab?.("transfers")}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "inherit", font: "inherit", textDecoration: "underline",
            }}
          >
            Open the queue
          </button>
        </Notice>
      )}

      {unverifiedPayments > 0 && (
        <Notice tone="info">
          {unverifiedPayments} payment{unverifiedPayments === 1 ? " is" : "s are"} self-reported
          from the parent app and not yet confirmed by anyone. They are excluded from the
          collection figures below.
        </Notice>
      )}

      <StatGrid>
        <StatCard
          label="Learners on roll"
          value={totals.learners.toLocaleString()}
          sub={`${totals.boarders.toLocaleString()} boarding`}
        />
        <StatCard
          label="Teaching staff"
          value={totals.teachers.toLocaleString()}
          sub={totals.ratio ? `1 teacher to ${totals.ratio} learners` : "No class teachers recorded"}
        />
        <StatCard
          label="Fees collected"
          value={money(totals.collected)}
          sub={`of ${money(totals.billed)} billed`}
        />
        <StatCard
          label="Outstanding"
          value={money(totals.outstanding)}
          tone={totals.outstanding > 0 ? "danger" : undefined}
          sub={pct(totals.collectionRate) + " collected"}
        />
      </StatGrid>

      {/* ── Campus comparison ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <p className="sec-eyebrow">By campus</p>
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              The same measures computed the same way on every site, so the comparison means
              something.
            </p>
          </div>
        </div>

        {campuses.length === 0 ? (
          <EmptyState
            icon={<Building2 size={28} />}
            title="No campuses set up"
            sub="Add the school's sites from the administrator's Campuses page and this fills in."
          />
        ) : (
          <TableWrap>
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Campus</th>
                  <th>Learners</th>
                  <th>Teachers</th>
                  <th>Ratio</th>
                  <th>Billed</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
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
                      <div className="data-table__meta">
                        {c.district || "—"} · {c.boys} boys / {c.girls} girls
                      </div>
                    </td>
                    <td data-label="Learners">
                      {c.learners.toLocaleString()}
                      {c.boarders > 0 && <div className="data-table__meta">{c.boarders} boarding</div>}
                    </td>
                    <td data-label="Teachers">{c.teachers}</td>
                    <td data-label="Ratio">{c.ratio ? `1:${c.ratio}` : "—"}</td>
                    <td data-label="Billed">{money(c.billed)}</td>
                    <td data-label="Collected">
                      {money(c.collected)}
                      <div className="data-table__meta">
                        <Pill tone={collectionTone(c.collectionRate)}>{pct(c.collectionRate)}</Pill>
                      </div>
                    </td>
                    <td data-label="Outstanding" style={{ color: c.outstanding > 0 ? "var(--danger-light, #f87171)" : undefined }}>
                      {money(c.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>

      {/* ── Establishment ───────────────────────────────────────────────── */}
      <div>
        <p className="sec-eyebrow">Establishment</p>
        <StatGrid>
          {staffByRole
            .filter((r) => r.count > 0)
            .map((r) => (
              <StatCard
                key={r.role}
                label={roleMap[r.role]?.label || r.role.replace(/_/g, " ")}
                value={r.count}
              />
            ))}
          {staffByRole.every((r) => r.count === 0) && (
            <StatCard label="Staff accounts" value="0" sub="Nobody has been added yet" />
          )}
        </StatGrid>
      </div>

      {/* ── Where to go next ────────────────────────────────────────────── */}
      <div>
        <p className="sec-eyebrow">Your portal</p>
        <div className="modules-grid">
          {[
            { tab: "campuses",  icon: <Building2 size={22} />,     title: "Campuses",         desc: "Each site side by side, with the roll, staffing and fee position." },
            { tab: "transfers", icon: <Users size={22} />,          title: "Campus transfers", desc: "Approve or decline a student moving between your campuses." },
            { tab: "finance",   icon: <Wallet size={22} />,         title: "Fee position",     desc: "What has been billed, what has come in, and what is outstanding." },
            { tab: "billing",   icon: <TrendingUp size={22} />,     title: "Subscription",     desc: "What the group pays Acalink, and pay it online." },
          ].map((m) => (
            <button key={m.tab} type="button" className="module-card" onClick={() => onOpenTab?.(m.tab)}>
              <div className="module-card__icon">{m.icon}</div>
              <p className="module-card__title">{m.title}</p>
              <p className="module-card__desc">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 11.5 }}>
        <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        Figures are read live from the school's own records — there is no nightly summary to
        fall out of step with the bursar's ledger.
        {" "}
        <GraduationCap size={12} style={{ verticalAlign: -2, marginRight: 4, marginLeft: 6 }} />
        Records with no campus recorded are counted against the main campus.
      </p>
    </div>
  );
}
