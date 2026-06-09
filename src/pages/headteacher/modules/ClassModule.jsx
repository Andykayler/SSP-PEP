import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, getDoc,
} from "firebase/firestore";
import {
  Calendar, Clock, BookOpen, Eye, Download,
  X, Users, Star, Plus, ChevronDown,
  RefreshCw, AlertCircle, CheckCircle, Loader2, Trash2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  completed:   "bg-emerald-100 text-emerald-700",
  "in-progress": "bg-blue-100 text-blue-700",
  planned:     "bg-amber-100 text-amber-700",
};
const STATUS_LABELS = {
  completed:   "Completed",
  "in-progress": "In progress",
  planned:     "Planned",
};

const PERIODS = [
  "Period 1 (07:30 – 08:20)",
  "Period 2 (08:30 – 09:20)",
  "Period 3 (09:30 – 10:20)",
  "Period 4 (10:30 – 11:20)",
  "Period 5 (11:30 – 12:20)",
  "Period 6 (13:00 – 13:50)",
  "Period 7 (14:00 – 14:50)",
  "Period 8 (15:00 – 15:50)",
];

const CLASS_NAMES = [
  "Form 1A","Form 1B","Form 2A","Form 2B",
  "Form 3A","Form 3B","Form 4A","Form 4B",
];

const TERMS = ["Term 1","Term 2","Term 3"];

const EMPTY_FORM = {
  teacherId: "",
  className: "",
  subject:   "",
  date:      "",
  period:    "",
  topic:     "",
  objectives:"",
  resources: "",
  assessment:"",
  week:      "",
  term:      "Term 2",
  status:    "planned",
};

const inputCls =
  "w-full px-4 py-3 bg-app-bg border border-app-border rounded-2xl focus:outline-none focus:border-[#0F2044]/30 text-sm text-app-text transition-colors";

