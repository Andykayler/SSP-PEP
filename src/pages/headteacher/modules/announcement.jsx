// modules/AnnouncementsModule.jsx
import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, deleteDoc,
  doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import {
  Megaphone, Eye, Trash2, RefreshCw, Loader2, AlertCircle,
  CheckCircle, X, ChevronDown, Send, Users, BookOpen,
  DollarSign, Calendar, AlertTriangle, Plus, Radio, Clock, Archive, Search,
} from "lucide-react";
import "./staff-management.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPES = ["Academic", "Boarding", "Finance", "Events", "General"];
const AUDIENCES = [
  "All Parents",
  "All Students",
  "All Staff",
  "Boarding Students & Parents",
  "Day Students & Parents",
  "Form 1 Parents",
  "Form 2 Parents",
  "Form 3 Parents",
  "Form 4 Parents",
  "Parents with Fee Arrears",
  "Teaching Staff Only",
];
const PRIORITIES = ["Normal", "High", "Urgent"];

const TYPE_META = {
  Academic: { icon: BookOpen,      bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "#3b82f6" },
  Boarding: { icon: Users,         bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "#6366f1" },
  Finance:  { icon: DollarSign,    bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "#f59e0b" },
  Events:   { icon: Calendar,      bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-200",dot: "#10b981" },
  General:  { icon: Megaphone,     bg: "bg-app-bg", text: "text-app-text/70",border:"border-app-border",dot:"#0F2044" },
};

const PRIORITY_META = {
  Normal: { bg: "bg-app-bg",  text: "text-app-text/60", label: "Normal" },
  High:   { bg: "bg-amber-100",  text: "text-amber-700",    label: "High" },
  Urgent: { bg: "bg-red-100",    text: "text-red-700",      label: "Urgent" },
};

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function KpiCard({ label, value, icon: Icon, accent = "neutral", loading }) {
  let cardClass = "stat-card";
  let valueClass = "stat-card__value";
  switch (accent) {
    case "success": valueClass += " stat-card__value--success"; break;
    case "warning": valueClass += " stat-card__value--warning"; break;
    case "danger":  valueClass += " stat-card__value--danger";  break;
    case "info":    valueClass += " stat-card__value--accent";  break;
    default: break;
  }
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className={valueClass}>{loading ? <Spinner size={22} /> : value}</div>
        </div>
        {Icon && <Icon size={24} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}

function TableStatusBadge({ status, variant = "neutral" }) {
  let badgeClass = "status-pill";
  switch (variant) {
    case "success": badgeClass += " status-pill--success"; break;
    case "warning": badgeClass += " status-pill--warning"; break;
    case "danger":  badgeClass += " status-pill--danger";  break;
    default: badgeClass += " status-pill--neutral";
  }
  return <span className={badgeClass}>{status}</span>;
}

function getAnnouncementStatus(a) {
  const now = Date.now();
  const expires = a.expiresAt?.toDate?.()?.getTime?.() ?? (a.expiresAt ? new Date(a.expiresAt).getTime() : null);
  const scheduled = a.scheduledFor?.toDate?.()?.getTime?.() ?? (a.scheduledFor ? new Date(a.scheduledFor).getTime() : null);
  if (expires && expires < now) return "expired";
  if (scheduled && scheduled > now) return "scheduled";
  return "active";
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-medium pointer-events-none
      ${type === "success" ? "bg-success text-white" : "bg-danger text-white"}`}>
      {type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
}

// ─── View modal ───────────────────────────────────────────────────────────────
function ViewModal({ announcement: a, onClose, onDelete }) {
  const tm = TYPE_META[a.type] || TYPE_META.General;
  const pm = PRIORITY_META[a.priority] || PRIORITY_META.Normal;
  const TypeIcon = tm.icon;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface/10 flex items-center justify-center">
              <TypeIcon size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white/50 text-[10px] font-bold tracking-widest uppercase">{a.type}</p>
              <h3 className="text-white font-bold text-base mt-0.5">{a.title}</h3>
            </div>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className={`status-pill ${pm.bg} ${pm.text}`}>{pm.label} priority</span>
            <span className={`status-pill ${tm.bg} ${tm.text} ${tm.border}`}>{a.type}</span>
          </div>
          <div className="p-4 bg-app-bg rounded-xl border border-app-border">
            <p className="text-sm text-app-text/80 whitespace-pre-wrap">{a.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] font-bold uppercase text-muted">Audience</p><p className="font-medium">{a.audience}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-muted">Posted by</p><p className="font-medium">{a.postedBy}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-muted">Date</p><p className="font-medium">{a.displayDate}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-muted">Views</p><p className="font-medium text-success">{a.readCount ?? 0}</p></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { onDelete(a.id); onClose(); }} className="btn btn--danger flex-1">Delete</button>
            <button onClick={onClose} className="btn-cancel flex-1">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compose modal ────────────────────────────────────────────────────────────
function ComposeModal({ onClose, onSend, postedBy, saving }) {
  const [form, setForm] = useState({
    title: "", message: "", type: "Academic", audience: "All Parents", priority: "Normal",
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const validate = () => {
    const e = {};
    if (!form.title.trim())   e.title   = "Title is required";
    if (!form.message.trim()) e.message = "Message is required";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const handleSend = () => { if (validate()) onSend(form); };
  const TypeIcon = TYPE_META[form.type]?.icon || Megaphone;
  const charCount = form.message.length;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: "640px" }}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning flex items-center justify-center">
              <Megaphone size={16} className="text-warning-dark" />
            </div>
            <div>
              <h3>New Announcement</h3>
              <p className="text-muted text-xs">From: {postedBy}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close"><X size={18} /></button>
        </div>
        <div className="modal-body space-y-5">
          <div>
            <label className="field__label">Category</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {TYPES.map(t => {
                const m = TYPE_META[t];
                const Icon = m.icon;
                return (
                  <button key={t} onClick={() => set("type", t)}
                    className={`tag ${form.type === t ? `${m.bg} ${m.text} ${m.border}` : "bg-surface border-app-border text-muted"}`}>
                    <Icon size={12} /> {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="field__label">Title <span className="text-danger">*</span></label>
            <input type="text" value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Parent-Teacher Meeting Notice" className={`field__input ${errors.title ? "border-danger bg-danger/5" : ""}`} />
            {errors.title && <p className="text-danger text-xs mt-1">{errors.title}</p>}
          </div>
          <div>
            <label className="field__label">Message <span className="text-danger">*</span></label>
            <textarea rows={6} value={form.message} onChange={e => set("message", e.target.value)}
              placeholder="Write your announcement here. Be clear and concise — parents read on mobile."
              className={`field__textarea ${errors.message ? "border-danger bg-danger/5" : ""}`} />
            <div className="flex justify-between mt-1">
              {errors.message && <p className="text-danger text-xs">{errors.message}</p>}
              <p className={`text-[10px] ${charCount > 500 ? "text-warning" : "text-muted"} ml-auto`}>{charCount} chars</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field__label">Audience</label>
              <div className="relative">
                <select value={form.audience} onChange={e => set("audience", e.target.value)} className="field__select">
                  {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="field__label">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => {
                  const m = PRIORITY_META[p];
                  return (
                    <button key={p} onClick={() => set("priority", p)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all
                        ${form.priority === p ? `${m.bg} ${m.text} border-transparent` : "bg-surface border-app-border text-muted"}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {form.title && (
            <div className={`p-4 rounded-xl border ${TYPE_META[form.type]?.bg} ${TYPE_META[form.type]?.border}`}>
              <p className="text-[10px] font-bold uppercase text-muted mb-1">Preview</p>
              <p className={`font-semibold text-sm ${TYPE_META[form.type]?.text}`}>{form.title}</p>
              {form.message && <p className="text-xs text-muted mt-1 line-clamp-2">{form.message}</p>}
              <p className="text-[10px] text-muted mt-2">→ {form.audience}</p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={saving} className="btn-cancel">Cancel</button>
          <button onClick={handleSend} disabled={saving} className="btn-save">
            {saving ? <Spinner size={16} /> : <Send size={14} />}
            {saving ? "Sending…" : "Send Announcement"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AnnouncementsModule({ schoolCode, userId, userName }) {
  const [announcements, setAnnouncements] = useState([]);
  const [filterType,    setFilterType]    = useState("All");
  const [filterStatus,  setFilterStatus]  = useState("All");
  const [filterPriority,setFilterPriority]= useState("All");
  const [searchTerm,    setSearchTerm]    = useState("");
  const [showCompose,   setShowCompose]   = useState(false);
  const [viewing,       setViewing]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(null);
  const [toast,         setToast]         = useState(null);
  const [error,         setError]         = useState("");

  const showToast = (msg, type = "success") => setToast({ message: msg, type });

  const loadAnnouncements = useCallback(async () => {
    if (!schoolCode) return;
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(
        query(collection(db, "announcements"), where("schoolCode", "==", schoolCode), orderBy("createdAt", "desc"))
      );
      setAnnouncements(snap.docs.map(d => {
        const data = d.data();
        const ts = data.createdAt?.toDate?.();
        return {
          id: d.id, ...data,
          displayDate: ts ? ts.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—",
        };
      }));
    } catch (err) {
      setError("Could not load announcements: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolCode]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  const handleSend = async (form) => {
    setSaving(true);
    try {
      await addDoc(collection(db, "announcements"), {
        schoolCode, postedById: userId || "", postedBy: userName || "Head Teacher",
        title: form.title.trim(), message: form.message.trim(),
        type: form.type, audience: form.audience, priority: form.priority,
        readCount: 0, createdAt: serverTimestamp(),
      });
      setShowCompose(false);
      showToast("Announcement sent successfully.");
      await loadAnnouncements();
    } catch (err) {
      showToast("Failed to send: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this announcement? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, "announcements", id));
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      showToast("Announcement deleted.");
    } catch (err) {
      showToast("Failed to delete: " + err.message, "error");
    } finally {
      setDeleting(null);
    }
  };

  const withStatus = announcements.map(a => ({ ...a, lifecycle: getAnnouncementStatus(a) }));

  const filtered = withStatus.filter(a => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || a.title?.toLowerCase().includes(q) || a.message?.toLowerCase().includes(q) || a.postedBy?.toLowerCase().includes(q);
    const matchType = filterType === "All" || a.type === filterType;
    const matchPriority = filterPriority === "All" || a.priority === filterPriority;
    const matchStatus = filterStatus === "All"
      || (filterStatus === "Active" && a.lifecycle === "active")
      || (filterStatus === "Scheduled" && a.lifecycle === "scheduled")
      || (filterStatus === "Expired" && a.lifecycle === "expired");
    return matchSearch && matchType && matchPriority && matchStatus;
  });

  const totalCount = announcements.length;
  const activeCount = withStatus.filter(a => a.lifecycle === "active").length;
  const scheduledCount = withStatus.filter(a => a.lifecycle === "scheduled").length;
  const expiredCount = withStatus.filter(a => a.lifecycle === "expired").length;

  const hasActiveFilters = filterType !== "All" || filterStatus !== "All" || filterPriority !== "All" || searchTerm;
  const clearFilters = () => {
    setFilterType("All"); setFilterStatus("All"); setFilterPriority("All"); setSearchTerm("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Communication Center</h2>
          <p className="text-muted">Broadcast updates to parents, students and staff</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAnnouncements} disabled={loading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowCompose(true)} className="btn btn--warning">
            <Plus size={14} /> New Announcement
          </button>
        </div>
      </div>

      {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}

      <div className="stats-grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total" value={totalCount} icon={Megaphone} accent="neutral" loading={loading} />
        <KpiCard label="Active" value={activeCount} icon={Radio} accent="success" loading={loading} />
        <KpiCard label="Scheduled" value={scheduledCount} icon={Clock} accent="warning" loading={loading} />
        <KpiCard label="Expired" value={expiredCount} icon={Archive} accent="danger" loading={loading} />
      </div>

      {/* Filters (compact) */}
      <div className="card">
        <div className="cc__head">
          <div className="cc__head-left">
            <Megaphone size={18} />
            <h3>Announcements</h3>
          </div>
          {hasActiveFilters && <button onClick={clearFilters} className="cc__view">Clear filters</button>}
        </div>
        <div className="cc__body">
          <div className="filter-bar">
            <div className="search-wrapper" style={{ margin: 0 }}>
              <Search size={14} className="search-icon" />
              <input type="text" placeholder="Search title, message, author…" className="search-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="field__select">
              <option value="All">All types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="field__select">
              {["All", "Active", "Scheduled", "Expired"].map(s => <option key={s} value={s}>{s === "All" ? "All status" : s}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="field__select">
              <option value="All">All priority</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="empty-state py-12"><Spinner size={28} /><p className="empty-state__sub">Loading announcements…</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state py-12">
              <Megaphone size={32} className="text-muted" />
              <p className="empty-state__title">{announcements.length === 0 ? "No announcements yet" : "No matching announcements"}</p>
              <p className="empty-state__sub">
                {announcements.length === 0
                  ? "Create your first announcement to reach parents and staff."
                  : "Try changing your search or filters."}
              </p>
              {announcements.length === 0 && (
                <button onClick={() => setShowCompose(true)} className="btn btn--warning mt-4">Create First Announcement</button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-app-border">
              {filtered.map(a => {
                const tm = TYPE_META[a.type] || TYPE_META.General;
                const pm = PRIORITY_META[a.priority] || PRIORITY_META.Normal;
                const TypeIcon = tm.icon;
                const isDeleting = deleting === a.id;
                const statusVariant = a.lifecycle === "active" ? "success" : a.lifecycle === "scheduled" ? "warning" : "neutral";
                return (
                  <div key={a.id} className={`group px-6 py-6 hover:bg-app-bg/50 transition-colors ${isDeleting ? "opacity-40" : ""}`}>
                    <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${tm.bg} ${tm.border}`}>
                        <TypeIcon size={18} className={tm.text} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <TableStatusBadge status={a.type} variant="neutral" />
                          {a.priority !== "Normal" && (
                            <TableStatusBadge status={a.priority} variant={a.priority === "Urgent" ? "danger" : "warning"} />
                          )}
                          <TableStatusBadge status={a.lifecycle.charAt(0).toUpperCase() + a.lifecycle.slice(1)} variant={statusVariant} />
                        </div>
                        <h4 className="font-bold text-app-text text-base">{a.title}</h4>
                        <p className="text-sm text-muted leading-relaxed line-clamp-2">{a.message}</p>
                        <div className="flex flex-wrap gap-4 text-xs text-muted pt-1">
                          <span className="flex items-center gap-1"><Calendar size={12} /> {a.displayDate}</span>
                          <span className="flex items-center gap-1"><Users size={12} /> {a.audience}</span>
                          <span>Posted by <strong className="text-app-text/70">{a.postedBy}</strong></span>
                          {a.readCount > 0 && <span className="text-success font-semibold">{a.readCount} reached</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setViewing(a)} className="btn btn--secondary">View</button>
                        <button onClick={() => handleDelete(a.id)} disabled={isDeleting} className="btn btn--danger">
                          {isDeleting ? <Spinner size={12} /> : <Trash2 size={12} />} Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="cc__head border-t mt-4">
            <p className="text-muted text-[10px]">Showing {filtered.length} of {announcements.length} announcements</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted pt-1">
        Announcements are stored and visible to all staff with access to this school.
      </p>

      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} onSend={handleSend} postedBy={userName || "Head Teacher"} saving={saving} />}
      {viewing && <ViewModal announcement={viewing} onClose={() => setViewing(null)} onDelete={handleDelete} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}