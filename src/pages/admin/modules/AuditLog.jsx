import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

import { IC } from "./icons";
import { fmtDate } from "./helpers";
import { Spinner, EmptyState } from "./ui";

// ─── MODULE 6: Audit Log ──────────────────────────────────────────────────────
export default function AuditLog({ schoolCode }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const q = query(collection(db, "audit_logs"), where("schoolCode", "==", schoolCode), orderBy("timestamp", "desc"));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { setLogs([]); }
    setLoading(false);
  }

  const actionBadge = {
    user_created: "badge--green", user_deleted: "badge--red",
    user_suspended: "badge--amber", settings_updated: "badge--blue",
    announcement_posted: "badge--purple", student_registered: "badge--teal",
    student_transferred: "badge--blue",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="module-title">Audit Log</h2>
        <p className="module-sub">A record of all administrative actions</p>
      </div>
      <div className="card">
        {loading ? (
          <div style={{ padding: 48, display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : logs.length === 0 ? (
          <EmptyState icon={IC.audit} title="No audit entries yet" sub="Actions appear here automatically" />
        ) : (
          <div>
            {logs.map(log => (
              <div key={log.id} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, background: "var(--accent-pale)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-lt)", flexShrink: 0, marginTop: 2 }}>{IC.audit}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                    <span className={`badge ${actionBadge[log.action] || "badge--blue"}`}>{(log.action||"").replace(/_/g," ")}</span>
                    <span style={{ fontSize: 12.5, color: "var(--text2)" }}>{log.description}</span>
                  </div>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 0.5 }}>By {log.performedBy} · {fmtDate(log.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
