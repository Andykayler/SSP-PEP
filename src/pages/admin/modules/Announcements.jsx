import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import {
  collection, getDocs, deleteDoc, doc, query, where, orderBy, serverTimestamp, addDoc,
} from "firebase/firestore";

import { IC } from "./icons";
import { fmtDate } from "./helpers";
import { Modal, Input, Select, Textarea, Btn, Spinner, EmptyState, ActionBtn } from "./ui";

// ─── MODULE 5: Announcements ──────────────────────────────────────────────────
export default function Announcements({ schoolCode, userName }) {
  const [items, setItems]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showAdd, setShowAdd]             = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm]                   = useState({ title: "", body: "", audience: "all", priority: "normal" });
  const [error, setError]                 = useState("");

  useEffect(() => { fetchAnnouncements(); }, []);

  async function fetchAnnouncements() {
    setLoading(true);
    try {
      const q = query(collection(db, "announcements"), where("schoolCode", "==", schoolCode), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { setError("Title and message are required."); return; }
    setActionLoading(true); setError("");
    try {
      await addDoc(collection(db, "announcements"), { ...form, schoolCode, postedBy: userName, createdAt: serverTimestamp() });
      setShowAdd(false); setForm({ title: "", body: "", audience: "all", priority: "normal" }); fetchAnnouncements();
    } catch (err) { setError("Failed to post: " + err.message); }
    setActionLoading(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this announcement?")) return;
    try { await deleteDoc(doc(db, "announcements", id)); fetchAnnouncements(); } catch (e) { console.error(e); }
  }

  const audienceLabel = { all: "Everyone", staff: "Staff Only", parents: "Parents Only", teachers: "Teachers Only" };
  const priorityBadge = { urgent: "badge--red", high: "badge--amber", normal: "badge--blue" };

  return (
    <div className="space-y-6">
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">Announcements &amp; Notices</h2>
          <p className="module-sub">Broadcast messages to staff, parents, and teachers</p>
        </div>
        <Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} New Announcement</Btn>
      </div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={IC.bell} title="No announcements yet" sub="Post your first notice"
          action={<Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} Post</Btn>}
        />
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span className={`badge ${priorityBadge[item.priority] || "badge--blue"}`}>{item.priority}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", letterSpacing: 1 }}>→ {audienceLabel[item.audience] || item.audience}</span>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 4 }}>{item.title}</p>
                  <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{item.body}</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginTop: 8 }}>Posted by {item.postedBy} · {fmtDate(item.createdAt)}</p>
                </div>
                <ActionBtn onClick={() => handleDelete(item.id)} icon={IC.trash} title="Delete" hoverBg="rgba(239,68,68,0.1)" />
              </div>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <Modal title="New Announcement" onClose={() => setShowAdd(false)} size="lg">
          <form onSubmit={handlePost} className="space-y-4">
            {error && <div className="alert alert--error">{IC.warning}<span>{error}</span></div>}
            <Input label="Title" required value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
            <Textarea label="Message" value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))} rows={4} />
            <div className="grid-2">
              <Select label="Audience" value={form.audience} onChange={e => setForm(p => ({...p, audience: e.target.value}))}>
                <option value="all">Everyone</option>
                <option value="staff">Staff Only</option>
                <option value="teachers">Teachers Only</option>
                <option value="parents">Parents Only</option>
              </Select>
              <Select label="Priority" value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <Btn type="button" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn type="submit" variant="gold" loading={actionLoading}>Post Announcement</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
