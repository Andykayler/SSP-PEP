// modules/AnnouncementsModule.jsx  (Head Teacher / Admin view)
// Full Firestore CRUD: create, read, delete announcements. Stored in `announcements` collection.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, deleteDoc,
  doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import {
  Megaphone, Eye, Trash2, RefreshCw, Loader2, AlertCircle,
  CheckCircle, X, ChevronDown, Send, Users, BookOpen,
  DollarSign, Calendar, AlertTriangle, Plus,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPES = ["Academic", "Boarding", "Finance", "Events", "General"];
// AUDIENCES is now built dynamically from school_classes — see buildAudiences() below
const STATIC_AUDIENCES = [
  "All Parents",
  "All Students",
  "All Staff",
  "Boarding Students & Parents",
  "Day Students & Parents",
  "Parents with Fee Arrears",
  "Teaching Staff Only",
];

// Given a list of { id, name } class objects, produce the full audience dropdown options:
// static general options first, then per-class groups (e.g. "Form 3A — Parents", "Form 3A — Students")
function buildAudiences(classes) {
  const perClass = classes.flatMap(c => [
    `${c.name} — Parents`,
    `${c.name} — Students`,
  ]);
  return [...STATIC_AUDIENCES, ...perClass];
}
const PRIORITIES = ["Normal", "High", "Urgent"];

const TYPE_META = {
  Academic: { icon: BookOpen,      bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "#3b82f6" },
  Boarding: { icon: Users,         bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "#6366f1" },
  Finance:  { icon: DollarSign,    bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "#f59e0b" },
  Events:   { icon: Calendar,      bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-200",dot: "#10b981" },
  General:  { icon: Megaphone,     bg: "bg-[#F7F5F0]", text: "text-[#0F2044]/70",border:"border-[#0F2044]/15",dot:"#0F2044" },
};

const PRIORITY_META = {
  Normal: { bg: "bg-[#F7F5F0]",  text: "text-[#0F2044]/60", label: "Normal" },
  High:   { bg: "bg-amber-100",  text: "text-amber-700",    label: "High" },
  Urgent: { bg: "bg-red-100",    text: "text-red-700",      label: "Urgent" },
};

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5
      rounded-2xl shadow-xl text-sm font-medium pointer-events-none
      ${type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
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
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F2044] px-7 py-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <TypeIcon size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white/50 text-[10px] font-bold tracking-widest uppercase">{a.type}</p>
              <h3 className="text-white font-bold text-base leading-tight mt-0.5">{a.title}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-7 space-y-5">
          {/* Meta row */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${pm.bg} ${pm.text}`}>
              {pm.label} priority
            </span>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${tm.bg} ${tm.text} ${tm.border}`}>
              {a.type}
            </span>
          </div>

          {/* Message */}
          <div className="bg-[#F7F5F0] rounded-2xl p-4">
            <p className="text-sm text-[#0F2044]/80 leading-relaxed whitespace-pre-wrap">{a.message}</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-0.5">Audience</p>
              <p className="font-medium text-[#0F2044]">{a.audience}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-0.5">Posted by</p>
              <p className="font-medium text-[#0F2044]">{a.postedBy}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-0.5">Date</p>
              <p className="font-medium text-[#0F2044]">{a.displayDate}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-0.5">Views</p>
              <p className="font-medium text-emerald-700">{a.readCount ?? 0}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { onDelete(a.id); onClose(); }}
              className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#0F2044]/15 rounded-xl hover:bg-[#F7F5F0] text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compose modal ────────────────────────────────────────────────────────────
function ComposeModal({ onClose, onSend, postedBy, saving, audiences }) {
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "Academic",
    audience: "All Parents",
    priority: "Normal",
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

  const handleSend = () => {
    if (validate()) onSend(form);
  };

  const TypeIcon = TYPE_META[form.type]?.icon || Megaphone;
  const charCount = form.message.length;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-4">
        {/* Header */}
        <div className="bg-[#0F2044] px-7 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F4B400] flex items-center justify-center">
              <Megaphone size={16} className="text-[#0F2044]" />
            </div>
            <div>
              <h3 className="text-white font-bold">New Announcement</h3>
              <p className="text-white/50 text-xs mt-0.5">From: {postedBy}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-7 space-y-5">
          {/* Type pills */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => {
                const m = TYPE_META[t];
                const Icon = m.icon;
                return (
                  <button
                    key={t}
                    onClick={() => set("type", t)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${form.type === t ? `${m.bg} ${m.text} ${m.border}` : "bg-white border-[#0F2044]/10 text-[#0F2044]/50 hover:border-[#0F2044]/25"}`}
                  >
                    <Icon size={12} /> {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="e.g. Parent-Teacher Meeting Notice"
              className={`w-full px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] transition-colors
                ${errors.title ? "border-red-300 bg-red-50" : "border-[#0F2044]/15"}`}
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* Message */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-2">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={6}
              value={form.message}
              onChange={e => set("message", e.target.value)}
              placeholder="Write your announcement here. Be clear and concise — parents read on mobile."
              className={`w-full px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] resize-none transition-colors leading-relaxed
                ${errors.message ? "border-red-300 bg-red-50" : "border-[#0F2044]/15"}`}
            />
            <div className="flex justify-between mt-1">
              {errors.message
                ? <p className="text-red-500 text-xs">{errors.message}</p>
                : <span />}
              <p className={`text-[10px] ${charCount > 500 ? "text-amber-600" : "text-[#0F2044]/30"}`}>
                {charCount} chars
              </p>
            </div>
          </div>

          {/* Audience + Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-2">Audience</label>
              <div className="relative">
                <select
                  value={form.audience}
                  onChange={e => set("audience", e.target.value)}
                  className="w-full appearance-none pl-4 pr-10 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] bg-white"
                >
                  <optgroup label="General">
                    {STATIC_AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                  </optgroup>
                  {audiences.filter(a => !STATIC_AUDIENCES.includes(a)).length > 0 && (
                    <optgroup label="By Class">
                      {audiences.filter(a => !STATIC_AUDIENCES.includes(a)).map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/50 mb-2">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => {
                  const m = PRIORITY_META[p];
                  return (
                    <button
                      key={p}
                      onClick={() => set("priority", p)}
                      className={`flex-1 py-3 rounded-2xl text-xs font-bold border transition-all
                        ${form.priority === p
                          ? `${m.bg} ${m.text} border-transparent`
                          : "bg-white border-[#0F2044]/10 text-[#0F2044]/50 hover:border-[#0F2044]/20"}`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview strip */}
          {form.title && (
            <div className={`p-4 rounded-2xl border ${TYPE_META[form.type]?.bg} ${TYPE_META[form.type]?.border}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-1">Preview</p>
              <p className={`font-semibold text-sm ${TYPE_META[form.type]?.text}`}>{form.title}</p>
              {form.message && (
                <p className="text-xs text-[#0F2044]/60 mt-1 line-clamp-2">{form.message}</p>
              )}
              <p className="text-[10px] text-[#0F2044]/40 mt-2">→ {form.audience}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-3 pt-2 border-t border-[#0F2044]/8">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 border border-[#0F2044]/15 rounded-2xl font-medium text-sm hover:bg-[#F7F5F0] transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F4B400] text-[#0F2044] rounded-2xl font-bold text-sm hover:brightness-105 transition-all disabled:opacity-60"
            >
              {saving ? <Spinner size={15} /> : <Send size={15} />}
              {saving ? "Sending…" : "Send Announcement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AnnouncementsModule({ schoolCode, userId, userName }) {
  const [announcements, setAnnouncements] = useState([]);
  const [classes,       setClasses]       = useState([]); // resolved school_classes docs
  const [classesReady,  setClassesReady]  = useState(false);
  const [filterType,    setFilterType]    = useState("All");
  const [showCompose,   setShowCompose]   = useState(false);
  const [viewing,       setViewing]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(null);
  const [toast,         setToast]         = useState(null);
  const [error,         setError]         = useState("");

  const showToast = (msg, type = "success") => setToast({ message: msg, type });

  // ── Load school_classes (same pattern as PerformanceModule) ───────────────
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    (async () => {
      setClassesReady(false);
      try {
        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;
        setClasses(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        );
      } catch (err) {
        console.error("load classes:", err);
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  // Audience list: static options + one entry per real class
  const audiences = buildAudiences(classes);

  // ── Load announcements ─────────────────────────────────────────────────────
  const loadAnnouncements = useCallback(async () => {
    if (!schoolCode) return;
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "announcements"),
          where("schoolCode", "==", schoolCode),
          orderBy("createdAt", "desc")
        )
      );
      setAnnouncements(snap.docs.map(d => {
        const data = d.data();
        const ts = data.createdAt?.toDate?.();
        return {
          id: d.id,
          ...data,
          displayDate: ts
            ? ts.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—",
        };
      }));
    } catch (err) {
      setError("Could not load announcements: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolCode]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  // ── Send announcement ──────────────────────────────────────────────────────
  const handleSend = async (form) => {
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, "announcements"), {
        schoolCode,
        postedById: userId || "",
        postedBy:   userName || "Head Teacher",
        title:      form.title.trim(),
        message:    form.message.trim(),
        type:       form.type,
        audience:   form.audience,
        priority:   form.priority,
        readCount:  0,
        createdAt:  serverTimestamp(),
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

  // ── Delete announcement ────────────────────────────────────────────────────
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

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = announcements.filter(a => filterType === "All" || a.type === filterType);

  const totalThisTerm = announcements.length;
  const highPriorityCount = announcements.filter(a => a.priority === "Urgent" || a.priority === "High").length;
  const totalReach = announcements.reduce((s, a) => s + (a.readCount || 0), 0);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Announcements
          </h2>
          <p className="text-[#0F2044]/60 mt-1">Communicate with parents, students and staff</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAnnouncements}
            disabled={loading}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 bg-[#F4B400] text-[#0F2044] px-5 py-2.5 rounded-2xl hover:brightness-105 font-bold text-sm transition-all"
          >
            <Plus size={16} /> New Announcement
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Announcements", value: loading ? null : totalThisTerm,       color: "text-[#0F2044]",   bg: "bg-white border-[#0F2044]/8" },
          { label: "Total Parent Reach",  value: loading ? null : totalReach,          color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
          { label: "High / Urgent",       value: loading ? null : highPriorityCount,   color: "text-red-600",     bg: "bg-red-50 border-red-100" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-3xl p-5 border ${bg}`}>
            <p className={`text-3xl font-bold ${color}`}>
              {loading ? <Loader2 size={22} className="animate-spin opacity-30" /> : value}
            </p>
            <p className="text-xs text-[#0F2044]/50 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {["All", ...TYPES].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all
              ${filterType === type
                ? "bg-[#0F2044] text-white"
                : "bg-white border border-[#0F2044]/10 text-[#0F2044]/60 hover:bg-[#F7F5F0]"}`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* ── Timeline ── */}
      <div>
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#0F2044] text-sm">
            {filterType === "All" ? "All Announcements" : `${filterType} Announcements`}
          </h3>
          <span className="text-xs text-[#0F2044]/50">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading && (
          <div className="bg-white rounded-3xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3">
            <Spinner size={26} />
            <p className="text-sm text-[#0F2044]/40">Loading announcements…</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-3xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3 text-center px-4">
            <Megaphone size={32} className="text-[#0F2044]/20" />
            <p className="text-sm font-medium text-[#0F2044]/40">
              {filterType === "All" ? "No announcements yet." : `No ${filterType} announcements yet.`}
            </p>
            <button
              onClick={() => setShowCompose(true)}
              className="mt-2 px-5 py-2.5 bg-[#F4B400] text-[#0F2044] font-bold text-sm rounded-2xl hover:brightness-105 transition-all"
            >
              Create First Announcement
            </button>
          </div>
        )}

        {!loading && filtered.length > 0 && (() => {
          // Group announcements by displayDate
          const groups = [];
          const seen = {};
          filtered.forEach(a => {
            const key = a.displayDate || "Unknown date";
            if (!seen[key]) { seen[key] = []; groups.push({ label: key, items: seen[key] }); }
            seen[key].push(a);
          });

          // Human-friendly label for today / yesterday
          const today     = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
          const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
          const friendlyLabel = (l) => l === today ? "Today" : l === yesterday ? "Yesterday" : l;

          return (
            <div className="relative">
              {/* Vertical spine */}
              <div className="absolute left-[19px] top-8 bottom-4 w-px bg-[#0F2044]/8 hidden sm:block" />

              <div className="space-y-8">
                {groups.map(({ label, items }) => (
                  <div key={label}>
                    {/* Day label */}
                    <div className="flex items-center gap-3 mb-4">
                      {/* Dot on the spine */}
                      <div className="relative z-10 w-10 h-10 rounded-2xl bg-[#0F2044] flex items-center justify-center shrink-0 hidden sm:flex">
                        <Calendar size={14} className="text-white" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#0F2044]">{friendlyLabel(label)}</span>
                        <span className="text-[10px] font-semibold text-[#0F2044]/40 bg-[#F7F5F0] px-2 py-0.5 rounded-full">
                          {items.length} announcement{items.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Cards for this day */}
                    <div className="sm:pl-14 space-y-3">
                      {items.map(a => {
                        const tm = TYPE_META[a.type] || TYPE_META.General;
                        const pm = PRIORITY_META[a.priority] || PRIORITY_META.Normal;
                        const TypeIcon = tm.icon;
                        const isDeleting = deleting === a.id;
                        return (
                          <div
                            key={a.id}
                            className={`group bg-white rounded-2xl border border-[#0F2044]/8 px-5 py-4 hover:border-[#0F2044]/20 hover:shadow-sm transition-all ${isDeleting ? "opacity-40" : ""}`}
                          >
                            <div className="flex flex-col md:flex-row md:items-start gap-3">
                              {/* Type icon */}
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${tm.bg} ${tm.border}`}>
                                <TypeIcon size={15} className={tm.text} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  {a.priority !== "Normal" && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${pm.bg} ${pm.text}`}>
                                      {a.priority === "Urgent" && <AlertTriangle size={9} className="inline mr-0.5 -mt-0.5" />}
                                      {pm.label}
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${tm.bg} ${tm.text} ${tm.border}`}>
                                    {a.type}
                                  </span>
                                </div>

                                <h4 className="font-bold text-[#0F2044] text-sm mb-0.5">{a.title}</h4>
                                <p className="text-xs text-[#0F2044]/55 leading-relaxed line-clamp-2">{a.message}</p>

                                <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#0F2044]/40">
                                  <span>→ <span className="font-semibold text-[#0F2044]/55">{a.audience}</span></span>
                                  <span>by <span className="font-semibold text-[#0F2044]/55">{a.postedBy}</span></span>
                                  {a.readCount > 0 && (
                                    <span className="text-emerald-600 font-semibold">{a.readCount} reached</span>
                                  )}
                                </div>
                              </div>

                              {/* Actions — visible on hover */}
                              <div className="flex items-center gap-2 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setViewing(a)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#F7F5F0] hover:bg-[#0F2044]/8 text-[#0F2044]/60 hover:text-[#0F2044] rounded-xl transition-colors"
                                >
                                  <Eye size={11} /> View
                                </button>
                                <button
                                  onClick={() => handleDelete(a.id)}
                                  disabled={isDeleting}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors disabled:opacity-40"
                                >
                                  {isDeleting ? <Spinner size={11} /> : <Trash2 size={11} />}
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      <p className="text-center text-xs text-[#0F2044]/40">
        Announcements are stored and visible to all staff with access to this school.
      </p>

      {/* ── Modals ── */}
      {showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          onSend={handleSend}
          postedBy={userName || "Head Teacher"}
          saving={saving}
          audiences={audiences}
        />
      )}

      {viewing && (
        <ViewModal
          announcement={viewing}
          onClose={() => setViewing(null)}
          onDelete={handleDelete}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}