function initials(name = "") {
  return name.split(" ").filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
}

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-app-text/40 inline-block" />;
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

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, required, children, error }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-app-text/50 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function CreatePlanModal({ onClose, onSave, editingPlan, staffList, headTeacherId }) {
  const isEdit = !!editingPlan;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(
    editingPlan
      ? { ...editingPlan }
      : { ...EMPTY_FORM, teacherId: headTeacherId }
  );
  const [errors, setErrors] = useState({});

  // subjects available for the selected teacher
  const selectedTeacher = staffList.find((t) => t.id === form.teacherId);
  const subjectOptions  = selectedTeacher?.subjects || [];

  function set(field, value) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      // reset subject when teacher changes and their subjects don't include current
      if (field === "teacherId") {
        const newTeacher = staffList.find((t) => t.id === value);
        if (!newTeacher?.subjects?.includes(updated.subject)) updated.subject = "";
      }
      return updated;
    });
    setErrors((e) => ({ ...e, [field]: "" }));
  }

  function validate() {
    const required = ["className","subject","date","period","topic","objectives","week","term"];
    const errs = {};
    required.forEach((k) => { if (!form[k]?.toString().trim()) errs[k] = "Required."; });
    return errs;
  }

  async function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await onSave(form, editingPlan?.id || null);
      onClose();
    } catch (err) {
      setErrors({ _global: err.code === "permission-denied"
        ? "Permission denied — check Firestore rules."
        : "Failed to save. Please try again." });
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-app-surface rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">

        <div className="px-7 py-5 border-b bg-app-bg flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-app-text">
              {isEdit ? "Edit lesson plan" : "New lesson plan"}
            </h3>
            <p className="text-xs text-app-text/50 mt-0.5">
              {isEdit ? "Update the details below." : "Fill in the details to create a new plan."}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-2xl transition-colors">
            <X className="w-5 h-5 text-app-text/50" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-7 py-6 space-y-5">

          {errors._global && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {errors._global}
            </div>
          )}

          {/* Teacher */}
          <Field label="Teacher" required>
            <div className="relative">
              <select value={form.teacherId} onChange={(e) => set("teacherId", e.target.value)}
                className={inputCls + " appearance-none pr-10"}>
                {staffList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.id === headTeacherId ? " (you)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40 pointer-events-none" />
            </div>
          </Field>

          {/* Class + Subject */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Class" required error={errors.className}>
              <div className="relative">
                <select value={form.className} onChange={(e) => set("className", e.target.value)}
                  className={inputCls + " appearance-none pr-10"}>
                  <option value="">Select class…</option>
                  {CLASS_NAMES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40 pointer-events-none" />
              </div>
            </Field>

            <Field label="Subject" required error={errors.subject}>
              <div className="relative">
                <select value={form.subject} onChange={(e) => set("subject", e.target.value)}
                  className={inputCls + " appearance-none pr-10"}
                  disabled={!subjectOptions.length}>
                  <option value="">Select subject…</option>
                  {subjectOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40 pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* Topic */}
          <Field label="Topic" required error={errors.topic}>
            <input type="text" value={form.topic} onChange={(e) => set("topic", e.target.value)}
              placeholder="e.g. Factorisation of Quadratic Expressions" className={inputCls} />
          </Field>

          {/* Objectives */}
          <Field label="Learning Objectives" required error={errors.objectives}>
            <textarea value={form.objectives} onChange={(e) => set("objectives", e.target.value)}
              rows={3} placeholder="By the end of the lesson, students will be able to…"
              className={inputCls + " resize-none leading-relaxed"} />
          </Field>

          {/* Date + Period */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" required error={errors.date}>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Period" required error={errors.period}>
              <div className="relative">
                <select value={form.period} onChange={(e) => set("period", e.target.value)}
                  className={inputCls + " appearance-none pr-10"}>
                  <option value="">Select period…</option>
                  {PERIODS.map((p) => <option key={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40 pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* Week + Term + Status */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Week" required error={errors.week}>
              <input type="number" min="1" max="16" value={form.week}
                onChange={(e) => set("week", e.target.value)} placeholder="e.g. 12" className={inputCls} />
            </Field>
            <Field label="Term" required error={errors.term}>
              <div className="relative">
                <select value={form.term} onChange={(e) => set("term", e.target.value)}
                  className={inputCls + " appearance-none pr-10"}>
                  {TERMS.map((t) => <option key={t}>{t}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40 pointer-events-none" />
              </div>
            </Field>
            <Field label="Status">
              <div className="relative">
                <select value={form.status} onChange={(e) => set("status", e.target.value)}
                  className={inputCls + " appearance-none pr-10"}>
                  <option value="planned">Planned</option>
                  <option value="in-progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40 pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* Resources */}
          <Field label="Resources">
            <input type="text" value={form.resources} onChange={(e) => set("resources", e.target.value)}
              placeholder="e.g. Textbook Chapter 8, Whiteboard markers" className={inputCls} />
          </Field>

          {/* Assessment */}
          <Field label="Assessment">
            <input type="text" value={form.assessment} onChange={(e) => set("assessment", e.target.value)}
              placeholder="e.g. Class exercise + Short quiz" className={inputCls} />
          </Field>
        </div>

        <div className="px-7 py-5 border-t bg-app-bg flex justify-between items-center flex-shrink-0">
          <button onClick={onClose}
            className="px-6 py-2.5 border border-app-border rounded-2xl hover:bg-app-surface transition-colors text-sm font-medium text-app-text/60">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-7 py-2.5 bg-app-primary text-white rounded-2xl hover:bg-[#1a3060] transition-colors text-sm font-semibold disabled:opacity-60">
            {saving ? <Spinner size={16} /> : <Plus className="w-4 h-4" />}
            {isEdit ? "Save changes" : "Create plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewLessonPlanModal({ plan, onClose, onEdit, onDelete, staffList, headTeacherId }) {
  if (!plan) return null;
  const teacher = staffList.find((t) => t.id === plan.teacherId);
  const isHT    = plan.teacherId === headTeacherId;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-app-surface rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b bg-app-bg flex justify-between items-center">
          <h3 className="text-xl font-bold text-app-text">Lesson plan details</h3>
          <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-2xl transition-colors">
            <X className="w-5 h-5 text-app-text/60" />
          </button>
        </div>

        <div className="p-8 space-y-7 overflow-y-auto max-h-[80vh]">
          {/* Teacher badge */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl w-fit ${isHT ? "bg-amber-50 border border-amber-200" : "bg-app-primary/5"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isHT ? "bg-gradient-to-br from-amber-400 to-amber-600" : "bg-app-primary"}`}>
              {initials(teacher?.name || "")}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-app-text">{teacher?.name || "Unknown"}</p>
                {isHT && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
              </div>
              <p className="text-xs text-app-text/50">{isHT ? "Head Teacher · " : ""}{plan.subject}</p>
            </div>
          </div>

          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-app-text/50 mb-1">Class &amp; subject</p>
              <p className="text-xl font-bold text-app-text">{plan.className} — {plan.subject}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-app-text/50 mb-1">Date</p>
              <p className="font-medium text-app-text">
                {plan.date ? new Date(plan.date).toLocaleDateString("en-GB") : "—"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-app-text/50 mb-1">Topic</p>
            <p className="text-2xl font-bold text-app-text">{plan.topic}</p>
          </div>

          <div>
            <p className="text-xs text-app-text/50 mb-2">Learning objectives</p>
            <div className="bg-app-bg px-6 py-5 rounded-2xl text-sm leading-relaxed text-app-text/80 border border-[#0F2044]/5">
              {plan.objectives}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div><p className="text-xs text-app-text/50 mb-1">Period</p><p className="font-medium text-app-text text-sm">{plan.period}</p></div>
            <div><p className="text-xs text-app-text/50 mb-1">Week / Term</p><p className="font-medium text-app-text text-sm">Week {plan.week} · {plan.term}</p></div>
            <div><p className="text-xs text-app-text/50 mb-1">Resources</p><p className="font-medium text-app-text text-sm">{plan.resources || "—"}</p></div>
            <div><p className="text-xs text-app-text/50 mb-1">Assessment</p><p className="font-medium text-app-text text-sm">{plan.assessment || "—"}</p></div>
          </div>

          <div>
            <p className="text-xs text-app-text/50 mb-1">Status</p>
            <span className={`inline-block px-4 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[plan.status]}`}>
              {STATUS_LABELS[plan.status]}
            </span>
          </div>

          <div className="pt-4 border-t flex justify-between items-center">
            <div className="flex gap-2">
              <button onClick={() => onEdit(plan)}
                className="px-6 py-2.5 border border-app-border rounded-2xl hover:bg-app-bg font-medium transition-colors text-sm text-app-text/70">
                Edit plan
              </button>
              <button onClick={() => onDelete(plan.id)}
                className="px-4 py-2.5 border border-red-200 text-red-500 rounded-2xl hover:bg-red-50 font-medium transition-colors text-sm flex items-center gap-1.5">
                <Trash2 size={14} /> Delete
              </button>
            </div>
            <button onClick={onClose}
              className="px-8 py-2.5 border border-app-border rounded-2xl hover:bg-app-bg font-medium transition-colors text-sm">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Row ─────────────────────────────────────────────────────────────────

function PlanRow({ plan, showTeacherName, onView, staffList, headTeacherId }) {
  const teacher = staffList.find((t) => t.id === plan.teacherId);
  const isHT    = plan.teacherId === headTeacherId;

  return (
    <div className="p-6 hover:bg-[#FAFAF8] transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="flex-shrink-0 flex items-center gap-3 lg:flex-col lg:items-center lg:w-20 lg:pt-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isHT ? "bg-gradient-to-br from-amber-400 to-amber-600" : "bg-app-primary"}`}>
            {initials(teacher?.name || "?")}
          </div>
          <p className="text-xs text-app-text/50 text-center leading-tight hidden lg:block">
            {teacher?.name?.split(" ").slice(-1)[0] || ""}
          </p>
          {showTeacherName && (
            <p className="text-xs text-app-text/60 font-medium lg:hidden">{teacher?.name}</p>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-app-bg border border-app-border rounded-xl text-xs font-medium text-app-text/70">
              {plan.className} · {plan.subject}
            </span>
            <span className={`px-3 py-1 text-xs font-medium rounded-xl ${STATUS_STYLES[plan.status]}`}>
              {STATUS_LABELS[plan.status]}
            </span>
            <span className="text-xs text-app-text/40 hidden lg:inline">Week {plan.week}</span>
          </div>
          <h3 className="font-bold text-lg text-app-text mb-1 leading-snug">{plan.topic}</h3>
          <p className="text-sm text-app-text/60 leading-relaxed line-clamp-2">{plan.objectives}</p>
          <div className="flex flex-wrap gap-5 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-app-text/50">
              <Calendar className="w-3.5 h-3.5" />
              {plan.date ? new Date(plan.date).toLocaleDateString("en-GB") : "—"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-app-text/50">
              <Clock className="w-3.5 h-3.5" />
              {plan.period}
            </span>
            {showTeacherName && (
              <span className="text-xs text-app-text/40 hidden lg:inline">{teacher?.name}</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-start">
          <button onClick={() => onView(plan)}
            className="flex items-center gap-2 px-5 py-2.5 border border-app-border rounded-2xl text-sm font-medium hover:bg-app-bg hover:border-[#0F2044]/30 transition-colors text-app-text/70">
            <Eye className="w-4 h-4" />
            View plan
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────

function PlanSection({ label, plans, isHeadTeacher, showTeacherName, onView, staffList, headTeacherId }) {
  if (!plans.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 px-5 py-3 rounded-2xl mb-4 ${isHeadTeacher ? "bg-gradient-to-r from-[#0F2044] to-[#1e3a6e] text-white" : "bg-app-surface border border-app-border text-app-text"}`}>
        {isHeadTeacher
          ? <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
          : <Users className="w-4 h-4 flex-shrink-0 opacity-50" />}
        <span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
        <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${isHeadTeacher ? "bg-app-surface/20 text-white" : "bg-app-primary/8 text-app-text"}`}>
          {plans.length} plan{plans.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
        <div className="divide-y divide-[#0F2044]/5">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              showTeacherName={showTeacherName}
              onView={onView}
              staffList={staffList}
              headTeacherId={headTeacherId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="bg-app-surface rounded-3xl border border-app-border py-20 text-center space-y-3">
      <BookOpen size={32} className="mx-auto text-app-text/20 mb-2" />
      <p className="text-app-text/40 text-sm">No lesson plans match your filters.</p>
      {onAdd && (
        <button onClick={onAdd}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-app-primary text-white rounded-2xl text-sm font-semibold hover:bg-[#1a3060] transition-colors">
          <Plus className="w-4 h-4" /> Create your first plan
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClassPlanningModule({ userId, schoolCode }) {
  const [plans,         setPlans]         = useState([]);
  const [staffList,     setStaffList]     = useState([]); // all teachers in the school
  const [headTeacher,   setHeadTeacher]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [staffLoading,  setStaffLoading]  = useState(true);
  const [toast,         setToast]         = useState(null);

  const [activeTab,       setActiveTab]       = useState("all");
  const [activePill,      setActivePill]      = useState("all");
  const [selectedStatus,  setSelectedStatus]  = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [searchTerm,      setSearchTerm]      = useState("");

  const [viewingPlan,    setViewingPlan]    = useState(null);
  const [showCreateModal,setShowCreateModal]= useState(false);
  const [editingPlan,    setEditingPlan]    = useState(null);

  const showToast = (message, type = "success") => setToast({ message, type });

  // ── Load current user (head teacher) profile ─────────────────────────────
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", userId));
        if (snap.exists()) {
          const d = snap.data();
          setHeadTeacher({
            id:       userId,
            name:     d.name || d.displayName || "Head Teacher",
            subjects: d.assignedSubjects || [],
          });
        }
      } catch (err) {
        console.error("Failed to load head teacher profile:", err);
      }
    })();
  }, [userId]);

  // ── Load all staff in same school ────────────────────────────────────────
  useEffect(() => {
    if (!schoolCode) return;
    (async () => {
      setStaffLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("schoolCode", "==", schoolCode))
        );
        const teachers = snap.docs.map((d) => ({
          id:       d.id,
          name:     d.data().name || d.data().displayName || "Unknown",
          subjects: d.data().assignedSubjects || [],
          role:     d.data().role,
        }));
        setStaffList(teachers);

        // Also update headTeacher name/subjects from fresh data
        const me = teachers.find((t) => t.id === userId);
        if (me) setHeadTeacher(me);
      } catch (err) {
        console.error("Failed to load staff:", err);
        showToast("Could not load staff list.", "error");
      } finally {
        setStaffLoading(false);
      }
    })();
  }, [schoolCode, userId]);

  // ── Load all lesson plans in the school ──────────────────────────────────
  const fetchPlans = useCallback(async () => {
    if (!schoolCode) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "lesson_plans"),
          where("schoolCode", "==", schoolCode)
        )
      );
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const dateA = a.date || "";
          const dateB = b.date || "";
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
        });
      setPlans(sorted);
    } catch (err) {
      console.error("fetchPlans error:", err);
      showToast(`Could not load lesson plans: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [schoolCode]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // ── Save (create or update) ───────────────────────────────────────────────
  async function handleSave(formData, existingId) {
    const payload = {
      ...formData,
      schoolCode,
      updatedAt: serverTimestamp(),
    };

    if (existingId) {
      await updateDoc(doc(db, "lesson_plans", existingId), payload);
      setPlans((prev) =>
        prev
          .map((p) => (p.id === existingId ? { ...p, ...payload } : p))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      );
      showToast("Lesson plan updated.");
    } else {
      payload.teacherId = formData.teacherId;
      payload.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "lesson_plans"), payload);
      setPlans((prev) => [{ id: ref.id, ...payload }, ...prev]);
      showToast("Lesson plan created.");
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    if (!window.confirm("Delete this lesson plan?")) return;
    try {
      await deleteDoc(doc(db, "lesson_plans", id));
      setPlans((prev) => prev.filter((p) => p.id !== id));
      setViewingPlan(null);
      showToast("Lesson plan deleted.");
    } catch {
      showToast("Failed to delete.", "error");
    }
  }

  function handleEdit(plan) {
    setViewingPlan(null);
    setEditingPlan(plan);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const myPlans    = plans.filter((p) => p.teacherId === userId);
  const staffPlans = plans.filter((p) => p.teacherId !== userId);
  const plansInScope =
    activeTab === "mine"  ? myPlans    :
    activeTab === "staff" ? staffPlans :
    plans;

  const allSubjects = [...new Set(plans.map((p) => p.subject))].filter(Boolean).sort();

  // Staff teachers (everyone except the head teacher themselves)
  const staffOnly = staffList.filter((t) => t.id !== userId);

  function applyFilters(source) {
    const q = searchTerm.toLowerCase();
    return source.filter((plan) => {
      const teacher = staffList.find((t) => t.id === plan.teacherId);
      const matchSearch  = !q || plan.topic?.toLowerCase().includes(q) || plan.className?.toLowerCase().includes(q) || plan.subject?.toLowerCase().includes(q) || teacher?.name?.toLowerCase().includes(q);
      const matchPill    = activePill === "all" || plan.teacherId === activePill;
      const matchStatus  = selectedStatus  === "all" || plan.status  === selectedStatus;
      const matchSubject = selectedSubject === "all" || plan.subject === selectedSubject;
      return matchSearch && matchPill && matchStatus && matchSubject;
    });
  }

  const filteredInScope = applyFilters(plansInScope);
  const filteredMine    = filteredInScope.filter((p) => p.teacherId === userId);
  const filteredStaff   = filteredInScope.filter((p) => p.teacherId !== userId);

  const stats = [
    { label: "Total plans", value: plansInScope.length,                                          color: "text-app-text"   },
    { label: "Completed",   value: plansInScope.filter((p) => p.status === "completed").length,   color: "text-emerald-600" },
    { label: "In progress", value: plansInScope.filter((p) => p.status === "in-progress").length, color: "text-blue-600"    },
    { label: "Planned",     value: plansInScope.filter((p) => p.status === "planned").length,     color: "text-amber-600"   },
  ];

  const tabs = [
    { id: "all",   label: "All Plans",   count: plans.length    },
    { id: "mine",  label: "My Plans",    count: myPlans.length  },
    { id: "staff", label: "Staff Plans", count: staffPlans.length },
  ];

  const pillTeachers = activeTab === "staff"
    ? staffOnly
    : activeTab === "mine"
    ? (headTeacher ? [headTeacher] : [])
    : staffList;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-app-text">Lesson Plans</h2>
          <p className="text-app-text/60 mt-1">
            {headTeacher?.name || "Head Teacher"} · {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPlans}
            className="p-2.5 bg-app-surface border border-app-border rounded-xl hover:bg-app-bg transition-colors text-app-text/60"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button className="flex items-center gap-2 px-5 py-3 border border-app-border rounded-2xl hover:bg-app-bg transition-colors text-sm font-medium text-app-text">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={staffLoading}
            className="flex items-center gap-2 px-6 py-3 bg-app-primary text-white rounded-2xl hover:bg-[#1a3060] transition-colors text-sm font-semibold shadow-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New plan
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-app-surface border border-app-border rounded-2xl p-1.5 w-fit">
        {tabs.map((tab) => (
          <button key={tab.id}
            onClick={() => { setActiveTab(tab.id); setActivePill("all"); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? "bg-app-primary text-white shadow-sm" : "text-app-text/55 hover:text-app-text hover:bg-app-bg"}`}>
            {tab.id === "mine"  && <Star  className="w-3.5 h-3.5" />}
            {tab.id === "staff" && <Users className="w-3.5 h-3.5" />}
            {tab.label}
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === tab.id ? "bg-app-surface/20 text-white" : "bg-app-primary/8 text-app-text"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="bg-app-surface rounded-3xl p-6 border border-app-border">
            <p className="text-sm text-app-text/60">{label}</p>
            <p className={`text-4xl font-bold mt-2 ${color}`}>
              {loading ? <Spinner /> : value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-app-surface rounded-3xl p-6 border border-app-border">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 relative min-w-[220px]">
            <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text/40" />
            <input type="text" placeholder="Search topic, class, subject or teacher…"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-app-bg border border-app-border rounded-2xl focus:outline-none focus:border-[#0F2044]/30 text-sm" />
          </div>
          <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-5 py-3.5 bg-app-surface border border-app-border rounded-2xl focus:outline-none text-sm min-w-[150px]">
            <option value="all">All subjects</option>
            {allSubjects.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-5 py-3.5 bg-app-surface border border-app-border rounded-2xl focus:outline-none text-sm min-w-[140px]">
            <option value="all">All statuses</option>
            <option value="planned">Planned</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Teacher pills — only show when there are multiple teachers to filter by */}
      {activeTab !== "mine" && pillTeachers.length > 1 && (
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setActivePill("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-medium transition-colors ${activePill === "all" ? "bg-app-primary text-white border-[#0F2044]" : "border-app-border text-app-text/70 hover:border-[#0F2044]/30 hover:bg-app-bg"}`}>
            <Users className="w-4 h-4" /> All staff
          </button>
          {pillTeachers.map((t) => {
            const count  = plansInScope.filter((p) => p.teacherId === t.id).length;
            const active = activePill === t.id;
            const isHT   = t.id === userId;
            return (
              <button key={t.id} onClick={() => setActivePill(active ? "all" : t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-medium transition-colors ${active ? "bg-app-primary text-white border-[#0F2044]" : "border-app-border text-app-text/70 hover:border-[#0F2044]/30 hover:bg-app-bg"}`}>
                {isHT && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
                <span>{t.name.split(" ").slice(-1)[0]}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-app-surface/20" : "bg-app-primary/8"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-sm text-app-text/50">
        Showing {filteredInScope.length} of {plansInScope.length} plans
      </p>

      {/* Content */}
      {loading ? (
        <div className="bg-app-surface rounded-3xl border border-app-border py-24 flex flex-col items-center gap-3 text-app-text/40">
          <Spinner size={32} />
          <p className="text-sm">Loading lesson plans…</p>
        </div>
      ) : activeTab === "all" ? (
        <div className="space-y-8">
          {filteredMine.length === 0 && filteredStaff.length === 0
            ? <EmptyState />
            : <>
                <PlanSection
                  label={`${headTeacher?.name || "Head Teacher"} — Head Teacher's Plans`}
                  plans={filteredMine} isHeadTeacher showTeacherName={false}
                  onView={setViewingPlan} staffList={staffList} headTeacherId={userId}
                />
                <PlanSection
                  label="Teaching Staff Plans"
                  plans={filteredStaff} isHeadTeacher={false} showTeacherName
                  onView={setViewingPlan} staffList={staffList} headTeacherId={userId}
                />
              </>
          }
        </div>
      ) : activeTab === "mine" ? (
        <div className="space-y-8">
          {filteredInScope.length === 0
            ? <EmptyState onAdd={() => setShowCreateModal(true)} />
            : <PlanSection
                label="Your Lesson Plans"
                plans={filteredInScope} isHeadTeacher showTeacherName={false}
                onView={setViewingPlan} staffList={staffList} headTeacherId={userId}
              />
          }
        </div>
      ) : (
        <div className="space-y-8">
          {filteredInScope.length === 0
            ? <EmptyState />
            : <PlanSection
                label="Teaching Staff Plans"
                plans={filteredInScope} isHeadTeacher={false} showTeacherName
                onView={setViewingPlan} staffList={staffList} headTeacherId={userId}
              />
          }
        </div>
      )}

      <p className="text-center text-xs text-app-text/40 pt-2">
        Lesson plans are submitted by teaching staff and reviewed by the head teacher.
        Completed plans are automatically included in term reports.
      </p>

      {/* Modals */}
      <ViewLessonPlanModal
        plan={viewingPlan}
        onClose={() => setViewingPlan(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        staffList={staffList}
        headTeacherId={userId}
      />

      {(showCreateModal || editingPlan) && (
        <CreatePlanModal
          editingPlan={editingPlan}
          headTeacherId={userId}
          staffList={staffList}
          onClose={() => { setShowCreateModal(false); setEditingPlan(null); }}
          onSave={handleSave}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}