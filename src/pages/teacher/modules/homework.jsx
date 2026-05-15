import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, getDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Plus, Clock, Calendar, Eye, Edit2, Trash2,
  CheckCircle, AlertCircle,
  BookOpen, FileText, X, Save, Search, RefreshCw,
  Loader2, ChevronDown, Users,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 864e5);
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

// ─── Homework Card ────────────────────────────────────────────────────────────

function HomeworkCard({ hw, onView, onEdit, onDelete }) {
  const days = daysUntil(hw.dueDate);
  const overdue = days !== null && days < 0;
  const urgent  = days !== null && days >= 0 && days <= 2;
  const submissionRate = hw.totalStudents > 0
    ? Math.round(((hw.submitted || 0) / hw.totalStudents) * 100)
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden hover:border-[#0F2044]/20 transition-all group">
      <div className="px-6 py-4 bg-[#F7F5F0] border-b border-[#0F2044]/8 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xs px-2.5 py-0.5 bg-white border border-[#0F2044]/10 rounded-lg text-[#0F2044]/70 font-medium flex items-center gap-1">
              <BookOpen size={10} /> {hw.className} · {hw.subject}
            </span>
            {overdue && (
              <span className="text-xs px-2.5 py-0.5 bg-red-100 text-red-700 rounded-lg font-semibold">Overdue</span>
            )}
            {urgent && !overdue && (
              <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-lg font-semibold">Due soon</span>
            )}
          </div>
          <h3 className="font-semibold text-[#0F2044] truncate">{hw.title}</h3>
          {hw.description && (
            <p className="text-xs text-[#0F2044]/55 mt-0.5 line-clamp-1">{hw.description}</p>
          )}
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-[#0F2044]/40 mb-0.5">DUE</p>
            <p className={`text-sm font-semibold flex items-center gap-1 ${overdue ? "text-red-600" : urgent ? "text-amber-600" : "text-[#0F2044]"}`}>
              <Calendar size={13} /> {fmt(hw.dueDate)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widests text-[#0F2044]/40 mb-0.5">SUBMITTED</p>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[#0F2044]">{hw.submitted || 0}/{hw.totalStudents || 0}</span>
              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg font-medium">{submissionRate}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-[#0F2044]/50">
          <span className="flex items-center gap-1">
            <Clock size={11} /> Assigned {fmt(hw.dateAssigned)}
          </span>
          {(hw.totalStudents - (hw.submitted || 0)) > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertCircle size={11} /> {hw.totalStudents - (hw.submitted || 0)} unsubmitted
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onView(hw)}
            className="flex items-center gap-1 text-xs bg-[#0F2044]/5 hover:bg-[#0F2044]/10 text-[#0F2044]/70 px-3 py-1.5 rounded-xl transition-colors"
          >
            <Eye size={13} /> View
          </button>
          <button
            onClick={() => onEdit(hw)}
            className="flex items-center gap-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl transition-colors"
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            onClick={() => onDelete(hw.id)}
            className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-xl transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form Modal (New / Edit) ──────────────────────────────────────────────────

function HomeworkFormModal({ hw, myClasses, mySubjects, schoolCode, schoolClassesMap, onSave, onClose }) {
  const isEdit = Boolean(hw);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Student count lookup state
  const [studentCount,        setStudentCount]        = useState(hw?.totalStudents ?? null);
  const [studentCountLoading, setStudentCountLoading] = useState(false);

  const [form, setForm] = useState({
    className:   hw?.className   || myClasses[0]  || "",
    subject:     hw?.subject     || mySubjects[0] || "",
    title:       hw?.title       || "",
    description: hw?.description || "",
    dueDate:     hw?.dueDate     || "",
    submitted:   hw?.submitted   || 0,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-fetch student count whenever class changes
  useEffect(() => {
    if (!form.className || !schoolCode) return;

    // Look up classId from the pre-resolved map passed in from the parent
    const classId = schoolClassesMap[form.className];
    if (!classId) {
      setStudentCount(0);
      return;
    }

    let cancelled = false;
    setStudentCountLoading(true);
    setStudentCount(null);

    getDocs(
      query(
        collection(db, "students"),
        where("schoolCode", "==", schoolCode),
        where("classId",    "==", classId)
      )
    )
      .then((snap) => {
        if (!cancelled) setStudentCount(snap.size);
      })
      .catch((err) => {
        console.error("student count fetch:", err);
        if (!cancelled) setStudentCount(0);
      })
      .finally(() => {
        if (!cancelled) setStudentCountLoading(false);
      });

    return () => { cancelled = true; };
  }, [form.className, schoolCode, schoolClassesMap]);

  const handleSave = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.dueDate)      { setError("Due date is required."); return; }
    if (!form.className)    { setError("Please select a class."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, totalStudents: studentCount ?? 0 });
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
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[94vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-[#0F2044] px-7 py-5 flex items-center justify-between shrink-0">
          <h3 className="text-white font-bold text-lg">
            {isEdit ? "Edit Homework" : "Assign New Homework"}
          </h3>
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
            {/* Class */}
            <div>
              <label className="text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5 block uppercase">Class</label>
              <div className="relative">
                <select
                  value={form.className}
                  onChange={(e) => set("className", e.target.value)}
                  className="appearance-none w-full pl-4 pr-9 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 bg-white text-[#0F2044]"
                >
                  {myClasses.length === 0 && <option value="">No classes assigned</option>}
                  {myClasses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5 block uppercase">Subject</label>
              <div className="relative">
                <select
                  value={form.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  className="appearance-none w-full pl-4 pr-9 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 bg-white text-[#0F2044]"
                >
                  {mySubjects.length === 0 && <option value="">No subjects assigned</option>}
                  {mySubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Auto-resolved student count display */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all
            ${studentCount === null && !studentCountLoading
              ? "bg-[#F7F5F0] border-[#0F2044]/10"
              : studentCount === 0
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200"}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
              ${studentCount === 0 ? "bg-amber-100" : "bg-emerald-100"}`}>
              {studentCountLoading
                ? <Spinner size={14} />
                : <Users size={14} className={studentCount === 0 ? "text-amber-600" : "text-emerald-600"} />}
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest text-[#0F2044]/50 uppercase">Students in class</p>
              {studentCountLoading ? (
                <p className="text-sm text-[#0F2044]/50">Counting students…</p>
              ) : studentCount === null ? (
                <p className="text-sm text-[#0F2044]/50">Select a class above</p>
              ) : studentCount === 0 ? (
                <p className="text-sm font-semibold text-amber-700">No students enrolled in {form.className}</p>
              ) : (
                <p className="text-sm font-semibold text-emerald-700">
                  {studentCount} student{studentCount !== 1 ? "s" : ""} enrolled
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-widests text-[#0F2044]/50 mb-1.5 block uppercase">Title *</label>
            <input
              type="text"
              placeholder="e.g. Quadratic Equations Exercise"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5 block uppercase">Description / Instructions</label>
            <textarea
              rows={3}
              placeholder="Detailed instructions, page numbers, requirements…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl text-sm resize-y focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5 block uppercase">Due Date *</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
              />
            </div>

            {/* Submitted count — only shown when editing */}
            {isEdit && (
              <div>
                <label className="text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5 block uppercase">Submitted Count</label>
                <input
                  type="number"
                  min={0}
                  max={studentCount ?? undefined}
                  value={form.submitted}
                  onChange={(e) => set("submitted", parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
                />
              </div>
            )}
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
            disabled={saving || studentCountLoading}
            className="flex-1 py-3 bg-[#0F2044] hover:bg-black disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all text-sm"
          >
            {saving ? <Spinner size={15} /> : <Save size={15} />}
            {isEdit ? "Update" : "Assign Homework"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewModal({ hw, onClose }) {
  const days = daysUntil(hw.dueDate);
  const overdue = days !== null && days < 0;
  const submissionRate = hw.totalStudents > 0
    ? Math.round(((hw.submitted || 0) / hw.totalStudents) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-[#0F2044] px-7 py-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs px-2.5 py-0.5 bg-white/15 text-white/80 rounded-lg font-medium">{hw.className}</span>
              <span className="text-xs px-2.5 py-0.5 bg-white/15 text-white/80 rounded-lg font-medium">{hw.subject}</span>
              {overdue && <span className="text-xs px-2.5 py-0.5 bg-red-400/30 text-red-200 rounded-lg font-semibold">Overdue</span>}
            </div>
            <h3 className="text-white font-bold text-lg leading-tight">{hw.title}</h3>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-7 space-y-5">
          <div className="p-4 bg-[#F7F5F0] rounded-2xl border border-[#0F2044]/8">
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] font-bold tracking-widest text-[#0F2044]/40 uppercase">Submission Progress</p>
              <span className="text-sm font-bold text-[#0F2044]">{submissionRate}%</span>
            </div>
            <div className="w-full bg-[#0F2044]/10 rounded-full h-2 mb-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${submissionRate}%` }} />
            </div>
            <p className="text-xs text-[#0F2044]/50">{hw.submitted || 0} of {hw.totalStudents || 0} submitted</p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[#0F2044]/5 rounded-2xl overflow-hidden text-sm">
            {[
              ["Assigned",  fmt(hw.dateAssigned)],
              ["Due Date",  fmt(hw.dueDate)],
              ["Class",     hw.className || "—"],
              ["Subject",   hw.subject   || "—"],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0F2044]/40 mb-0.5">{k}</p>
                <p className="font-medium text-[#0F2044]">{v}</p>
              </div>
            ))}
          </div>

          {hw.description && (
            <div className="p-4 bg-[#F7F5F0] rounded-2xl border border-[#0F2044]/8">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F2044]/40 mb-1.5">Instructions</p>
              <p className="text-sm text-[#0F2044]/70 leading-relaxed">{hw.description}</p>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="px-6 py-2.5 border border-[#0F2044]/15 rounded-xl hover:bg-[#F7F5F0] text-sm font-medium transition-colors text-[#0F2044]/70">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────────────────────

export default function HomeworkModule({ userId, schoolCode }) {
  const [homework,      setHomework]      = useState([]);
  const [myClasses,     setMyClasses]     = useState([]);
  const [mySubjects,    setMySubjects]    = useState([]);
  // Map of className → classId, built when loading assignments
  const [schoolClassesMap, setSchoolClassesMap] = useState({});

  const [assignLoading, setAssignLoading] = useState(true);
  const [hwLoading,     setHwLoading]     = useState(true);

  const [activeTab,     setActiveTab]     = useState("active");
  const [search,        setSearch]        = useState("");
  const [classFilter,   setClassFilter]   = useState("all");

  const [showNew,       setShowNew]       = useState(false);
  const [editHw,        setEditHw]        = useState(null);
  const [viewHw,        setViewHw]        = useState(null);
  const [toast,         setToast]         = useState(null);
  const [error,         setError]         = useState("");

  const isLoading    = assignLoading || hwLoading;
  const noAssignment = !assignLoading && myClasses.length === 0;

  const showToast = (message, type = "success") => setToast({ message, type });

  // ── Step 1: Load teacher's assigned classes & subjects, resolve classId map ─
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;
    (async () => {
      setAssignLoading(true);
      try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (!userSnap.exists()) return;
        const data = userSnap.data();
        const assignedNames    = data.assignedClasses  || [];
        const assignedSubjects = data.assignedSubjects || [];

        setMyClasses(assignedNames);
        setMySubjects(assignedSubjects);

        if (assignedNames.length > 0) {
          // Resolve class names → classIds (same pattern as StudentModule)
          const snap = await getDocs(
            query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
          );
          if (cancelled) return;
          const map = {};
          snap.docs.forEach(d => {
            const cls = d.data();
            if (assignedNames.includes(cls.name)) {
              map[cls.name] = d.id;
            }
          });
          setSchoolClassesMap(map);
        }
      } catch (err) {
        console.error("Failed to load assignments:", err);
        setError("Could not load your class assignments.");
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // ── Step 2: Fetch homework for this teacher ───────────────────────────────
  const fetchHomework = useCallback(async () => {
    if (!userId) return;
    setHwLoading(true);
    setError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "homework"),
          where("teacherId",  "==", userId),
          where("schoolCode", "==", schoolCode)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const tsA = a.createdAt?.toMillis?.() ?? 0;
          const tsB = b.createdAt?.toMillis?.() ?? 0;
          return tsB - tsA;
        });
      setHomework(list);
    } catch (err) {
      console.error("fetchHomework error:", err);
      setError(`Could not load homework: ${err.message}`);
    } finally {
      setHwLoading(false);
    }
  }, [userId, schoolCode]);

  useEffect(() => {
    if (!assignLoading) fetchHomework();
  }, [fetchHomework, assignLoading]);

  // ── Save (create / update) ────────────────────────────────────────────────
  const saveHomework = async (formData, existingId = null) => {
    const payload = {
      ...formData,
      teacherId:  userId,
      schoolCode,
      updatedAt:  serverTimestamp(),
    };
    if (existingId) {
      await updateDoc(doc(db, "homework", existingId), payload);
      setHomework((prev) =>
        prev.map((h) => (h.id === existingId ? { ...h, ...payload } : h))
      );
      showToast("Homework updated.");
    } else {
      payload.createdAt    = serverTimestamp();
      payload.dateAssigned = new Date().toISOString().slice(0, 10);
      payload.submitted    = 0;
      const ref = await addDoc(collection(db, "homework"), payload);
      setHomework((prev) => [{ id: ref.id, ...payload }, ...prev]);
      showToast("Homework assigned.");
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteHomework = async (id) => {
    if (!window.confirm("Delete this homework assignment?")) return;
    try {
      await deleteDoc(doc(db, "homework", id));
      setHomework((prev) => prev.filter((h) => h.id !== id));
      showToast("Homework deleted.");
    } catch {
      showToast("Failed to delete.", "error");
    }
  };

  // ── Derived lists ─────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const filtered = homework.filter((h) => {
    const matchSearch = !search ||
      h.title?.toLowerCase().includes(search.toLowerCase()) ||
      h.className?.toLowerCase().includes(search.toLowerCase()) ||
      h.subject?.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === "all" || h.className === classFilter;
    return matchSearch && matchClass;
  });

  const activeList  = filtered.filter((h) => h.dueDate >= today);
  const overdueList = filtered.filter((h) => h.dueDate <  today);
  const displayList = activeTab === "active" ? activeList : overdueList;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Homework &amp; Assignments
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            {assignLoading
              ? "Loading your assignments…"
              : noAssignment
              ? "No classes assigned yet"
              : `${myClasses.join(" · ")} · ${mySubjects.slice(0, 3).join(" · ")}${mySubjects.length > 3 ? " …" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHomework}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {!noAssignment && (
            <button
              onClick={() => setShowNew(true)}
              disabled={isLoading}
              className="flex items-center gap-2 bg-[#0F2044] hover:bg-black text-white px-5 py-2.5 rounded-2xl font-medium text-sm transition-all disabled:opacity-40"
            >
              <Plus size={15} /> Assign Homework
            </button>
          )}
        </div>
      </div>

      {noAssignment && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          No classes have been assigned to you yet. Ask your head teacher to assign classes from Staff Management.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Tabs + Filters ── */}
      {!noAssignment && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="bg-white rounded-2xl p-1 border border-[#0F2044]/8 inline-flex shrink-0">
            {[
              { id: "active",  label: "Active",  count: activeList.length  },
              { id: "overdue", label: "Overdue", count: overdueList.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2 text-sm font-medium rounded-xl transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? tab.id === "overdue" ? "bg-red-600 text-white" : "bg-[#0F2044] text-white"
                    : "text-[#0F2044]/60 hover:bg-[#FAFAF8]"
                }`}
              >
                {tab.label}
                <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab.id ? "bg-white/20" : "bg-[#0F2044]/8"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/35" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, class, or subject…"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#0F2044]/10 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/30 text-[#0F2044]"
            />
          </div>

          {myClasses.length > 1 && (
            <div className="relative shrink-0">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="appearance-none pl-4 pr-9 py-2.5 bg-white border border-[#0F2044]/15 rounded-xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] min-w-[140px]"
              >
                <option value="all">All classes</option>
                {myClasses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
            </div>
          )}
        </div>
      )}

      {/* ── List ── */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-24 flex flex-col items-center gap-3 text-[#0F2044]/40">
            <Spinner size={28} />
            <p className="text-sm">Loading homework…</p>
          </div>
        ) : displayList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 py-24 flex flex-col items-center gap-3 text-[#0F2044]/30">
            <FileText size={36} />
            <p className="text-sm font-medium text-[#0F2044]/40">
              {homework.length === 0
                ? "No homework assigned yet. Create your first one."
                : activeTab === "overdue"
                ? "No overdue homework — great work!"
                : "No homework matches your filter."}
            </p>
          </div>
        ) : (
          displayList.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              onView={setViewHw}
              onEdit={setEditHw}
              onDelete={deleteHomework}
            />
          ))
        )}
      </div>

      <p className="text-center text-xs text-[#0F2044]/40 pt-1">
        Homework is scoped to your assigned classes and subjects only.
      </p>

      {/* ── Modals ── */}
      {showNew && (
        <HomeworkFormModal
          myClasses={myClasses}
          mySubjects={mySubjects}
          schoolCode={schoolCode}
          schoolClassesMap={schoolClassesMap}
          onSave={(data) => saveHomework(data)}
          onClose={() => setShowNew(false)}
        />
      )}
      {editHw && (
        <HomeworkFormModal
          hw={editHw}
          myClasses={myClasses}
          mySubjects={mySubjects}
          schoolCode={schoolCode}
          schoolClassesMap={schoolClassesMap}
          onSave={(data) => saveHomework(data, editHw.id)}
          onClose={() => setEditHw(null)}
        />
      )}
      {viewHw && (
        <ViewModal hw={viewHw} onClose={() => setViewHw(null)} />
      )}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}