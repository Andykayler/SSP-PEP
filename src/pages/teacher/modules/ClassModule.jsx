import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import { fetchMyAssignments } from "../../../services/staffAssignments";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from "firebase/firestore";
import {
  Plus, Calendar, Clock, BookOpen, Edit2, Eye, Trash2,
  X, Save, RefreshCw, AlertCircle, CheckCircle, Loader2, Search, Sparkles,
} from "lucide-react";
import { draftLessonPlan } from "../../../services/aiLessonPlan";

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

// ─── status config — colors are pulled straight from the CSS custom
// properties so this stays in sync with theme / light-dark switching ────────
const STATUS = {
  planned: {
    label: "Planned",
    pill: { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" },
    icon: { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" },
  },
  "in-progress": {
    label: "In progress",
    pill: { background: "var(--primary-pale)", color: "var(--primary-light)", border: "1px solid var(--border-color)" },
    icon: { background: "var(--primary-pale)", color: "var(--primary-light)", border: "1px solid var(--border-color)" },
  },
  completed: {
    label: "Completed",
    pill: { background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" },
    icon: { background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" },
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

// ─── shared inline style helpers (no dedicated class exists for these in
// admin_dashboard.css, so they're built from the same CSS custom properties) ─
const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, padding: 0, background: "var(--surface)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
  color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
  transition: "all var(--transition-base)",
};

function primaryBtnStyle(disabled) {
  return {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 20px", borderRadius: "var(--radius-md)",
    background: disabled ? "var(--border-color)" : "var(--primary)",
    color: disabled ? "var(--text-muted)" : "#fff",
    border: "none", fontSize: 13, fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all var(--transition-base)",
    opacity: disabled ? 0.6 : 1,
    fontFamily: "var(--font-body)",
  };
}

const ghostBtnStyle = {
  flex: 1, padding: "12px 0", borderRadius: "var(--radius-md)",
  background: "var(--surface)", border: "1px solid var(--border-color)",
  color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
  cursor: "pointer", transition: "all var(--transition-base)",
};

const saveBtnStyle = (disabled) => ({
  flex: 1, padding: "12px 0", borderRadius: "var(--radius-md)",
  background: disabled ? "var(--border-color)" : "linear-gradient(135deg, var(--warning), var(--warning-light))",
  color: disabled ? "var(--text-muted)" : "#1a0f00",
  border: "none", fontWeight: 600, fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all var(--transition-base)",
});

const inputStyle = {
  width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-color)", background: "var(--input-bg)",
  color: "var(--text-primary)", fontSize: 13, outline: "none",
  fontFamily: "var(--font-body)", boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1px",
  color: "var(--text-muted)", textTransform: "uppercase",
  marginBottom: 6, display: "block", fontWeight: 600,
};

function Spinner({ size = 16 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite", color: "currentColor" }} />;
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  const ok = type === "success";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 200,
      display: "flex", alignItems: "center", gap: 10,
      padding: "13px 20px", borderRadius: "var(--radius-md)",
      background: ok ? "var(--success)" : "#ef4444",
      color: "#fff", fontSize: 13, fontWeight: 500,
      boxShadow: "var(--shadow-lg)",
    }}>
      {ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
}

// ─── period tile (replaces the old Tailwind PeriodBlock) ─────────────────────
function PeriodTile({ periodNumber, statusKey }) {
  const period = getPeriod(periodNumber);
  const cfg = STATUS[statusKey] || STATUS.planned;
  return (
    <div style={{
      width: 56, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", borderRadius: "var(--radius-md)",
      background: cfg.pill.background, border: cfg.pill.border,
      padding: "10px 4px", minHeight: 62, flexShrink: 0,
    }}>
      {period ? (
        <>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: cfg.pill.color, letterSpacing: "0.5px" }}>
            {period.label}
          </span>
          <span style={{ fontSize: 10, marginTop: 3, color: cfg.pill.color, opacity: 0.85 }}>{period.start}</span>
          <span style={{ fontSize: 9, color: cfg.pill.color, opacity: 0.55 }}>{period.end}</span>
        </>
      ) : (
        <>
          <Clock size={13} style={{ color: cfg.pill.color, opacity: 0.6 }} />
          <span style={{ fontSize: 10, marginTop: 4, color: cfg.pill.color, opacity: 0.6, fontWeight: 500 }}>—</span>
        </>
      )}
    </div>
  );
}

// ─── head-teacher review state ───────────────────────────────────────────────
function ReviewPill({ plan }) {
  const s = plan.reviewStatus || "pending";
  const map = {
    pending: { label: "Awaiting review", pill: { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border-color)" } },
    approved: { label: "Approved", pill: { background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" } },
    changes: { label: "Changes requested", pill: { background: "var(--danger-pale)", color: "var(--danger-light)", border: "1px solid rgba(239,68,68,0.2)" } },
  };
  const cfg = map[s] || map.pending;
  return <span className="status-pill" style={cfg.pill}>{cfg.label}</span>;
}

// ─── plan row (cc-row pattern, same one used for "Today's Schedule" on the
// Overview dashboard) ──────────────────────────────────────────────────────
function PlanRow({ plan, onView, onEdit, onDelete }) {
  const cfg = STATUS[plan.status] || STATUS.planned;
  const period = getPeriod(plan.periodNumber);

  return (
    <div className="cc-row" style={{ alignItems: "flex-start" }}>
      <PeriodTile periodNumber={plan.periodNumber} statusKey={plan.status} />

      <div className="cc-row__info">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="badge badge--blue">{plan.className}</span>
          <span className="badge badge--teal">{plan.subject}</span>
          <span className="status-pill" style={cfg.pill}>
            <span className="status-pill__dot" />
            {cfg.label}
          </span>
          <ReviewPill plan={plan} />
        </div>

        <div className="cc-row__name" style={{ fontSize: 14, whiteSpace: "normal", fontFamily: "var(--font-display)", letterSpacing: "0.3px" }}>
          {plan.topic}
        </div>

        {plan.objectives && (
          <p className="cc-row__meta" style={{ whiteSpace: "normal", marginTop: 4, lineHeight: 1.55, maxWidth: 560 }}>
            {plan.objectives}
          </p>
        )}

        {plan.reviewStatus === "changes" && (
          <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--danger-pale)", color: "var(--danger-light)", fontSize: 12.5, maxWidth: 560 }}>
            <strong>{plan.reviewedByName || "Your head teacher"} asked for changes:</strong> {plan.review}
            <div style={{ opacity: 0.85, marginTop: 2 }}>Edit the plan and save it to send it back for review.</div>
          </div>
        )}
        {plan.reviewStatus === "approved" && plan.review && (
          <p className="cc-row__meta" style={{ whiteSpace: "normal", marginTop: 6, color: "var(--success-light)" }}>
            {plan.reviewedByName || "Head teacher"}: {plan.review}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
          <span className="cc-row__meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} /> {dayLabel(plan.date)}, {fmt(plan.date)}
          </span>
          {period && (
            <span className="cc-row__meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} /> {period.start} – {period.end}
            </span>
          )}
          {plan.week && (
            <span className="cc-row__meta">Wk {plan.week} · {plan.term}</span>
          )}
          {plan.assessment && (
            <span className="cc-row__meta" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {plan.assessment}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start", marginTop: 2 }}>
        <button onClick={() => onView(plan)} style={iconBtnStyle} title="View">
          <Eye size={14} />
        </button>
        <button onClick={() => onEdit(plan)} style={iconBtnStyle} title="Edit">
          <Edit2 size={14} />
        </button>
        <button onClick={() => onDelete(plan.id)} style={{ ...iconBtnStyle, color: "#ef4444" }} title="Delete">
          <Trash2 size={14} />
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
    if (!userId || !schoolCode) return;
    (async () => {
      setAssignLoading(true);
      try {
        // Only classes and subjects the school still has registered.
        const mine = await fetchMyAssignments(userId, schoolCode);
        setMyClasses(mine.classNames);
        setMySubjects(mine.subjects);
      } catch (err) {
        console.error(err);
        showToast("Could not load your class assignments.", "error");
      } finally {
        setAssignLoading(false);
      }
    })();
  }, [userId, schoolCode]);

  // ── removed orderBy("date") to avoid requiring a composite index.
  // Plans are sorted client-side instead.
  const fetchPlans = async () => {
    if (!userId || !schoolCode) return;
    setLoading(true);
    try {
      // Scoped to this school too: plans written at a previous school stay there.
      const snap = await getDocs(
        query(
          collection(db, "lesson_plans"),
          where("teacherId", "==", userId),
          where("schoolCode", "==", schoolCode)
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

  useEffect(() => { fetchPlans(); }, [userId, schoolCode]);

  const savePlan = async (formData, existingId = null) => {
    const payload = { ...formData, teacherId: userId, schoolCode, updatedAt: serverTimestamp() };
    // A plan the head teacher asked changes on goes back into the review queue
    // when the teacher saves it again. Other edits (marking it completed, say)
    // do not reopen a review that already happened.
    const before = existingId ? plans.find((p) => p.id === existingId) : null;
    if (before?.reviewStatus === "changes") payload.reviewStatus = "pending";
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
      payload.reviewStatus = "pending";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="module-title">Lesson Plans</h2>
          <p className="module-sub">
            {assignLoading
              ? "Loading your assignments…"
              : myClasses.length > 0
              ? `${myClasses.join(" · ")}  ·  ${mySubjects.slice(0, 3).join(" · ")}${mySubjects.length > 3 ? " …" : ""}`
              : "No classes assigned yet"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={fetchPlans} style={iconBtnStyle} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowNew(true)}
            disabled={noAssignments}
            style={primaryBtnStyle(noAssignments)}
          >
            <Plus size={16} /> New plan
          </button>
        </div>
      </div>

      {noAssignments && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          No classes assigned. Your head teacher must assign classes from the Staff Management page first.
        </div>
      )}

      {/* Status overview */}
      <div>
        <div className="sec-eyebrow">Plan status</div>
        <div className="stat-strip">
          {[
            { label: "Total plans",  value: counts.all,           icon: <BookOpen width={16} height={16} />,  variant: "" },
            { label: "Planned",      value: counts.planned,       icon: <Clock width={16} height={16} />,     variant: "gold" },
            { label: "In progress",  value: counts["in-progress"],icon: <RefreshCw width={16} height={16} />, variant: "" },
            { label: "Completed",    value: counts.completed,     icon: <CheckCircle width={16} height={16} />, variant: "teal" },
          ].map((s, i) => (
            <div key={s.label} className="stat-card">
              <div className="stat-card__top">
                <div className={`stat-card__icon${s.variant ? ` stat-card__icon--${s.variant}` : ""}`}>
                  {s.icon}
                </div>
                <span className="stat-card__label">{s.label}</span>
              </div>
              <div className="stat-card__value">{s.value}</div>
              <div className="stat-card__bar">
                <div
                  className={`stat-card__bar-fill${s.variant ? ` stat-card__bar-fill--${s.variant}` : ""}`}
                  style={{ width: `${counts.all ? Math.round((s.value / Math.max(counts.all, 1)) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="search-wrap" style={{ flex: 1 }}>
          <Search size={14} className="search-wrap__icon" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics, classes, subjects…"
            className="search-wrap__input"
          />
        </div>
        <div className="filter-pills">
          {[
            { id: "all",         label: "All" },
            { id: "planned",     label: "Planned" },
            { id: "in-progress", label: "In progress" },
            { id: "completed",   label: "Completed" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`filter-pill ${statusFilter === f.id ? "filter-pill--active" : "filter-pill--inactive"}`}
            >
              {f.label}
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Plans list */}
      <div className="cc">
        <div className="cc__head">
          <div className="cc__head-left">
            <BookOpen width={18} height={18} />
            <h3>Lesson Plans</h3>
          </div>
        </div>
        <div className="cc__body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: "56px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <p className="module-sub">Loading lesson plans…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon"><BookOpen size={22} /></div>
              <div className="empty-state__title">
                {plans.length === 0 ? "No lesson plans yet" : "No plans match your filter"}
              </div>
              <p className="empty-state__sub">
                {plans.length === 0
                  ? "Create your first lesson plan to start tracking curriculum coverage."
                  : "Try a different search term or status filter."}
              </p>
            </div>
          ) : (
            filtered.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                onView={setViewPlan}
                onEdit={setEditPlan}
                onDelete={deletePlan}
              />
            ))
          )}
        </div>
      </div>

      <p className="module-sub" style={{ textAlign: "center" }}>
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

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(null);

  // Drafts objectives/resources/assessment from just class+subject+topic —
  // see api/ai-lesson-plan.js. Fills blanks only, so a teacher who already
  // typed something here (or is editing a saved plan) never has it overwritten.
  const handleGenerate = async () => {
    setAiError(null);
    setAiLoading(true);
    const { plan, error } = await draftLessonPlan({
      className: form.className,
      subject: form.subject,
      topic: form.topic,
      week: form.week,
      term: form.term,
    });
    setAiLoading(false);
    if (!plan) {
      setAiError(error || "Could not draft a plan.");
      return;
    }
    setForm((f) => ({
      ...f,
      objectives: f.objectives || plan.objectives,
      resources:  f.resources  || plan.resources,
      assessment: f.assessment || plan.assessment,
      // This form has no separate "activities" field — the lesson flow the AI
      // drafts fits naturally into Notes rather than being dropped.
      notes: f.notes || plan.activities,
    }));
  };

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
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: "var(--card-bg)", borderRadius: "var(--radius-xl)",
        width: "100%", maxWidth: 640, maxHeight: "94vh", overflow: "hidden",
        boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column",
        border: "1px solid var(--border-strong)",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--hero-bg)", padding: "20px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--border-strong)", flexShrink: 0,
        }}>
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "0.5px" }}>
              {isEdit ? "Edit lesson plan" : "New lesson plan"}
            </h3>
            {isEdit && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {plan.topic}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ ...iconBtnStyle, background: "transparent", border: "none", color: "var(--text-muted)" }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          {error && (
            <div className="alert alert--error">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Class</label>
              <select value={form.className} onChange={(e) => set("className", e.target.value)} style={inputStyle}>
                {myClasses.length === 0 && <option value="">No classes assigned</option>}
                {myClasses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Subject</label>
              <select value={form.subject} onChange={(e) => set("subject", e.target.value)} style={inputStyle}>
                {mySubjects.length === 0 && <option value="">No subjects assigned</option>}
                {mySubjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Topic / Chapter *</label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                placeholder="e.g. Factorisation of quadratic expressions"
                value={form.topic}
                onChange={(e) => set("topic", e.target.value)}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={aiLoading || !form.topic.trim() || !form.subject}
                title="Draft objectives, resources and assessment from the topic"
                style={{
                  ...ghostBtnStyle, flex: "0 0 auto", padding: "0 16px",
                  display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  opacity: (aiLoading || !form.topic.trim() || !form.subject) ? 0.5 : 1,
                  cursor: (aiLoading || !form.topic.trim() || !form.subject) ? "not-allowed" : "pointer",
                }}
              >
                {aiLoading ? <Spinner size={14} /> : <Sparkles size={14} />}
                {aiLoading ? "Drafting…" : "Generate with AI"}
              </button>
            </div>
            {aiError && (
              <p style={{ fontSize: 11, color: "var(--danger-light)", marginTop: 6 }}>{aiError}</p>
            )}
            {!aiError && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Drafts objectives, resources and assessment for a Malawian classroom (MANEB syllabus,
                chalkboard-and-textbook resources). Review and edit before saving.
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Learning objectives *</label>
            <textarea
              rows={3}
              placeholder="By the end of the lesson, students should be able to…"
              value={form.objectives}
              onChange={(e) => set("objectives", e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Period</label>
              <select value={form.periodNumber} onChange={(e) => set("periodNumber", Number(e.target.value))} style={inputStyle}>
                {PERIODS.map((p) => (
                  <option key={p.number} value={p.number}>
                    Period {p.number}  ({p.start} – {p.end})
                  </option>
                ))}
              </select>
              {selectedPeriod && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {selectedPeriod.start} – {selectedPeriod.end}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Week</label>
              <input
                type="number" min={1} max={16} placeholder="e.g. 12"
                value={form.week} onChange={(e) => set("week", e.target.value)} style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Term</label>
              <select value={form.term} onChange={(e) => set("term", e.target.value)} style={inputStyle}>
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Resources</label>
              <input
                type="text" placeholder="Textbook, graph boards…"
                value={form.resources} onChange={(e) => set("resources", e.target.value)} style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Assessment</label>
              <input
                type="text" placeholder="Class exercise + Homework"
                value={form.assessment} onChange={(e) => set("assessment", e.target.value)} style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              rows={2} placeholder="Any extra notes…"
              value={form.notes} onChange={(e) => set("notes", e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(STATUS).map(([key, s]) => {
                const active = form.status === key;
                return (
                  <label
                    key={key}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "9px 16px", borderRadius: "var(--radius-md)",
                      cursor: "pointer", fontSize: 13, fontWeight: 500,
                      transition: "all var(--transition-base)",
                      background: active ? s.pill.background : "var(--surface)",
                      color: active ? s.pill.color : "var(--text-secondary)",
                      border: active ? s.pill.border : "1px solid var(--border-color)",
                    }}
                  >
                    <input type="radio" name="status" checked={active} onChange={() => set("status", key)} style={{ display: "none" }} />
                    <span className="status-pill__dot" style={{ background: active ? "currentColor" : "var(--text-muted)" }} />
                    {s.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "18px 28px", borderTop: "1px solid var(--border-color)", display: "flex", gap: 12, flexShrink: 0 }}>
          <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={saveBtnStyle(saving)}>
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
  const cfg = STATUS[plan.status] || STATUS.planned;
  const period = getPeriod(plan.periodNumber);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: "var(--card-bg)", borderRadius: "var(--radius-xl)",
        width: "100%", maxWidth: 560, overflow: "hidden",
        boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-strong)",
      }}>
        {/* Header */}
        <div style={{ background: "var(--hero-bg)", padding: "20px 28px", borderBottom: "1px solid var(--border-strong)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span className="badge badge--blue">{plan.className}</span>
              <span className="badge badge--teal">{plan.subject}</span>
              <span className="status-pill" style={cfg.pill}>
                <span className="status-pill__dot" />
                {cfg.label}
              </span>
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--text-primary)", lineHeight: 1.3 }}>
              {plan.topic}
            </h3>
          </div>
          <button onClick={onClose} style={{ ...iconBtnStyle, background: "transparent", border: "none", color: "var(--text-muted)", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Date / period strip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16, padding: 16,
            borderRadius: "var(--radius-md)", background: cfg.pill.background, border: cfg.pill.border,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 48, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.pill.color, fontFamily: "var(--font-mono)" }}>
                {period?.label || "—"}
              </span>
              {period && <span style={{ fontSize: 10, marginTop: 2, color: cfg.pill.color, opacity: 0.75 }}>{period.start}</span>}
              {period && <span style={{ fontSize: 10, color: cfg.pill.color, opacity: 0.55 }}>{period.end}</span>}
            </div>
            <div style={{ width: 1, height: 32, background: cfg.pill.color, opacity: 0.2 }} />
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontSize: 13 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", color: cfg.pill.color, opacity: 0.65, marginBottom: 3, fontFamily: "var(--font-mono)" }}>DATE</p>
                <p style={{ fontWeight: 500, color: cfg.pill.color }}>{dayLabel(plan.date)}, {fmt(plan.date)}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", color: cfg.pill.color, opacity: 0.65, marginBottom: 3, fontFamily: "var(--font-mono)" }}>WEEK / TERM</p>
                <p style={{ fontWeight: 500, color: cfg.pill.color }}>Wk {plan.week || "—"} · {plan.term}</p>
              </div>
            </div>
          </div>

          <div>
            <p style={labelStyle}>Learning objectives</p>
            <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius-md)", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
              {plan.objectives}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
            <div>
              <p style={labelStyle}>Resources</p>
              <p style={{ color: "var(--text-secondary)" }}>{plan.resources || "—"}</p>
            </div>
            <div>
              <p style={labelStyle}>Assessment</p>
              <p style={{ color: "var(--text-secondary)" }}>{plan.assessment || "—"}</p>
            </div>
          </div>

          {plan.notes && (
            <div>
              <p style={labelStyle}>Notes</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{plan.notes}</p>
            </div>
          )}

          <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...ghostBtnStyle, flex: "none", padding: "10px 24px" }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}