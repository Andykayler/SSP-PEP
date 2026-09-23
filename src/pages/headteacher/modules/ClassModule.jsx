// modules/ClassAndStreamModule.jsx
import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../../firebase";
import { syncAssignmentsWithClasses } from "../../../services/staffAssignments";
import {
  collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp,
} from "firebase/firestore";
import {
  Users, BookOpen, GraduationCap, LayoutGrid, RefreshCw,
  Eye, Edit2, UserPlus, Loader2, Search, Settings, X, MessageSquare,
} from "lucide-react";
import ClassActivityBoard, { SCHOOL_SCOPE } from "../../../components/activity/ClassActivityBoard";
import { fetchThreadCounts } from "../../../services/activity";
import "./staff-management.css";

const DEFAULT_CAPACITY = 45;

// School type → the full range of forms/standards that type can offer. A
// school doesn't have to use every one — Set up classes lets the head
// teacher pick a subset (e.g. a secondary school with only Form 1–4).
const SCHOOL_TYPE_FORMS = {
  Secondary: ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Form 6"],
  Primary: ["Standard 1", "Standard 2", "Standard 3", "Standard 4", "Standard 5", "Standard 6", "Standard 7", "Standard 8"],
};

// Deterministic doc id so re-running Set up classes is idempotent (upserts
// instead of creating duplicates) — same pattern as timesheet/attendance
// entries elsewhere in this codebase.
function classDocId(schoolCode, formLevel, stream) {
  return `${schoolCode}_form${formLevel}${stream || ""}`;
}

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

