import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import {
  collection, getDocs, deleteDoc, doc, query, where, orderBy, serverTimestamp, addDoc,
} from "firebase/firestore";
import { notifyAnnouncement } from "../../../services/notificationHooks";

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
  const [search, setSearch]               = useState("");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

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
      await notifyAnnouncement({
        schoolCode,
        title: form.title,
        message: form.message,
        audience: form.audience,
        priority: form.priority,
        actor: { name: userName || "Administrator", role: "admin" },
      });
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
  const priorityColor = { urgent: "#ef4444", high: "#f59e0b", normal: "#3b82f6" };
  const priorityLabel = { urgent: "Urgent", high: "High Priority", normal: "Normal" };

  const counts = useMemo(() => ({
    total: items.length,
    urgent: items.filter(i => i.priority === "urgent").length,
    high: items.filter(i => i.priority === "high").length,
    normal: items.filter(i => (i.priority || "normal") === "normal").length,
  }), [items]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (audienceFilter !== "all" && i.audience !== audienceFilter) return false;
      if (priorityFilter !== "all" && (i.priority || "normal") !== priorityFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        if (!i.title?.toLowerCase().includes(s) && !i.body?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [items, audienceFilter, priorityFilter, search]);

  const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

  return (
    <div className="space-y-6">
      <style>{`
        .ann-stat {
          position: relative;
          overflow: hidden;
          border-radius: 14px;
          padding: 18px 20px;
          background: linear-gradient(155deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
          border: 1px solid rgba(255,255,255,0.08);
        }
        .ann-stat__accent { position:absolute; top:0; left:0; width:4px; height:100%; }
        .ann-stat__num { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1; margin-bottom: 6px; }
        .ann-stat__label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text3); }

        .ann-toolbar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 12px 14px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
        }
        .ann-search {
          flex: 1 1 220px; min-width: 180px;
          background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 9px; padding: 9px 12px; color: var(--text);
          font-size: 13px; outline: none; transition: border-color .15s ease;
        }
        .ann-search:focus { border-color: rgba(240,185,11,0.55); }
        .ann-search::placeholder { color: var(--text3); }

        .ann-pill {
          font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.5px;
          padding: 7px 12px; border-radius: 20px; cursor: pointer; user-select: none;
          border: 1px solid rgba(255,255,255,0.1); color: var(--text2);
          background: rgba(255,255,255,0.02); transition: all .15s ease; white-space: nowrap;
        }
        .ann-pill:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }
        .ann-pill--active {
          background: rgba(240,185,11,0.14); border-color: rgba(240,185,11,0.5);
          color: #f0b90b;
        }

        .ann-card {
          position: relative;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.015);
          padding: 20px 20px 20px 24px;
          overflow: hidden;
          transition: border-color .15s ease, transform .15s ease, background .15s ease;
        }
        .ann-card:hover {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.03);
          transform: translateY(-1px);
        }
        .ann-card__bar { position:absolute; top:0; left:0; width:4px; height:100%; }
        .ann-card__delete { opacity: 0; transition: opacity .15s ease; }
        .ann-card:hover .ann-card__delete { opacity: 1; }

        .ann-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; color: #0b0e14;
          background: linear-gradient(135deg, #f0b90b, #f7d154);
          flex-shrink: 0;
        }
      `}</style>

      {/* Header */}
      <div className="flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="module-title">Announcements &amp; Notices</h2>
          <p className="module-sub">Broadcast messages to staff, parents, and teachers</p>
        </div>
        <Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} New Announcement</Btn>
      </div>

      {/* Stats */}
      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <div className="ann-stat">
            <div className="ann-stat__accent" style={{ background: "#f0b90b" }} />
            <div className="ann-stat__num">{counts.total}</div>
            <div className="ann-stat__label">Total Posted</div>
          </div>
          <div className="ann-stat">
            <div className="ann-stat__accent" style={{ background: priorityColor.urgent }} />
            <div className="ann-stat__num">{counts.urgent}</div>
            <div className="ann-stat__label">Urgent</div>
          </div>
          <div className="ann-stat">
            <div className="ann-stat__accent" style={{ background: priorityColor.high }} />
            <div className="ann-stat__num">{counts.high}</div>
            <div className="ann-stat__label">High Priority</div>
          </div>
          <div className="ann-stat">
            <div className="ann-stat__accent" style={{ background: priorityColor.normal }} />
            <div className="ann-stat__num">{counts.normal}</div>
            <div className="ann-stat__label">Normal</div>
          </div>
        </div>
      )}

      {/* Toolbar: search + filters */}
      {!loading && items.length > 0 && (
        <div className="ann-toolbar">
          <input
            className="ann-search"
            placeholder="Search announcements…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", "all_", "staff", "teachers", "parents"].filter((v, i) => v !== "all_").map(key => (
              <span
                key={key}
                className={`ann-pill ${audienceFilter === key ? "ann-pill--active" : ""}`}
                onClick={() => setAudienceFilter(key)}
              >
                {key === "all" ? "Everyone" : audienceLabel[key]}
              </span>
            ))}
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", "urgent", "high", "normal"].map(key => (
              <span
                key={key}
                className={`ann-pill ${priorityFilter === key ? "ann-pill--active" : ""}`}
                onClick={() => setPriorityFilter(key)}
              >
                {key === "all" ? "Any Priority" : priorityLabel[key]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={IC.bell} title="No announcements yet" sub="Post your first notice"
          action={<Btn onClick={() => setShowAdd(true)} variant="gold" size="sm">{IC.plus} Post</Btn>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={IC.warning} title="No matches" sub="Try adjusting your search or filters" />
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const pr = item.priority || "normal";
            return (
              <div key={item.id} className="ann-card">
                <div className="ann-card__bar" style={{ background: priorityColor[pr] }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <span className={`badge ${priorityBadge[pr] || "badge--blue"}`}>{pr}</span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)",
                        letterSpacing: 1, padding: "3px 8px", borderRadius: 20,
                        border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
                      }}>
                        → {audienceLabel[item.audience] || item.audience}
                      </span>
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 5 }}>{item.title}</p>
                    <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.65, marginBottom: 12 }}>{item.body}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="ann-avatar">{initials(item.postedBy)}</div>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text3)" }}>
                        {item.postedBy} · {fmtDate(item.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="ann-card__delete">
                    <ActionBtn onClick={() => handleDelete(item.id)} icon={IC.trash} title="Delete" hoverBg="rgba(239,68,68,0.1)" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compose modal */}
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