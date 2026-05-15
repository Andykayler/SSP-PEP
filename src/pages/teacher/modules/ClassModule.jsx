import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from "firebase/firestore";
import {
  Plus, Calendar, Clock, BookOpen, Edit2, Eye, Trash2,
  X, Save, RefreshCw, AlertCircle, CheckCircle, Loader2, Search,
} from "lucide-react";

// ─── period config ────────────────────────────────────────────────────────────
const PERIODS = [
  { number: 1, label: "P1", start: "07:30", end: "08:20" },
  { number: 2, label: "P2", start: "08:30", end: "09:20" },
  { number: 3, label: "P3", start: "09:30", end: "10:20" },
  { number: 4, label: "P4", start: "10:30", end: "11:20" },
  { number: 5, label: "P5", start: "11:30", end: "12:20" },
  { number: 6, label: "P6", start: "13:00", end: "13:50" },
  { number: 7, label: "P7", start: "14:00", end: "14:50" },
  { number: 8, label: "P8", start: "15:00", end: "15:50" },
];

// ─── status config ────────────────────────────────────────────────────────────
const STATUS = {
  planned: {
    label: "Planned",
    bg: "bg-amber-100",
    text: "text-amber-800",
    blockBg: "bg-amber-50",
    blockText: "text-amber-700",
    blockBorder: "border-amber-200",
    dot: "bg-amber-500",
  },
  "in-progress": {
    label: "In progress",
    bg: "bg-blue-100",
    text: "text-blue-800",
    blockBg: "bg-blue-50",
    blockText: "text-blue-700",
    blockBorder: "border-blue-200",
    dot: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    blockBg: "bg-emerald-50",
    blockText: "text-emerald-700",
    blockBorder: "border-emerald-200",
    dot: "bg-emerald-500",
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

function getPeriod(num) {
  return PERIODS.find((p) => p.number === Number(num)) || null;
}

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-medium
      ${type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
      {type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
}

// ─── period block ─────────────────────────────────────────────────────────────
function PeriodBlock({ periodNumber, status = "planned" }) {
  const period = getPeriod(periodNumber);
  const s = STATUS[status] || STATUS.planned;

  return (
    <div className={`w-14 flex flex-col items-center justify-center rounded-2xl border ${s.blockBorder} ${s.blockBg} py-3 min-h-[64px] shrink-0`}>
      {period ? (
        <>
          <span className={`text-[11px] font-bold tracking-wide ${s.blockText}`}>{period.label}</span>
          <span className={`text-[10px] mt-0.5 ${s.blockText} opacity-80`}>{period.start}</span>
          <span className={`text-[9px] mt-0.5 ${s.blockText} opacity-55`}>{period.end}</span>
        </>
      ) : (
        <>
          <Clock size={13} className={`${s.blockText} opacity-60`} />
          <span className={`text-[10px] mt-1 font-medium ${s.blockText} opacity-60`}>—</span>
        </>
      )}
    </div>
  );
}

// ─── plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, onView, onEdit, onDelete }) {
  const s = STATUS[plan.status] || STATUS.planned;

  return (
    <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-4 flex gap-4 hover:border-[#0F2044]/20 transition-all group">
      <PeriodBlock periodNumber={plan.periodNumber} status={plan.status} />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs px-2.5 py-0.5 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-lg text-[#0F2044]/70 font-medium">
            {plan.className}
          </span>
          <span className="text-xs px-2.5 py-0.5 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-lg text-[#0F2044]/70 font-medium">
            {plan.subject}
          </span>
          <span className={`text-xs px-2.5 py-0.5 rounded-lg font-semibold flex items-center gap-1.5 ${s.bg} ${s.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        </div>

        <h3 className="font-semibold text-[#0F2044] text-sm leading-snug mb-1 truncate">
          {plan.topic}
        </h3>

        {plan.objectives && (
          <p className="text-xs text-[#0F2044]/55 leading-relaxed line-clamp-2 mb-2">
            {plan.objectives}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[11px] text-[#0F2044]/40 flex items-center gap-1">
            <Calendar size={11} />
            {dayLabel(plan.date)}, {fmt(plan.date)}
          </span>
          {plan.periodNumber && (
            <span className="text-[11px] text-[#0F2044]/40 flex items-center gap-1">
              <Clock size={11} />
              {(() => {
                const p = getPeriod(plan.periodNumber);
                return p ? `${p.start} – ${p.end}` : `Period ${plan.periodNumber}`;
              })()}
            </span>
          )}
          {plan.week && (
            <span className="text-[11px] text-[#0F2044]/40">Wk {plan.week} · {plan.term}</span>
          )}
          {plan.assessment && (
            <span className="text-[11px] text-[#0F2044]/40 hidden lg:inline truncate max-w-[200px]">
              {plan.assessment}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onView(plan)}
          className="p-2 hover:bg-blue-50 text-[#0F2044]/40 hover:text-blue-600 rounded-xl transition-colors"
          title="View"
        >
          <Eye size={15} />
        </button>
        <button
          onClick={() => onEdit(plan)}
          className="p-2 hover:bg-amber-50 text-[#0F2044]/40 hover:text-amber-600 rounded-xl transition-colors"
          title="Edit"
        >
          <Edit2 size={15} />
        </button>
        <button
          onClick={() => onDelete(plan.id)}
          className="p-2 hover:bg-red-50 text-[#0F2044]/40 hover:text-red-500 rounded-xl transition-colors"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function ClassPlanningModule({ userId, schoolCode }) {
  const [plans,         setPlans]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [myClasses,     setMyClasses]     = useState([]);
  const [mySubjects,    setMySubjects]    = useState([]);
  const [assignLoading, setAssignLoading] = useState(true);

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showNew,  setShowNew]  = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [viewPlan, setViewPlan] = useState(null);
  const [toast,    setToast]    = useState(null);

  const showToast = (message, type = "success") => setToast({ message, type });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setAssignLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("__name__", "==", userId))
        );
        if (!snap.empty) {
          const d = snap.docs[0].data();
          setMyClasses(d.assignedClasses  || []);
          setMySubjects(d.assignedSubjects || []);
        }
      } catch (err) {
        console.error(err);
        showToast("Could not load your class assignments.", "error");
      } finally {
        setAssignLoading(false);
      }
    })();
  }, [userId]);

  // ── FIXED: removed orderBy("date") to avoid requiring a composite index.
  // Plans are sorted client-side instead.
  const fetchPlans = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "lesson_plans"),
          where("teacherId", "==", userId)
        )
      );
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const dateA = a.date || "";
          const dateB = b.date || "";
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          const tsA = a.createdAt?.seconds ?? 0;
          const tsB = b.createdAt?.seconds ?? 0;
          return tsB - tsA;
        });
      setPlans(sorted);
    } catch (err) {
      console.error("fetchPlans error:", err);
      showToast(`Could not load lesson plans: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlans(); }, [userId]);

  const savePlan = async (formData, existingId = null) => {
    const payload = { ...formData, teacherId: userId, schoolCode, updatedAt: serverTimestamp() };
    if (existingId) {
      await updateDoc(doc(db, "lesson_plans", existingId), payload);
      setPlans((prev) =>
        prev
          .map((p) => (p.id === existingId ? { ...p, ...payload } : p))
          .sort((a, b) => {
            const dateA = a.date || "";
            const dateB = b.date || "";
            if (dateB !== dateA) return dateB.localeCompare(dateA);
            const tsA = a.createdAt?.seconds ?? 0;
            const tsB = b.createdAt?.seconds ?? 0;
            return tsB - tsA;
          })
      );
      showToast("Lesson plan updated.");
    } else {
      payload.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "lesson_plans"), payload);
      setPlans((prev) => [{ id: ref.id, ...payload }, ...prev]);
      showToast("Lesson plan created.");
    }
  };

  const deletePlan = async (id) => {
    if (!window.confirm("Delete this lesson plan?")) return;
    try {
      await deleteDoc(doc(db, "lesson_plans", id));
      setPlans((prev) => prev.filter((p) => p.id !== id));
      showToast("Lesson plan deleted.");
    } catch {
      showToast("Failed to delete.", "error");
    }
  };

  const filtered = plans.filter((p) => {
    const matchSearch =
      !search ||
      p.topic?.toLowerCase().includes(search.toLowerCase()) ||
      p.className?.toLowerCase().includes(search.toLowerCase()) ||
      p.subject?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all:           plans.length,
    planned:       plans.filter((p) => p.status === "planned").length,
    "in-progress": plans.filter((p) => p.status === "in-progress").length,
    completed:     plans.filter((p) => p.status === "completed").length,
  };

  const noAssignments = !assignLoading && myClasses.length === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0F2044]">Lesson plans</h2>
          <p className="text-sm text-[#0F2044]/55 mt-0.5">
            {assignLoading
              ? "Loading your assignments…"
              : myClasses.length > 0
              ? `${myClasses.join(" · ")}  ·  ${mySubjects.slice(0, 3).join(" · ")}${mySubjects.length > 3 ? " …" : ""}`
              : "No classes assigned yet"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={fetchPlans}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowNew(true)}
            disabled={noAssignments}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0F2044] text-white rounded-2xl hover:bg-[#1A2F5C] transition-colors font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> New plan
          </button>
        </div>
      </div>

      {noAssignments && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          No classes assigned. Your head teacher must assign classes from the Staff Management page first.
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/35" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics, classes, subjects…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#0F2044]/10 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/30 text-[#0F2044]"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { id: "all",         label: "All" },
            { id: "planned",     label: "Planned" },
            { id: "in-progress", label: "In progress" },
            { id: "completed",   label: "Completed" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-xl transition-all whitespace-nowrap
                ${statusFilter === f.id
                  ? "bg-[#0F2044] text-white"
                  : "bg-white border border-[#0F2044]/10 text-[#0F2044]/60 hover:border-[#0F2044]/25"
                }`}
            >
              {f.label}
              <span className={`ml-1.5 ${statusFilter === f.id ? "opacity-60" : "opacity-40"}`}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Plans list */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-20 flex flex-col items-center gap-3 text-[#0F2044]/40">
            <Spinner size={28} />
            <p className="text-sm">Loading lesson plans…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-20 text-center">
            <BookOpen size={28} className="mx-auto mb-3 text-[#0F2044]/20" />
            <p className="text-sm text-[#0F2044]/35">
              {plans.length === 0 ? "No lesson plans yet. Create your first one." : "No plans match your filter."}
            </p>
          </div>
        ) : (
          filtered.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onView={setViewPlan}
              onEdit={setEditPlan}
              onDelete={deletePlan}
            />
          ))
        )}
      </div>

      <p className="text-center text-[11px] text-[#0F2044]/35 pt-1">
        Lesson plans track curriculum coverage and support MANEB syllabus requirements.
      </p>

      {showNew && (
        <PlanModal
          myClasses={myClasses}
          mySubjects={mySubjects}
          onSave={(data) => savePlan(data)}
          onClose={() => setShowNew(false)}
        />
      )}
      {editPlan && (
        <PlanModal
          plan={editPlan}
          myClasses={myClasses}
          mySubjects={mySubjects}
          onSave={(data) => savePlan(data, editPlan.id)}
          onClose={() => setEditPlan(null)}
        />
      )}
      {viewPlan && (
        <ViewModal plan={viewPlan} onClose={() => setViewPlan(null)} />
      )}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── create / edit modal ──────────────────────────────────────────────────────
function PlanModal({ plan, myClasses, mySubjects, onSave, onClose }) {
  const isEdit = Boolean(plan);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const [form, setForm] = useState({
    className:    plan?.className    || myClasses[0]  || "",
    subject:      plan?.subject      || mySubjects[0] || "",
    date:         plan?.date         || new Date().toISOString().slice(0, 10),
    periodNumber: plan?.periodNumber || 1,
    week:         plan?.week         || "",
    term:         plan?.term         || "Term 1",
    topic:        plan?.topic        || "",
    objectives:   plan?.objectives   || "",
    resources:    plan?.resources    || "",
    assessment:   plan?.assessment   || "",
    notes:        plan?.notes        || "",
    status:       plan?.status       || "planned",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedPeriod = getPeriod(form.periodNumber);

  const handleSave = async () => {
    if (!form.topic.trim())      { setError("Topic is required."); return; }
    if (!form.objectives.trim()) { setError("Learning objectives are required."); return; }
    if (!form.className)         { setError("Please select a class."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.code === "permission-denied"
        ? "Permission denied. Check your Firestore rules."
        : "Failed to save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[94vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-[#0F2044] px-7 py-5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-bold text-lg">
              {isEdit ? "Edit lesson plan" : "New lesson plan"}
            </h3>
            {isEdit && <p className="text-white/50 text-xs mt-0.5 truncate max-w-xs">{plan.topic}</p>}
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1">
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto p-7 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">CLASS</label>
              <select
                value={form.className}
                onChange={(e) => set("className", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 bg-white text-[#0F2044]"
              >
                {myClasses.length === 0 && <option value="">No classes assigned</option>}
                {myClasses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">SUBJECT</label>
              <select
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 bg-white text-[#0F2044]"
              >
                {mySubjects.length === 0 && <option value="">No subjects assigned</option>}
                {mySubjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">TOPIC / CHAPTER *</label>
            <input
              type="text"
              placeholder="e.g. Factorisation of quadratic expressions"
              value={form.topic}
              onChange={(e) => set("topic", e.target.value)}
              className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">LEARNING OBJECTIVES *</label>
            <textarea
              rows={3}
              placeholder="By the end of the lesson, students should be able to…"
              value={form.objectives}
              onChange={(e) => set("objectives", e.target.value)}
              className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm resize-y focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">DATE</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">PERIOD</label>
              <select
                value={form.periodNumber}
                onChange={(e) => set("periodNumber", Number(e.target.value))}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 bg-white text-[#0F2044]"
              >
                {PERIODS.map((p) => (
                  <option key={p.number} value={p.number}>
                    Period {p.number}  ({p.start} – {p.end})
                  </option>
                ))}
              </select>
              {selectedPeriod && (
                <p className="text-[11px] text-[#0F2044]/40 mt-1 pl-1">
                  {selectedPeriod.start} – {selectedPeriod.end}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">WEEK</label>
              <input
                type="number"
                min={1} max={16}
                placeholder="e.g. 12"
                value={form.week}
                onChange={(e) => set("week", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">TERM</label>
              <select
                value={form.term}
                onChange={(e) => set("term", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 bg-white text-[#0F2044]"
              >
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">RESOURCES</label>
              <input
                type="text"
                placeholder="Textbook, graph boards…"
                value={form.resources}
                onChange={(e) => set("resources", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">ASSESSMENT</label>
              <input
                type="text"
                placeholder="Class exercise + Homework"
                value={form.assessment}
                onChange={(e) => set("assessment", e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#0F2044]/50 mb-1.5 block tracking-wide">NOTES</label>
            <textarea
              rows={2}
              placeholder="Any extra notes…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full px-3.5 py-2.5 border border-[#0F2044]/12 rounded-xl text-sm resize-y focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#0F2044]/50 mb-2 block tracking-wide">STATUS</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS).map(([key, s]) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer text-sm font-medium transition-all
                    ${form.status === key
                      ? `border-current ${s.bg} ${s.text}`
                      : "border-[#0F2044]/10 text-[#0F2044]/50 hover:border-[#0F2044]/25"
                    }`}
                >
                  <input type="radio" name="status" checked={form.status === key}
                    onChange={() => set("status", key)} className="sr-only" />
                  <span className={`w-2 h-2 rounded-full ${form.status === key ? s.dot : "bg-[#0F2044]/20"}`} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-7 py-5 border-t border-[#0F2044]/8 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-[#0F2044]/15 rounded-2xl font-medium text-[#0F2044]/60 hover:bg-[#F7F5F0] transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-[#F4B400] hover:brightness-105 disabled:opacity-60 text-[#0F2044] font-bold rounded-2xl flex items-center justify-center gap-2 transition-all text-sm"
          >
            {saving ? <Spinner size={16} /> : <Save size={16} />}
            {isEdit ? "Update plan" : "Save plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── view modal ───────────────────────────────────────────────────────────────
function ViewModal({ plan, onClose }) {
  const s = STATUS[plan.status] || STATUS.planned;
  const period = getPeriod(plan.periodNumber);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="bg-[#0F2044] px-7 py-5 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs px-2.5 py-0.5 bg-white/15 text-white/80 rounded-lg font-medium">{plan.className}</span>
              <span className="text-xs px-2.5 py-0.5 bg-white/15 text-white/80 rounded-lg font-medium">{plan.subject}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-lg font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
            </div>
            <h3 className="text-white font-bold text-lg leading-snug">{plan.topic}</h3>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-7 space-y-5">
          <div className={`flex items-center gap-4 p-4 rounded-2xl border ${s.blockBorder} ${s.blockBg}`}>
            <div className="flex flex-col items-center justify-center w-12 shrink-0">
              <span className={`text-sm font-bold ${s.blockText}`}>{period?.label || "—"}</span>
              {period && <span className={`text-[10px] mt-0.5 ${s.blockText} opacity-70`}>{period.start}</span>}
              {period && <span className={`text-[10px] ${s.blockText} opacity-50`}>{period.end}</span>}
            </div>
            <div className={`h-8 w-px ${s.blockBorder} border-l`} />
            <div className="flex-1 grid grid-cols-2 gap-x-6 text-sm">
              <div>
                <p className={`text-[10px] font-bold tracking-wide ${s.blockText} opacity-60 mb-0.5`}>DATE</p>
                <p className={`font-medium ${s.blockText}`}>{dayLabel(plan.date)}, {fmt(plan.date)}</p>
              </div>
              <div>
                <p className={`text-[10px] font-bold tracking-wide ${s.blockText} opacity-60 mb-0.5`}>WEEK / TERM</p>
                <p className={`font-medium ${s.blockText}`}>Wk {plan.week || "—"} · {plan.term}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-[#0F2044]/45 mb-2 tracking-wide">LEARNING OBJECTIVES</p>
            <div className="bg-[#F7F5F0] p-4 rounded-xl text-sm leading-relaxed text-[#0F2044]/80 border border-[#0F2044]/5">
              {plan.objectives}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[11px] font-bold text-[#0F2044]/45 mb-1 tracking-wide">RESOURCES</p>
              <p className="text-[#0F2044]/70">{plan.resources || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#0F2044]/45 mb-1 tracking-wide">ASSESSMENT</p>
              <p className="text-[#0F2044]/70">{plan.assessment || "—"}</p>
            </div>
          </div>

          {plan.notes && (
            <div className="text-sm">
              <p className="text-[11px] font-bold text-[#0F2044]/45 mb-1 tracking-wide">NOTES</p>
              <p className="text-[#0F2044]/60 leading-relaxed">{plan.notes}</p>
            </div>
          )}

          <div className="pt-3 border-t border-[#0F2044]/8 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 border border-[#0F2044]/15 rounded-xl hover:bg-[#F7F5F0] text-sm font-medium transition-colors text-[#0F2044]/70"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}