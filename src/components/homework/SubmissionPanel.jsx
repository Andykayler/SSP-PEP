// src/components/homework/SubmissionPanel.jsx
// The teacher's side of the parent app's homework flow: who has submitted,
// and which families are asking to hand work in after the deadline.
//
// A guardian can mark work submitted up to the due date on their own. Past it,
// the app makes them ask — and only an approval recorded here unlocks
// submitting. Declining is a real answer too, so both are offered.
import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import {
  CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Inbox, AlertTriangle,
} from "lucide-react";
import { pushNotification, parentRecipientId } from "../../services/notifications";
import "./submissions.css";

const STATE_META = {
  submitted:      { label: "Submitted",        tone: "success" },
  late_requested: { label: "Awaiting you",     tone: "warning" },
  late_approved:  { label: "Late allowed",     tone: "info" },
  late_declined:  { label: "Declined",         tone: "danger" },
};

function when(ts) {
  const d = ts?.toDate?.();
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SubmissionPanel({ schoolCode, teacherId, teacherName }) {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("late_requested");

  const load = useCallback(async () => {
    if (!schoolCode || !teacherId) return;
    try {
      // Filtered on teacherId so a teacher only sees work they set — and
      // because a list is authorised from the query's own constraints.
      const snap = await getDocs(query(
        collection(db, "homework_submissions"),
        where("schoolCode", "==", schoolCode),
        where("teacherId", "==", teacherId),
      ));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.requestedAt?.toMillis?.() || b.submittedAt?.toMillis?.() || 0)
        - (a.requestedAt?.toMillis?.() || a.submittedAt?.toMillis?.() || 0));
      setRows(list);
    } catch (err) {
      console.error("[submissions] load failed:", err);
      setRows([]);
    }
  }, [schoolCode, teacherId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (row, approve) => {
    const note = window.prompt(
      approve
        ? `Approve a late submission of "${row.homeworkTitle}" for ${row.studentName}?\n\nAnything to add (optional):`
        : `Decline the late submission of "${row.homeworkTitle}" for ${row.studentName}?\n\nTell the family why:`,
      "",
    );
    // prompt returns null on cancel; an empty string is a valid "no comment"
    // when approving, but a decline should carry a reason.
    if (note === null) return;
    if (!approve && !note.trim()) {
      window.alert("Give a reason — the family sees this.");
      return;
    }

    setBusyId(row.id);
    try {
      await updateDoc(doc(db, "homework_submissions", row.id), {
        status: approve ? "late_approved" : "late_declined",
        decisionNote: note.trim(),
        decidedBy: teacherId,
        decidedByName: teacherName || "Teacher",
        decidedAt: serverTimestamp(),
      });

      await pushNotification({
        schoolCode,
        recipientId: parentRecipientId(row.guardianPhone),
        title: approve
          ? `Late submission approved — ${row.homeworkTitle}`
          : `Late submission declined — ${row.homeworkTitle}`,
        body: approve
          ? `You can now submit ${row.studentName}'s work in ACALink.`
          : note.trim(),
        category: "homework",
        priority: "high",
        actorId: teacherId,
        actorName: teacherName || "Teacher",
        actorRole: "class_teacher",
        tab: "Homework",
        entityType: "homework_submission",
        entityId: row.homeworkId,
        studentId: row.studentId,
        studentName: row.studentName,
      });

      await load();
    } catch (err) {
      console.error("[submissions] decision failed:", err);
      window.alert("Could not save that decision: " + err.message);
    } finally {
      setBusyId(null);
    }
  };

  const pending = useMemo(
    () => (rows || []).filter((r) => r.status === "late_requested").length,
    [rows],
  );

  const visible = (rows || []).filter((r) => filter === "all" || r.status === filter);

  if (rows === null) {
    return (
      <div className="sub-panel__state">
        <Loader2 size={16} className="spin" /> Loading submissions…
      </div>
    );
  }

  return (
    <div className="card sub-panel">
      <div className="cc__head">
        <div className="cc__head-left">
          <Inbox size={18} />
          <h3>Homework submissions</h3>
          {pending > 0 && <span className="sub-panel__pending">{pending} awaiting you</span>}
        </div>
        <button type="button" className="icon-btn" onClick={load} title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="sub-panel__filters">
        {[
          ["late_requested", "Requests"],
          ["submitted", "Submitted"],
          ["late_approved", "Approved"],
          ["late_declined", "Declined"],
          ["all", "All"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`sub-chip ${filter === id ? "sub-chip--on" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="sub-panel__state">
          {filter === "late_requested"
            ? "No late-submission requests waiting."
            : "Nothing here yet."}
        </div>
      ) : (
        <div className="sub-list">
          {visible.map((row) => {
            const meta = STATE_META[row.status] || { label: row.status, tone: "neutral" };
            return (
              <div key={row.id} className="sub-row">
                <div className="sub-row__main">
                  <div className="sub-row__title">
                    {row.studentName}
                    <span className={`sub-pill sub-pill--${meta.tone}`}>{meta.label}</span>
                    {row.wasLate && row.status === "submitted" && (
                      <span className="sub-pill sub-pill--warning">was late</span>
                    )}
                  </div>
                  <div className="sub-row__meta">
                    {row.homeworkTitle}
                    {row.className && ` · ${row.className}`}
                    {row.submittedAt && ` · submitted ${when(row.submittedAt)}`}
                    {row.status === "late_requested" && row.requestedAt
                      && ` · asked ${when(row.requestedAt)}`}
                  </div>
                  {row.requestReason && row.status === "late_requested" && (
                    <div className="sub-row__note">
                      <AlertTriangle size={12} /> {row.requestReason}
                    </div>
                  )}
                  {row.note && row.status === "submitted" && (
                    <div className="sub-row__note">{row.note}</div>
                  )}
                  {row.decisionNote && row.status !== "late_requested" && (
                    <div className="sub-row__note sub-row__note--muted">
                      You: {row.decisionNote}
                    </div>
                  )}
                </div>

                {row.status === "late_requested" && (
                  <div className="sub-row__actions">
                    <button
                      type="button"
                      className="btn btn--success btn--sm"
                      disabled={busyId === row.id}
                      onClick={() => decide(row, true)}
                    >
                      {busyId === row.id ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
                      Allow
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      disabled={busyId === row.id}
                      onClick={() => decide(row, false)}
                    >
                      <XCircle size={13} /> Decline
                    </button>
                  </div>
                )}
                {row.status === "late_approved" && (
                  <div className="sub-row__waiting">
                    <Clock size={13} /> waiting for the family to submit
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
