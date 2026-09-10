// src/components/campus/TransferApprovals.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The queue where a student's move between campuses is decided.
//
// Shared by the administrator and the director because it is the same
// decision, and a second copy of it would drift. Read-only for anyone else:
// `canDecide` is passed by the portal, and the service checks the role again
// before it writes, since a prop is a UI convenience and not a control.
//
// A pending request is shown with what the move would actually do — the class
// is cleared, so the receiving campus has to place the child — because the
// consequence is not obvious from "Blantyre → Zomba" alone, and an approver
// who does not know it will approve a move that leaves a child unregistered.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { ArrowRight, Check, X, Inbox } from "lucide-react";
import {
  subscribeTransferRequests, approveCampusTransfer, rejectCampusTransfer,
  TRANSFER_PENDING, TRANSFER_APPROVED, TRANSFER_REJECTED,
} from "../../services/campuses";
import {
  ModuleHeader, FilterBar, EmptyState, TableWrap, Btn, Pill, Notice, LoadingState, Modal, Textarea,
} from "../ui/ModuleKit";
import "../../pages/burser/modules/staff-management.css";

const FILTERS = [
  { id: TRANSFER_PENDING,  label: "Awaiting decision" },
  { id: TRANSFER_APPROVED, label: "Approved" },
  { id: TRANSFER_REJECTED, label: "Declined" },
  { id: "all",             label: "All" },
];

const TONE = {
  [TRANSFER_PENDING]:  "warning",
  [TRANSFER_APPROVED]: "success",
  [TRANSFER_REJECTED]: "danger",
};

function when(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TransferApprovals({ schoolCode, currentUser, canDecide = false }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState(TRANSFER_PENDING);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [declining, setDeclining] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => subscribeTransferRequests(schoolCode, setRows), [schoolCode]);

  const list = (rows || []).filter((r) => filter === "all" || r.status === filter);
  const pendingCount = (rows || []).filter((r) => r.status === TRANSFER_PENDING).length;

  async function approve(request) {
    setBusyId(request.id); setError(""); setNotice("");
    const res = await approveCampusTransfer({ request, approver: currentUser });
    setBusyId("");
    if (!res.ok) { setError(res.error); return; }
    setNotice(`${request.studentName} has been moved to ${request.toCampusName}. The receiving campus now needs to place them in a class.`);
  }

  async function decline() {
    const request = declining;
    setBusyId(request.id); setError("");
    const res = await rejectCampusTransfer({ request, approver: currentUser, note });
    setBusyId(""); setDeclining(null); setNote("");
    if (!res.ok) { setError(res.error); return; }
    setNotice(`The request for ${request.studentName} was declined. Nothing about their record changed.`);
  }

  if (rows === null) return <LoadingState label="Loading transfer requests…" />;

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Campus transfers"
        subtitle={
          pendingCount
            ? `${pendingCount} request${pendingCount === 1 ? "" : "s"} awaiting a decision`
            : "No requests are waiting"
        }
      />

      {error && <Notice tone="danger" onDismiss={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice("")}>{notice}</Notice>}

      {!canDecide && (
        <Notice tone="info">
          You can see where every request stands. Approving a move needs an administrator or
          the director, because it is the one person with sight of both campuses.
        </Notice>
      )}

      <FilterBar options={FILTERS} value={filter} onChange={setFilter} />

      {list.length === 0 ? (
        <EmptyState
          icon={<Inbox size={28} />}
          title="Nothing here"
          sub={
            filter === TRANSFER_PENDING
              ? "Every request has been decided."
              : "No requests match this filter."
          }
        />
      ) : (
        <TableWrap>
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>Student</th>
                <th>Move</th>
                <th>Reason</th>
                <th>Requested</th>
                <th>Status</th>
                {canDecide && <th style={{ textAlign: "right" }}>Decision</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td data-label="Student">
                    <div className="data-table__primary">{r.studentName}</div>
                    <div className="data-table__meta">
                      {r.studentCode}{r.className ? ` · ${r.className}` : ""}
                    </div>
                  </td>
                  <td data-label="Move">
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{r.fromCampusName || "Unassigned"}</span>
                      <ArrowRight size={14} />
                      <strong>{r.toCampusName}</strong>
                    </span>
                    {r.status === TRANSFER_PENDING && (
                      <div className="data-table__meta">Class is cleared on approval</div>
                    )}
                  </td>
                  <td data-label="Reason" style={{ maxWidth: 260 }}>
                    {r.reason || <span className="text-muted">—</span>}
                  </td>
                  <td data-label="Requested">
                    <div>{when(r.requestedAt)}</div>
                    <div className="data-table__meta">{r.requestedByName}</div>
                  </td>
                  <td data-label="Status">
                    <Pill tone={TONE[r.status] || "neutral"}>
                      {r.status === TRANSFER_PENDING ? "Awaiting" : r.status === TRANSFER_APPROVED ? "Approved" : "Declined"}
                    </Pill>
                    {r.decidedByName && <div className="data-table__meta">{r.decidedByName}</div>}
                  </td>
                  {canDecide && (
                    <td data-label="Decision">
                      {r.status === TRANSFER_PENDING ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <Btn
                            size="sm" variant="ghost" icon={<X size={14} />}
                            disabled={busyId === r.id}
                            onClick={() => { setDeclining(r); setNote(""); }}
                          >
                            Decline
                          </Btn>
                          <Btn
                            size="sm" variant="accent" icon={<Check size={14} />}
                            loading={busyId === r.id}
                            onClick={() => approve(r)}
                          >
                            Approve
                          </Btn>
                        </div>
                      ) : (
                        <div className="text-muted" style={{ textAlign: "right", fontSize: 12 }}>
                          {when(r.decidedAt)}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {declining && (
        <Modal
          title="Decline this transfer"
          subtitle={`${declining.studentName} · ${declining.fromCampusName || "Unassigned"} → ${declining.toCampusName}`}
          onClose={() => setDeclining(null)}
        >
          <div className="space-y-4">
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              Nothing about the student changes. The reason is kept on the request so the
              campus that raised it can see why.
            </p>
            <Textarea
              label="Reason (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="No place available in that form this term."
            />
            <div className="flex justify-end" style={{ gap: 8 }}>
              <Btn variant="ghost" onClick={() => setDeclining(null)}>Cancel</Btn>
              <Btn variant="danger" loading={busyId === declining.id} onClick={decline}>
                Decline request
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
