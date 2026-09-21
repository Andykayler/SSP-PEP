// modules/classplanning.jsx — "Lesson Plans"
// Read-only view of every lesson plan the school's teachers have written
// (lesson_plans, created from the teacher dashboard). The head teacher reviews
// them here; editing stays with the teacher who owns the plan.
import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Eye, X, BookOpen, RefreshCw, Search, ClipboardList, CheckCircle, Loader2, Calendar } from "lucide-react";
import "./staff-management.css";

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

const STATUS = {
  planned: {
    label: "Planned",
    pill: { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" },
  },
  "in-progress": {
    label: "In progress",
    pill: { background: "var(--primary-pale)", color: "var(--primary-light)", border: "1px solid var(--border-color)" },
  },
  completed: {
    label: "Completed",
    pill: { background: "var(--success-pale)", color: "var(--success-light)", border: "1px solid rgba(34,197,94,0.22)" },
  },
};

const labelStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
  color: "var(--text-muted)", marginBottom: 6, fontFamily: "var(--font-mono)",
};

const selectStyle = {
  padding: "9px 12px", background: "var(--surface)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", fontSize: 13,
};

const ghostBtnStyle = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "8px 14px", background: "var(--surface)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getPeriod(num) {
  return PERIODS.find((p) => p.number === Number(num)) || null;
}

function StatusPill({ status }) {
  const cfg = STATUS[status] || STATUS.planned;
  return (
    <span className="status-pill" style={cfg.pill}>
      <span className="status-pill__dot" />
      {cfg.label}
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, accent }) {
  let valueClass = "stat-card__value";
  if (accent === "success") valueClass += " stat-card__value--success";
  if (accent === "warning") valueClass += " stat-card__value--warning";
  if (accent === "info") valueClass += " stat-card__value--accent";
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className={valueClass}>{value}</div>
        </div>
        {Icon && <Icon size={24} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}

function PlanCard({ plan, onView }) {
  const period = getPeriod(plan.periodNumber);
  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="badge badge--blue">{plan.className}</span>
          <span className="badge badge--teal">{plan.subject}</span>
          <StatusPill status={plan.status} />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Wk {plan.week || "—"} · {plan.term}
        </span>
      </div>

      <div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", color: "var(--text-primary)", lineHeight: 1.3 }}>
          {plan.topic}
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          By {plan.teacherName} · {fmt(plan.date)}{period ? ` · ${period.label} (${period.start}–${period.end})` : ""}
        </p>
        {plan.objectives && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {plan.objectives}
          </p>
        )}
      </div>

      <div>
        <button onClick={() => onView(plan)} style={ghostBtnStyle}>
          <Eye size={14} /> View plan
        </button>
      </div>
    </div>
  );
}

