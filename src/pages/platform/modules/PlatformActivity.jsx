// The platform owner's audit trail: who approved, rejected, suspended or
// extended which school, and when. Read-only by design — the rules forbid
// updating or deleting an entry.
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { subscribeAudit } from "../../../services/platform";
import { toMs } from "../../../services/subscriptionState";
import { ModuleHeader, EmptyState, LoadingState, TableWrap, Pill } from "../../../components/ui/ModuleKit";
import "../../headteacher/modules/staff-management.css";

const LABELS = {
  approve: ["Approved", "success"],
  reject: ["Rejected", "danger"],
  suspend: ["Suspended", "danger"],
  reinstate: ["Reinstated", "success"],
  extend_trial: ["Trial extended", "warning"],
  legacy_plan: ["Legacy put on plan", "neutral"],
};

function describe(e) {
  const d = e.detail || {};
  if (e.action === "approve") return `Trial of ${d.trialDays} days`;
  if (e.action === "extend_trial") return `+${d.days} days`;
  if (e.action === "legacy_plan") return `Trial of ${d.days} days`;
  return d.reason || "";
}

export default function PlatformActivity() {
  const [entries, setEntries] = useState(null);
  useEffect(() => subscribeAudit(setEntries), []);

  if (entries === null) return <LoadingState label="Loading activity…" />;

  return (
    <div>
      <ModuleHeader title="Activity" subtitle="Every decision made on a school, newest first" />
      {entries.length === 0 ? (
        <EmptyState icon={<ScrollText size={28} />} title="Nothing yet" sub="Decisions you make on schools will be recorded here." />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>When</th><th>School</th><th>Action</th><th>Detail</th><th>By</th></tr></thead>
            <tbody>
              {entries.map((e) => {
                const [label, tone] = LABELS[e.action] || [e.action, "neutral"];
                const ms = toMs(e.createdAt);
                return (
                  <tr key={e.id}>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td><strong>{e.schoolName}</strong><div className="text-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{e.schoolCode}</div></td>
                    <td><Pill tone={tone}>{label}</Pill></td>
                    <td style={{ fontSize: 13 }}>{describe(e)}</td>
                    <td style={{ fontSize: 13 }}>{e.actorName || "—"}</td>
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
