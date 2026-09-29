// modules/TimetableModule.jsx
import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Calendar, Clock, MapPin, Users, X, Save, Trash2,
  RefreshCw, AlertCircle, CheckCircle, Loader2, Plus, Wand2, Upload,
} from "lucide-react";
import AutoTimetable from "../../../components/timetable/AutoTimetable";
import TimetableUpload from "../../../components/timetable/TimetableUpload";
import { findClashes, conflictsFor, describeClash } from "../../../services/timetableClash";
import "./staff-management.css";
import { isDeactivated } from "../../../services/staffAccountCore";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Mirrors the period table used across ClassModule / lesson plan / dashboard
// schedule widgets, so a period number means the same thing everywhere.
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

function slotId(schoolCode, classId, day, periodNumber) {
  return `${schoolCode}_${classId}_${day}_${periodNumber}`;
}

function Spinner({ size = 16 }) {
  return <Loader2 size={size} style={{ animation: "spin 0.65s linear infinite" }} />;
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

// ─── Slot editor modal ────────────────────────────────────────────────────────
function SlotModal({ day, period, existing, subjects, teachers, onSave, onDelete, onClose }) {
  const [subject, setSubject] = useState(existing?.subject || subjects[0] || "");
  const [teacherId, setTeacherId] = useState(existing?.teacherId || "");
  const [venue, setVenue] = useState(existing?.venue || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!subject) { setError("Select a subject."); return; }
    if (!teacherId) { setError("Select a teacher."); return; }
    setSaving(true);
    setError("");
    try {
      const teacher = teachers.find((t) => t.id === teacherId);
      await onSave({ subject, teacherId, teacherName: teacher?.name || "", venue: venue.trim() });
      onClose();
    } catch (err) {
      console.error("Save timetable slot:", err);
      setError(
        err.clash ? err.message
          : err.code === "permission-denied" ? "Permission denied. Check your Firestore rules."
            : "Failed to save. Please try again.",
      );
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Clear this period? This removes the subject/teacher assignment for this slot.")) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      console.error("Delete timetable slot:", err);
      setError("Failed to clear this slot.");
      setDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-container" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <h3>{day} · Period {period.number}</h3>
            <p>{period.start} – {period.end}</p>
          </div>
          <button onClick={onClose} className="modal-close"><X size={22} /></button>
        </div>

        <div className="modal-body space-y-4">
          {error && <div className="error-message">{error}</div>}

          <div>
            <label className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Subject
            </label>
            {subjects.length === 0 ? (
              <p className="empty-assignments">No subjects configured for this class. Add subjects to the class first.</p>
            ) : (
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className="search-input" style={{ width: "100%" }}>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Teacher
            </label>
            {teachers.length === 0 ? (
              <p className="empty-assignments">No staff are assigned to this class yet. Assign teachers in Staff Management first.</p>
            ) : (
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="search-input" style={{ width: "100%" }}>
                <option value="">Select teacher</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Venue / Room
            </label>
            <input
              type="text" placeholder="e.g. Block B - Rm 12"
              value={venue} onChange={(e) => setVenue(e.target.value)}
              className="search-input" style={{ width: "100%" }}
            />
          </div>
        </div>

        <div className="modal-footer">
          {existing ? (
            <button onClick={handleDelete} disabled={deleting || saving} className="btn-cancel" style={{ color: "#ef4444" }}>
              {deleting ? <Spinner size={16} /> : <Trash2 size={16} />} Clear slot
            </button>
          ) : (
            <button onClick={onClose} className="btn-cancel">Cancel</button>
          )}
          <button onClick={handleSave} disabled={saving || deleting || subjects.length === 0 || teachers.length === 0} className="btn-save">
            {saving ? <Spinner size={16} /> : <Save size={16} />} {existing ? "Update" : "Assign period"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main module ───────────────────────────────────────────────────────────────
export default function TimetableModule({ schoolCode }) {
  const [classes, setClasses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [slots, setSlots] = useState([]); // timetable docs for the selected class
  const [selectedClassId, setSelectedClassId] = useState("");

  const [classesReady, setClassesReady] = useState(false);
  const [slotsReady, setSlotsReady] = useState(false);
  const [editing, setEditing] = useState(null); // { day, period, existing }
  const [autoOpen, setAutoOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");

  const showToast = (message, type = "success") => setToast({ message, type });
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // ── Load classes + staff for this school ──────────────────────────────────
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    (async () => {
      setClassesReady(false);
      setError("");
      try {
        const [classSnap, staffSnap] = await Promise.all([
          getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
          getDocs(query(
            collection(db, "users"),
            where("schoolCode", "==", schoolCode),
            where("role", "in", ["head_teacher", "class_teacher"])
          )),
        ]);
        if (cancelled) return;
        const classList = classSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setClasses(classList);
        setStaff(staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => !isDeactivated(t)));
        if (classList.length > 0) setSelectedClassId((prev) => prev || classList[0].id);
      } catch (err) {
        console.error("Failed to load classes/staff:", err);
        setError("Could not load classes and staff.");
      } finally {
        if (!cancelled) setClassesReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode]);

  // ── Every slot in the school, so a clash between two classes is visible ────
  // The grid below is per class, so it can never show that the teacher it is
  // assigning is already teaching someone else at that time.
  const [allSlots, setAllSlots] = useState([]);
  useEffect(() => {
    if (!schoolCode) return;
    getDocs(query(collection(db, "timetable"), where("schoolCode", "==", schoolCode)))
      .then((snap) => setAllSlots(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => console.error("Failed to load school timetable:", err));
  }, [schoolCode]);
  const clashes = useMemo(() => findClashes(allSlots), [allSlots]);

  // ── Load timetable slots for the selected class ───────────────────────────
  const fetchSlots = async () => {
    if (!schoolCode || !selectedClassId) return;
    setSlotsReady(false);
    setError("");
    try {
      const snap = await getDocs(
        query(
          collection(db, "timetable"),
          where("schoolCode", "==", schoolCode),
          where("classId", "==", selectedClassId)
        )
      );
      setSlots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("fetchSlots error:", err);
      setError(`Could not load the timetable: ${err.message}`);
    } finally {
      setSlotsReady(true);
    }
  };

  useEffect(() => {
    if (classesReady && selectedClassId) fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classesReady, selectedClassId]);

  const slotMap = useMemo(() => {
    const map = {};
    slots.forEach((s) => { map[`${s.day}_${s.periodNumber}`] = s; });
    return map;
  }, [slots]);

  const classSubjects = selectedClass?.subjects || [];
  const classTeachers = staff.filter((t) => t.assignedClasses?.includes(selectedClass?.name));

  const filledCount = slots.length;
  const totalCells = DAYS.length * PERIODS.length;
  const coveragePct = totalCells > 0 ? Math.round((filledCount / totalCells) * 100) : 0;

  const saveSlot = async (day, period, data) => {
    const id = slotId(schoolCode, selectedClassId, day, period.number);

    // Refuse a booking the school could not actually deliver.
    const conflicts = conflictsFor(allSlots, {
      classId: selectedClassId, day, periodNumber: period.number,
      teacherId: data.teacherId, venue: data.venue,
    });
    if (conflicts.length > 0) {
      const err = new Error(`${conflicts.map((c) => c.message).join(" ")} Choose another teacher or venue, or change that lesson first.`);
      err.clash = true;
      throw err;
    }

    const payload = {
      schoolCode,
      classId: selectedClassId,
      className: selectedClass?.name || "",
      day,
      periodNumber: period.number,
      startTime: period.start,
      endTime: period.end,
      ...data,
      updatedAt: serverTimestamp(),
    };
    const existing = slotMap[`${day}_${period.number}`];
    if (!existing) payload.createdAt = serverTimestamp();
    await setDoc(doc(db, "timetable", id), payload, { merge: true });
    setSlots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      next.push({ id, ...payload });
      return next;
    });
    setAllSlots((prev) => [...prev.filter((s) => s.id !== id), { id, ...payload }]);
    showToast(existing ? "Period updated." : "Period assigned.");
  };

  const deleteSlot = async (day, period) => {
    const id = slotId(schoolCode, selectedClassId, day, period.number);
    await deleteDoc(doc(db, "timetable", id));
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setAllSlots((prev) => prev.filter((s) => s.id !== id));
    showToast("Period cleared.");
  };

  const isLoading = !classesReady || (selectedClassId && !slotsReady);
  const noClasses = classesReady && classes.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Timetable</h2>
          <p className="text-muted">Assign a subject, teacher and venue to every class period.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setUploadOpen(true)} disabled={!classesReady || noClasses} className="btn-refresh" title="Fill the grid from a photo, PDF or spreadsheet of the timetable">
            <Upload size={16} /> Upload
          </button>
          <button onClick={() => setAutoOpen(true)} disabled={!classesReady || noClasses} className="btn-save" title="Build the week for every class automatically">
            <Wand2 size={16} /> Auto-generate
          </button>
          <button onClick={fetchSlots} disabled={isLoading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {clashes.length > 0 && (
        <div className="alert alert--error" role="alert" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <strong>{clashes.length} clash{clashes.length === 1 ? "" : "es"} in the school timetable</strong>
          {clashes.slice(0, 5).map((c, i) => (
            <span key={i} style={{ fontSize: 12.5 }}>{describeClash(c)}</span>
          ))}
          {clashes.length > 5 && <span style={{ fontSize: 12.5 }}>and {clashes.length - 5} more</span>}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {noClasses && (
        <div className="alert alert--warning">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          No classes found. Classes are configured in the Admin Dashboard first.
        </div>
      )}

      {!noClasses && (
        <>
          {/* Class selector + coverage */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <Users size={18} className="text-muted" />
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="search-input"
                style={{ width: "auto", minWidth: 180, fontWeight: 600 }}
              >
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted ml-auto">
              <Calendar size={14} />
              {filledCount}/{totalCells} periods assigned ({coveragePct}%)
            </div>
          </div>

          {selectedClass && classSubjects.length === 0 && (
            <div className="alert alert--warning">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              {selectedClass.name} has no subjects configured yet. Add subjects to this class in the Admin Dashboard before building its timetable.
            </div>
          )}

          {/* Grid */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="data-table-wrap">
              {isLoading ? (
                <div className="empty-state py-12"><Spinner size={28} /><p className="empty-state__sub">Loading timetable…</p></div>
              ) : (
                <table className="data-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Period</th>
                      {DAYS.map((d) => <th key={d}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map((period) => (
                      <tr key={period.number}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{period.label}</div>
                          <div className="text-muted" style={{ fontSize: 10.5 }}>{period.start}–{period.end}</div>
                        </td>
                        {DAYS.map((day) => {
                          const slotEntry = slotMap[`${day}_${period.number}`];
                          return (
                            <td key={day} style={{ minWidth: 150, verticalAlign: "top" }}>
                              {slotEntry ? (
                                <button
                                  onClick={() => setEditing({ day, period, existing: slotEntry })}
                                  className="assignment-item"
                                  style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}
                                >
                                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{slotEntry.subject}</div>
                                  <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{slotEntry.teacherName || "—"}</div>
                                  {slotEntry.venue && (
                                    <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                                      <MapPin size={10} /> {slotEntry.venue}
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditing({ day, period, existing: null })}
                                  className="icon-btn"
                                  style={{ width: "100%", justifyContent: "center", borderStyle: "dashed", color: "var(--text-muted)" }}
                                  title="Assign this period"
                                >
                                  <Plus size={14} />
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <p className="text-center text-xs text-muted pt-1">
        Teachers see their own periods on their personal timetable and can clock in/out from there once assigned here.
      </p>

      {editing && selectedClass && (
        <SlotModal
          day={editing.day}
          period={editing.period}
          existing={editing.existing}
          subjects={classSubjects}
          teachers={classTeachers}
          onSave={(data) => saveSlot(editing.day, editing.period, data)}
          onDelete={() => deleteSlot(editing.day, editing.period)}
          onClose={() => setEditing(null)}
        />
      )}
      {autoOpen && (
        <AutoTimetable
          schoolCode={schoolCode}
          classes={classes}
          staff={staff}
          allSlots={allSlots}
          days={DAYS}
          periods={PERIODS}
          slotId={slotId}
          onClose={() => setAutoOpen(false)}
          onSaved={(next) => {
            setAllSlots(next);
            setSlots(next.filter((s) => s.classId === selectedClassId));
            setAutoOpen(false);
            showToast("Timetable generated. Click any period to adjust it.");
          }}
        />
      )}
      {uploadOpen && (
        <TimetableUpload
          schoolCode={schoolCode}
          classes={classes}
          staff={staff}
          days={DAYS}
          periods={PERIODS}
          allSlots={allSlots}
          slotId={slotId}
          onImported={(next, message) => {
            setAllSlots(next);
            setSlots(next.filter((s) => s.classId === selectedClassId));
            setUploadOpen(false);
            showToast(message);
          }}
          onClose={() => setUploadOpen(false)}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