function ViewModal({ plan, onClose }) {
  const period = getPeriod(plan.periodNumber);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg)", borderRadius: "var(--radius-xl)", width: "100%", maxWidth: 560,
          maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-strong)",
        }}
      >
        <div style={{ background: "var(--hero-bg)", padding: "20px 28px", borderBottom: "1px solid var(--border-strong)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span className="badge badge--blue">{plan.className}</span>
              <span className="badge badge--teal">{plan.subject}</span>
              <StatusPill status={plan.status} />
            </div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--text-primary)", lineHeight: 1.3 }}>
              {plan.topic}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
            <div>
              <p style={labelStyle}>Teacher</p>
              <p style={{ color: "var(--text-secondary)" }}>{plan.teacherName}</p>
            </div>
            <div>
              <p style={labelStyle}>Date</p>
              <p style={{ color: "var(--text-secondary)" }}>
                {fmt(plan.date)}{period ? ` · ${period.label} (${period.start}–${period.end})` : ""}
              </p>
            </div>
            <div>
              <p style={labelStyle}>Week / Term</p>
              <p style={{ color: "var(--text-secondary)" }}>Wk {plan.week || "—"} · {plan.term}</p>
            </div>
          </div>

          <div>
            <p style={labelStyle}>Learning objectives</p>
            <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius-md)", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", border: "1px solid var(--border-color)", whiteSpace: "pre-wrap" }}>
              {plan.objectives || "—"}
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
            <button onClick={onClose} style={{ ...ghostBtnStyle, padding: "10px 24px" }}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClassPlanningModule({ schoolCode }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewPlan, setViewPlan] = useState(null);

  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    if (!schoolCode) return;
    setLoading(true);
    setError("");
    try {
      // Plans are filtered by schoolCode only (the shape the security rules
      // can verify for a head teacher) and sorted client-side, which avoids a
      // composite index.
      const [planSnap, userSnap] = await Promise.all([
        getDocs(query(collection(db, "lesson_plans"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
      ]);
      const names = {};
      userSnap.docs.forEach((d) => {
        const u = d.data();
        names[d.id] = u.name || u.fullName || u.displayName || u.email || "Unknown teacher";
      });
      const rows = planSnap.docs
        .map((d) => {
          const p = d.data();
          return { id: d.id, ...p, teacherName: p.teacherName || names[p.teacherId] || "Unknown teacher" };
        })
        .sort((a, b) => {
          const da = a.date || "";
          const db_ = b.date || "";
          if (db_ !== da) return db_.localeCompare(da);
          return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
        });
      setPlans(rows);
    } catch (err) {
      console.error("lesson plans load error:", err);
      setError(err.message || "Could not load lesson plans.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [schoolCode]);

  const options = useMemo(() => {
    const uniq = (arr) => [...new Set(arr)].filter(Boolean).sort();
    return {
      teachers: uniq(plans.map((p) => p.teacherName)),
      classes: uniq(plans.map((p) => p.className)),
      subjects: uniq(plans.map((p) => p.subject)),
    };
  }, [plans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      const matchSearch = !q
        || p.topic?.toLowerCase().includes(q)
        || p.className?.toLowerCase().includes(q)
        || p.subject?.toLowerCase().includes(q)
        || p.teacherName?.toLowerCase().includes(q);
      return matchSearch
        && (teacherFilter === "all" || p.teacherName === teacherFilter)
        && (classFilter === "all" || p.className === classFilter)
        && (subjectFilter === "all" || p.subject === subjectFilter)
        && (statusFilter === "all" || p.status === statusFilter);
    });
  }, [plans, search, teacherFilter, classFilter, subjectFilter, statusFilter]);

  const count = (s) => plans.filter((p) => p.status === s).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--text-primary)" }}>Lesson Plans</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Plans written by your teachers, newest first</p>
        </div>
        <button onClick={load} disabled={loading} style={ghostBtnStyle}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <KpiCard label="Total plans" value={plans.length} icon={ClipboardList} />
        <KpiCard label="Planned" value={count("planned")} icon={Calendar} accent="warning" />
        <KpiCard label="In progress" value={count("in-progress")} icon={Loader2} accent="info" />
        <KpiCard label="Completed" value={count("completed")} icon={CheckCircle} accent="success" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topic, teacher, class, subject…"
            style={{ ...selectStyle, width: "100%", paddingLeft: 34 }}
          />
        </div>
        <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} style={selectStyle}>
          <option value="all">All teachers</option>
          {options.teachers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={selectStyle}>
          <option value="all">All classes</option>
          {options.classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={selectStyle}>
          <option value="all">All subjects</option>
          {options.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">All statuses</option>
          <option value="planned">Planned</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {error && (
        <div style={{ padding: 14, borderRadius: "var(--radius-md)", background: "var(--danger-pale)", color: "var(--danger-light)", fontSize: 13 }}>
          Could not load lesson plans: {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
          <BookOpen size={32} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14 }}>
            {plans.length === 0 ? "No teacher has created a lesson plan yet." : "No lesson plans match your filters."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((plan) => <PlanCard key={plan.id} plan={plan} onView={setViewPlan} />)}
        </div>
      )}

      {viewPlan && <ViewModal plan={viewPlan} onClose={() => setViewPlan(null)} />}
    </div>
  );
}