// ─── Set up classes (school type → forms/standards → streams) ───────────────
function ClassSetupModal({ schoolCode, existingClasses, existingSettings, onClose, onSaved }) {
  const [schoolType, setSchoolType] = useState(existingSettings?.schoolType || "Secondary");
  const [selectedForms, setSelectedForms] = useState(() => {
    const forms = new Set();
    existingClasses.forEach((c) => { if (c.formLevel) forms.add(c.formLevel); });
    return forms;
  });
  const [streamCounts, setStreamCounts] = useState(() => {
    const counts = {};
    existingClasses.forEach((c) => {
      if (!c.formLevel) return;
      const streamIndex = c.stream ? c.stream.charCodeAt(0) - 64 : 0; // "A" -> 1
      counts[c.formLevel] = Math.max(counts[c.formLevel] || 0, streamIndex);
    });
    return counts;
  });
  const [subjectsInput, setSubjectsInput] = useState(
    "Mathematics, English, Chichewa, Biology, Physical Science, Geography, History, Agriculture"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const formList = SCHOOL_TYPE_FORMS[schoolType];
  const existingKeys = useMemo(
    () => new Set(existingClasses.filter((c) => c.formLevel).map((c) => `${c.formLevel}_${c.stream || ""}`)),
    [existingClasses]
  );

  const toggleForm = (level) => {
    setSelectedForms((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  };

  const setStreams = (level, count) => {
    setStreamCounts((prev) => ({ ...prev, [level]: Math.max(0, Math.min(6, count)) }));
  };

  const handleSave = async () => {
    if (selectedForms.size === 0) { setError("Select at least one form/standard."); return; }
    setSaving(true);
    setError("");
    try {
      const subjects = subjectsInput.split(",").map((s) => s.trim()).filter(Boolean);
      const batch = writeBatch(db);
      const uid = auth.currentUser?.uid || null;

      batch.set(doc(db, "school_settings", schoolCode), {
        schoolCode,
        schoolType,
        promotionThreshold: existingSettings?.promotionThreshold ?? 40,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }, { merge: true });

      [...selectedForms].sort((a, b) => a - b).forEach((level) => {
        const label = formList[level - 1];
        const streamCount = streamCounts[level] || 0;
        const slots = streamCount === 0
          ? [{ stream: null, name: label, order: level * 10 }]
          : Array.from({ length: streamCount }, (_, i) => {
              const letter = String.fromCharCode(65 + i);
              return { stream: letter, name: `${label}${letter}`, order: level * 10 + i };
            });

        slots.forEach(({ stream, name, order }) => {
          const id = classDocId(schoolCode, level, stream);
          const alreadyExists = existingKeys.has(`${level}_${stream || ""}`);
          const payload = alreadyExists
            // Existing class: only keep the structural fields in sync, never
            // clobber subjects/capacity a head teacher may have since edited.
            ? { schoolCode, name, formLevel: level, stream, order, level: schoolType, updatedAt: serverTimestamp(), updatedBy: uid }
            : { schoolCode, name, formLevel: level, stream, order, level: schoolType, subjects, capacity: DEFAULT_CAPACITY, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid };
          batch.set(doc(db, "school_classes", id), payload, { merge: true });
        });
      });

      await batch.commit();
      await syncAssignmentsWithClasses(schoolCode).catch((e) => console.error("assignment sync failed:", e));
      onSaved();
      onClose();
    } catch (err) {
      console.error("Class setup save error:", err);
      setError(err.code === "permission-denied" ? "Permission denied. Check your Firestore rules." : "Failed to save class setup. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <h3>Set up classes</h3>
            <p>Generates class records from your school type. Safe to re-run — existing classes are updated, not duplicated.</p>
          </div>
          <button onClick={onClose} className="modal-close"><X size={22} /></button>
        </div>

        <div className="modal-body space-y-5">
          {error && <div className="error-message">{error}</div>}

          <div>
            <label className="field__label">School type</label>
            <div className="flex gap-2 mt-2">
              {Object.keys(SCHOOL_TYPE_FORMS).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setSchoolType(t); setSelectedForms(new Set()); setStreamCounts({}); }}
                  className={`filter-btn ${schoolType === t ? "filter-btn--active" : ""}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field__label">{schoolType === "Secondary" ? "Forms" : "Standards"} this school has</label>
            <div className="space-y-2 mt-2">
              {formList.map((label, idx) => {
                const level = idx + 1;
                const checked = selectedForms.has(level);
                return (
                  <div key={level} className="flex items-center gap-3 p-3 rounded-xl border border-app-border">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleForm(level)} className="field__checkbox" />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                    {checked && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted uppercase tracking-wide">Streams</span>
                        <select
                          value={streamCounts[level] || 0}
                          onChange={(e) => setStreams(level, Number(e.target.value))}
                          className="field__select"
                          style={{ width: 130 }}
                        >
                          <option value={0}>None (single class)</option>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n} ({Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)).join("/")})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field__label">Default subjects for newly created classes</label>
            <textarea
              rows={2}
              value={subjectsInput}
              onChange={(e) => setSubjectsInput(e.target.value)}
              className="field__textarea"
              placeholder="Comma-separated subject names"
            />
            <p className="text-[11px] text-muted mt-1">
              Only applied when a class is created for the first time — existing classes keep whatever subjects they already have.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-save">
            {saving ? <Spinner size={16} /> : <LayoutGrid size={16} />} Create classes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClassAndStreamModule({ schoolCode, currentUser }) {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewClass, setViewClass] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [view, setView] = useState("classes");          // classes | activity
  const [activityScope, setActivityScope] = useState(SCHOOL_SCOPE);
  const [threadCounts, setThreadCounts] = useState({});

  const fetchData = async () => {
    if (!schoolCode) return;
    setLoading(true);
    try {
      const [classSnap, studentSnap, staffSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
        getDoc(doc(db, "school_settings", schoolCode)),
      ]);
      setClasses(
        classSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
      setStudents(studentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStaff(
        staffSnap.docs
          .filter((d) => d.data().role && d.data().role !== "student")
          .map((d) => ({
            id: d.id,
            name: d.data().name || d.data().displayName || "Staff",
            role: d.data().role || "",
            assignedClasses: d.data().assignedClasses || [],
          }))
      );
      setSchoolSettings(settingsSnap.exists() ? settingsSnap.data() : null);
      setThreadCounts(await fetchThreadCounts(schoolCode));
    } catch (err) {
      console.error("ClassModule fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolCode]);

  const openActivity = (scopeId) => {
    setActivityScope(scopeId);
    setView("activity");
  };

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
          <p className="text-muted">
            Class management dashboard · enrollment & capacity
            {schoolSettings?.schoolType && ` · ${schoolSettings.schoolType}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSetup(true)} disabled={loading} className="btn-refresh">
            <Settings size={14} /> Set up classes
          </button>
          <button onClick={fetchData} disabled={loading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {/* Roster vs. discussion — the two ways a head teacher works with a class */}
      <div className="cls-viewtabs">
        <button
          type="button"
          className={`cls-viewtab ${view === "classes" ? "cls-viewtab--on" : ""}`}
          onClick={() => setView("classes")}
        >
          <LayoutGrid size={14} /> Classes
        </button>
        <button
          type="button"
          className={`cls-viewtab ${view === "activity" ? "cls-viewtab--on" : ""}`}
          onClick={() => setView("activity")}
        >
          <MessageSquare size={14} /> Activity
          {(() => {
            const total = Object.values(threadCounts).reduce((n, c) => n + c.threads, 0);
            return total > 0 ? <span className="cls-viewtab__n">{total}</span> : null;
          })()}
        </button>
      </div>

      {view === "activity" ? (
        <ClassActivityBoard
          schoolCode={schoolCode}
          currentUser={currentUser}
          classes={classes}
          staff={staff}
          scopeId={activityScope}
          onScopeChange={setActivityScope}
          threadCounts={threadCounts}
        />
      ) : (
      <>
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
          <p className="empty-state__sub">
            {search ? "No classes match your search." : "Use \"Set up classes\" above to generate classes for your school."}
          </p>
          {!search && (
            <button onClick={() => setShowSetup(true)} className="btn btn--accent btn--md">
              <Settings size={14} /> Set up classes
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" style={{ alignItems: "start" }}>
          {filtered.map((cls) => (
            <div key={cls.id} className="card p-5 flex flex-col gap-4" style={{ minWidth: 0 }}>
              <div className="flex items-start justify-between gap-3">
                <div style={{ minWidth: 0 }}>
                  <h3 className="text-xl font-bold text-app-text truncate">{cls.name}</h3>
                  <p className="text-xs text-muted mt-0.5 capitalize">{cls.level || "Secondary"} · {cls.subjectCount} subjects</p>
                </div>
                <span className="status-pill status-pill--success" style={{ flexShrink: 0 }}>{cls.status}</span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface border border-app-border text-sm font-semibold" style={{ flexShrink: 0 }}>
                  <Users size={14} /> {cls.studentCount}
                </span>
                <span className="text-xs text-muted">of {cls.capacity} capacity</span>
              </div>

              <UtilBar pct={cls.utilization} />

              <div className="text-sm pt-3" style={{ borderTop: "1px solid var(--border-color)" }}>
                <div className="text-xs text-muted">Class teacher</div>
                <div className="font-medium truncate mt-1">{cls.classTeacher}</div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setViewClass(cls)} className="btn btn--secondary flex-1">
                  <Eye size={13} /> View
                </button>
                <button
                  onClick={() => openActivity(cls.id)}
                  className="btn btn--secondary flex-1"
                  title={`Open the ${cls.name} discussion channel`}
                >
                  <MessageSquare size={13} /> Activity
                  {threadCounts[cls.id]?.threads > 0 && (
                    <span className="cls-scope__n">{threadCounts[cls.id].threads}</span>
                  )}
                </button>
                <button className="btn btn--secondary" title="Contact administrator to edit classes" style={{ flexShrink: 0 }}>
                  <Edit2 size={13} />
                </button>
                <button className="btn btn--secondary" title="Assign via Staff Management" style={{ flexShrink: 0 }}>
                  <UserPlus size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      </>
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

      {view === "classes" && (
        <p className="text-center text-xs text-muted pt-1">
          Use "Set up classes" to generate classes for your school, or Staff Management to assign class teachers.
        </p>
      )}

      {showSetup && (
        <ClassSetupModal
          schoolCode={schoolCode}
          existingClasses={classes}
          existingSettings={schoolSettings}
          onClose={() => setShowSetup(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}