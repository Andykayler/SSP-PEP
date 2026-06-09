// modules/ClassAndStreamModule.jsx
import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  Users, BookOpen, GraduationCap, LayoutGrid, RefreshCw,
  Eye, Edit2, UserPlus, Loader2, Search,
} from "lucide-react";
import "./staff-management.css";

const DEFAULT_CAPACITY = 45;

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function KpiCard({ label, value, sub, icon: Icon, accent = "neutral", loading }) {
  let cardClass = "stat-card";
  let valueClass = "stat-card__value";
  if (accent === "success") valueClass += " stat-card__value--success";
  if (accent === "warning") valueClass += " stat-card__value--warning";
  if (accent === "info") valueClass += " stat-card__value--accent";
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className={valueClass}>{loading ? <Spinner size={22} /> : value}</div>
          {sub && <div className="stat-card__sub">{sub}</div>}
        </div>
        {Icon && <Icon size={24} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}

function UtilBar({ pct }) {
  const color = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "var(--primary, #4f6ef7)";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted">
        <span>Capacity</span>
        <span className="font-semibold text-app-text/70">{pct}%</span>
      </div>
      <div className="h-2 bg-primary-dim rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ClassAndStreamModule({ schoolCode }) {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewClass, setViewClass] = useState(null);

  const fetchData = async () => {
    if (!schoolCode) return;
    setLoading(true);
    try {
      const [classSnap, studentSnap, staffSnap] = await Promise.all([
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
      ]);
      setClasses(
        classSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStaff(
        staffSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || d.data().displayName || "Staff",
          assignedClasses: d.data().assignedClasses || [],
        }))
      );
    } catch (err) {
      console.error("ClassModule fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolCode]);

  const classCards = useMemo(() => {
    return classes.map((cls) => {
      const studentCount = students.filter(
        (s) => s.classId === cls.id || s.className === cls.name || s.form === cls.name
      ).length;
      const capacity = cls.capacity || DEFAULT_CAPACITY;
      const utilization = capacity > 0 ? Math.round((studentCount / capacity) * 100) : 0;
      const teacher = staff.find((t) => t.assignedClasses?.includes(cls.name));
      const subjectCount = cls.subjects?.length ?? 0;
      return {
        ...cls,
        studentCount,
        capacity,
        utilization,
        classTeacher: teacher?.name || cls.classTeacher || "Not assigned",
        subjectCount,
        status: cls.status || "Active",
      };
    });
  }, [classes, students, staff]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classCards;
    return classCards.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.classTeacher?.toLowerCase().includes(q)
    );
  }, [classCards, search]);

  const totalStudents = classCards.reduce((s, c) => s + c.studentCount, 0);
  const avgSize = classCards.length ? Math.round(totalStudents / classCards.length) : 0;
  const activeCount = classCards.filter((c) => c.status === "Active").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Classes & Streams</h2>
          <p className="text-muted">Class management dashboard · enrollment & capacity</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="icon-btn" title="Refresh">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <KpiCard label="Total Classes" value={classes.length} icon={LayoutGrid} accent="neutral" loading={loading} />
        <KpiCard label="Total Students" value={totalStudents} icon={Users} accent="info" loading={loading} />
        <KpiCard label="Avg Class Size" value={avgSize} sub="students per class" icon={GraduationCap} accent="success" loading={loading} />
        <KpiCard label="Active Classes" value={activeCount} icon={BookOpen} accent="warning" loading={loading} />
      </div>

      {/* Search & Filters */}
      <div className="card p-4">
        <div className="filter-bar">
          <div className="search-wrapper">
            <Search className="search-icon" size={14} />
            <input
              type="text"
              placeholder="Search classes or teachers…"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-muted text-xs ml-auto">{filtered.length} class{filtered.length !== 1 ? "es" : ""}</div>
        </div>
      </div>

      {/* Class Cards Grid */}
      {loading ? (
        <div className="empty-state"><Spinner size={28} /><p className="empty-state__sub">Loading classes…</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <LayoutGrid size={32} className="text-muted" />
          <p className="empty-state__title">No classes found</p>
          <p className="empty-state__sub">{search ? "No classes match your search." : "Classes are configured by your school administrator."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((cls) => (
            <div key={cls.id} className="card p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-app-text">{cls.name}</h3>
                  <p className="text-xs text-muted mt-0.5 capitalize">{cls.level || "Secondary"} · {cls.subjectCount} subjects</p>
                </div>
                <span className={`status-pill status-pill--success`}>{cls.status}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface border border-app-border text-sm font-semibold">
                  <Users size={14} /> {cls.studentCount}
                </span>
                <span className="text-xs text-muted">of {cls.capacity} capacity</span>
              </div>

              <UtilBar pct={cls.utilization} />

              <div className="text-sm space-y-1.5 pt-1 border-t border-app-border">
                <div className="flex justify-between">
                  <span className="text-muted">Class teacher</span>
                  <span className="font-medium truncate max-w-[55%] text-right">{cls.classTeacher}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setViewClass(cls)} className="btn btn--secondary flex-1">
                  <Eye size={13} /> View
                </button>
                <button className="btn btn--secondary flex-1" title="Contact administrator to edit classes">
                  <Edit2 size={13} /> Edit
                </button>
                <button className="btn btn--secondary" title="Assign via Staff Management">
                  <UserPlus size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal (View Class) */}
      {viewClass && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewClass(null)}>
          <div className="modal-container" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h3>{viewClass.name}</h3>
              <button onClick={() => setViewClass(null)} className="modal-close">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-app-bg border border-app-border">
                  <p className="text-[10px] uppercase tracking-widest text-muted">Students</p>
                  <p className="text-2xl font-bold">{viewClass.studentCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-app-bg border border-app-border">
                  <p className="text-[10px] uppercase tracking-widest text-muted">Utilization</p>
                  <p className="text-2xl font-bold">{viewClass.utilization}%</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted mb-1">Class teacher</p>
                <p className="font-medium">{viewClass.classTeacher}</p>
              </div>
              {viewClass.subjects?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted mb-2">Subjects</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewClass.subjects.map((s) => (
                      <span key={s} className="tag">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setViewClass(null)} className="btn-cancel w-full">Close</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted pt-1">
        Class structure is managed by the school administrator. Use Staff Management to assign class teachers.
      </p>
    </div>
  );
}