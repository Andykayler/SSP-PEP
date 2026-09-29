// modules/ClassAndStreamModule.jsx
import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../../firebase";
import { syncAssignmentsWithClasses } from "../../../services/staffAssignments";
import {
  sectionsOf, sectionKeyOfClass, sectionOfClass, sectionForClass, sectionName,
  ladderFor, planSectionClasses, renameClass,
} from "../../../services/curriculum";
import CurriculumSettings from "../../../components/setup/CurriculumSettings";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import {
  collection, query, where, getDocs, doc, writeBatch, serverTimestamp,
} from "firebase/firestore";
import {
  Users, BookOpen, GraduationCap, LayoutGrid, RefreshCw,
  Eye, Edit2, UserPlus, Loader2, Search, Settings, X, MessageSquare,
} from "lucide-react";
import ClassActivityBoard, { SCHOOL_SCOPE } from "../../../components/activity/ClassActivityBoard";
import { fetchThreadCounts } from "../../../services/activity";
import "./staff-management.css";
import { isDeactivated } from "../../../services/staffAccountCore";

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

// ─── Set up classes (section → classes → streams) ───────────────────────────
// Generates class records from the school's sections — each a level taught to a
// curriculum, e.g. Primary (Abeka) — (Kindergarten / Primary /
// Secondary) and the curriculum each follows — see services/curriculumCore.js.
function ClassSetupModal({ schoolCode, existingClasses, existingSettings, onClose, onSaved }) {
  const sections = useMemo(() => sectionsOf(existingSettings), [existingSettings]);
  const [activeKey, setActiveKey] = useState(sections[0]?.key);
  // section key → { ladder position → stream count }, from the classes that exist.
  const [rungs, setRungs] = useState(() => {
    const out = Object.fromEntries(sections.map((x) => [x.key, {}]));
    existingClasses.forEach((c) => {
      if (!c.formLevel) return;
      const id = sectionKeyOfClass(c, sections);
      if (!out[id]) return;
      const streamIndex = c.stream ? c.stream.charCodeAt(0) - 64 : 0; // "A" -> 1
      out[id][c.formLevel] = Math.max(out[id][c.formLevel] || 0, streamIndex);
    });
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const section = sections.find((x) => x.key === activeKey) || sections[0];
  const ladder = ladderFor(section.id, section.curriculum);
  const mine = rungs[section.key] || {};

  const toggle = (n) => setRungs((prev) => {
    const next = { ...(prev[section.key] || {}) };
    if (n in next) delete next[n]; else next[n] = 0;
    return { ...prev, [section.key]: next };
  });
  const setStreams = (n, count) => setRungs((prev) => ({
    ...prev, [section.key]: { ...(prev[section.key] || {}), [n]: Math.max(0, Math.min(6, count)) },
  }));

  const handleSave = async () => {
    const plan = sections.flatMap((x) => planSectionClasses({ schoolCode, section: x, rungs: rungs[x.key] || {}, capacity: DEFAULT_CAPACITY }));
    if (plan.length === 0) { setError("Select at least one class."); return; }
    setSaving(true);
    setError("");
    try {
      const batch = writeBatch(db);
      const uid = auth.currentUser?.uid || null;
      // An existing class in the same section, year and stream keeps its id,
      // name, subjects and capacity — re-running this never clobbers edits.
      const existingKey = (c) => `${sectionKeyOfClass(c, sections)}_${c.formLevel}_${c.stream || ""}`;
      const existing = new Map(existingClasses.filter((c) => c.formLevel).map((c) => [existingKey(c), c]));
      plan.forEach(({ id, data }) => {
        const match = existing.get(`${data.sectionKey}_${data.formLevel}_${data.stream || ""}`);
        if (match) {
          batch.set(doc(db, "school_classes", match.id), {
            section: data.section, curriculum: data.curriculum, sectionKey: data.sectionKey, formLevel: data.formLevel, stream: data.stream,
            order: data.order, updatedAt: serverTimestamp(), updatedBy: uid,
          }, { merge: true });
        } else {
          batch.set(doc(db, "school_classes", id), {
            ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid,
          }, { merge: true });
        }
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
            <p>Creates classes for each section the school runs. Safe to re-run — existing classes are kept, not duplicated.</p>
          </div>
          <button onClick={onClose} className="modal-close"><X size={22} /></button>
        </div>

        <div className="modal-body space-y-5">
          {error && <div className="error-message">{error}</div>}

          {sections.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {sections.map((x) => (
                <button key={x.key} type="button" onClick={() => setActiveKey(x.key)}
                  className={`filter-btn ${section.key === x.key ? "filter-btn--active" : ""}`}>
                  {sectionName(x)}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">
            {sectionName(section)}. New classes start with this section&rsquo;s{" "}
            {section.subjects.length} subjects. Change sections, curriculum or subjects under &ldquo;Curriculum &amp; grading&rdquo;.
          </p>

          <div className="space-y-2">
            {ladder.map((label, idx) => {
              const n = idx + 1;
              const checked = n in mine;
              return (
                <div key={label} className="flex items-center gap-3 p-3 rounded-xl border border-app-border">
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggle(n)} className="field__checkbox" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                  {checked && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted uppercase tracking-wide">Streams</span>
                      <select value={mine[n] || 0} onChange={(e) => setStreams(n, Number(e.target.value))}
                        className="field__select" style={{ width: 130 }}>
                        <option value={0}>None (single class)</option>
                        {[1, 2, 3, 4, 5, 6].map((k) => (
                          <option key={k} value={k}>
                            {k} ({Array.from({ length: k }, (_, i) => String.fromCharCode(65 + i)).join("/")})
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

// ─── Edit one class: name, subjects, capacity ───────────────────────────────
function EditClassModal({ cls, settings, schoolCode, onClose, onSaved }) {
  const section = sectionForClass(settings, cls);
  const [name, setName] = useState(cls.name || "");
  const [subjects, setSubjects] = useState(cls.subjects || []);
  const [capacity, setCapacity] = useState(cls.capacity || DEFAULT_CAPACITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const offered = [...new Set([...(section?.subjects || []), ...(cls.subjects || [])])];

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Give the class a name."); return; }
    if (subjects.length === 0) { setError("Tick at least one subject."); return; }
    setSaving(true);
    setError("");
    try {
      // The server renames it on every learner, timetable period, mark sheet
      // and teacher assignment too, so nothing is left under the old name.
      if (trimmed !== cls.name) {
        const res = await renameClass(cls.id, trimmed);
        if (!res.ok) { setError(res.error); setSaving(false); return; }
      }
      const batch = writeBatch(db);
      batch.update(doc(db, "school_classes", cls.id), {
        subjects, capacity: Math.max(1, Number(capacity) || DEFAULT_CAPACITY), updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await syncAssignmentsWithClasses(schoolCode).catch((e) => console.error("assignment sync failed:", e));
      onSaved();
      onClose();
    } catch (err) {
      console.error("Edit class failed:", err);
      setError(`Couldn't save the class: ${err.message}`);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h3>Edit {cls.name}</h3>
            <p>{sectionName(section)}</p>
          </div>
          <button onClick={onClose} className="modal-close"><X size={22} /></button>
        </div>
        <div className="modal-body space-y-4">
          {error && <div className="error-message">{error}</div>}
          <div>
            <label className="field__label">Class name</label>
            <input className="field__input" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-[11px] text-muted mt-1">Renaming updates the class&rsquo;s learners, timetable, marks and teachers too.</p>
          </div>
          <div>
            <label className="field__label">Capacity</label>
            <input className="field__input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} style={{ maxWidth: 140 }} />
          </div>
          <div>
            <label className="field__label">Subjects</label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {offered.map((sub) => (
                <label key={sub} className="flex items-center gap-2 text-sm cursor-pointer p-1">
                  <input type="checkbox" checked={subjects.includes(sub)}
                    onChange={() => setSubjects((prev) => (prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub]))} />
                  {sub}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-1">Add or rename subjects under &ldquo;Curriculum &amp; grading&rdquo;.</p>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-save">
            {saving ? <Spinner size={16} /> : <Edit2 size={16} />} Save class
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
  const [showCurriculum, setShowCurriculum] = useState(false);
  const [editClass, setEditClass] = useState(null);
  const [view, setView] = useState("classes");          // classes | activity
  const [activityScope, setActivityScope] = useState(SCHOOL_SCOPE);
  const [threadCounts, setThreadCounts] = useState({});

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
        staffSnap.docs
          .filter((d) => d.data().role && d.data().role !== "student" && !isDeactivated(d.data()))
          .map((d) => ({
            id: d.id,
            name: d.data().name || d.data().displayName || "Staff",
            role: d.data().role || "",
            assignedClasses: d.data().assignedClasses || [],
          }))
      );
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

  // Live, so a curriculum or grading change shows as soon as it is saved.
  useEffect(() => subscribeSchoolSettings(schoolCode, setSchoolSettings), [schoolCode]);

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
            {schoolSettings && ` · ${sectionsOf(schoolSettings).map(sectionName).join(", ")}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCurriculum(true)} disabled={loading} className="btn-refresh">
            <BookOpen size={14} /> Curriculum &amp; grading
          </button>
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
                  <p className="text-xs text-muted mt-0.5">{sectionName(sectionOfClass(cls, sectionsOf(schoolSettings)))} · {cls.subjectCount} subjects</p>
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
                <button onClick={() => setEditClass(cls)} className="btn btn--secondary" title="Rename or change subjects" aria-label={`Edit ${cls.name}`} style={{ flexShrink: 0 }}>
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

      {editClass && (
        <EditClassModal
          cls={editClass}
          settings={schoolSettings}
          schoolCode={schoolCode}
          onClose={() => setEditClass(null)}
          onSaved={fetchData}
        />
      )}

      {showCurriculum && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCurriculum(false)}>
          <div className="modal-container" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div>
                <h3>Curriculum &amp; grading</h3>
                <p>Sections the school runs, the curriculum each follows, its subjects and grading scale.</p>
              </div>
              <button onClick={() => setShowCurriculum(false)} className="modal-close"><X size={22} /></button>
            </div>
            <div className="modal-body">
              <CurriculumSettings schoolCode={schoolCode} settings={schoolSettings} actorId={currentUser?.uid || ""} />
            </div>
          </div>
        </div>
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