import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import {
  CheckCircle, XCircle, Clock, Save, Users, Search,
  RefreshCw, AlertCircle, Loader2, ChevronDown, Download,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "—";
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Firestore doc ID for an attendance record: schoolCode_classId_date
function attendanceDocId(schoolCode, classId, date) {
  return `${schoolCode}_${classId}_${date}`;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Present: {
    label: "Present",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    activeBg: "bg-emerald-600",
    activeText: "text-white",
    icon: CheckCircle,
    color: "text-emerald-600",
  },
  Late: {
    label: "Late",
    bg: "bg-amber-100",
    text: "text-amber-700",
    activeBg: "bg-amber-500",
    activeText: "text-white",
    icon: Clock,
    color: "text-amber-500",
  },
  Absent: {
    label: "Absent",
    bg: "bg-red-100",
    text: "text-red-700",
    activeBg: "bg-red-600",
    activeText: "text-white",
    icon: XCircle,
    color: "text-red-600",
  },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AttendanceModule({ userId, schoolCode }) {
  const [classes,       setClasses]       = useState([]);
  const [filterClassId, setFilterClassId] = useState("");
  const [students,      setStudents]      = useState([]);
  const [attendance,    setAttendance]    = useState({}); // { studentId: { status, time, remark } }
  const [selectedDate,  setSelectedDate]  = useState(todayISO());
  const [searchTerm,    setSearchTerm]    = useState("");

  const [classesReady,     setClassesReady]     = useState(false);
  const [studentsReady,    setStudentsReady]     = useState(false);
  const [attendanceReady,  setAttendanceReady]   = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [saveStatus,       setSaveStatus]       = useState(""); // "saved" | "error" | ""
  const [error,            setError]            = useState("");

  const isLoading    = !classesReady || !studentsReady || !attendanceReady;
  const noAssignment = classesReady && classes.length === 0;
  const selectedClass = classes.find((c) => c.id === filterClassId);

  // ── Step 1: Load teacher's classes ──────────────────────────────────────────
  useEffect(() => {
    if (!userId || !schoolCode) return;
    let cancelled = false;

    (async () => {
      setClassesReady(false);
      setStudentsReady(false);
      setAttendanceReady(false);
      setClasses([]);
      setError("");

      try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (cancelled) return;

        const assignedNames = userSnap.exists()
          ? userSnap.data().assignedClasses ?? []
          : [];

        if (assignedNames.length === 0) {
          setClasses([]);
          setClassesReady(true);
          setStudentsReady(true);
          setAttendanceReady(true);
          return;
        }

        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;

        const myClasses = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => assignedNames.includes(c.name));

        setClasses(myClasses);
        setClassesReady(true);

        if (myClasses.length > 0) {
          setFilterClassId(myClasses[0].id);
        } else {
          setStudentsReady(true);
          setAttendanceReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load class assignments:", err);
        setError("Could not load your class assignments.");
        setClassesReady(true);
        setStudentsReady(true);
        setAttendanceReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, schoolCode]);

  // ── Step 2: Load students for selected class ─────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!schoolCode || !filterClassId) return;
    setStudentsReady(false);
    setAttendanceReady(false);
    setError("");

    try {
      const snap = await getDocs(
        query(
          collection(db, "students"),
          where("schoolCode", "==", schoolCode),
          where("classId",   "==", filterClassId)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setStudents(list);
    } catch (err) {
      console.error("fetchStudents error:", err);
      setError(`Could not load students: ${err.message}`);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, filterClassId]);

  useEffect(() => {
    if (classesReady && filterClassId) fetchStudents();
  }, [fetchStudents, classesReady, filterClassId]);

  // ── Step 3: Load existing attendance for class + date ────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!schoolCode || !filterClassId || !selectedDate) return;
    setAttendanceReady(false);

    try {
      const docId   = attendanceDocId(schoolCode, filterClassId, selectedDate);
      const docSnap = await getDoc(doc(db, "attendance", docId));

      if (docSnap.exists()) {
        setAttendance(docSnap.data().records ?? {});
      } else {
        setAttendance({});
      }
    } catch (err) {
      console.error("fetchAttendance error:", err);
      setAttendance({});
    } finally {
      setAttendanceReady(true);
    }
  }, [schoolCode, filterClassId, selectedDate]);

  useEffect(() => {
    if (studentsReady && filterClassId && selectedDate) fetchAttendance();
  }, [fetchAttendance, studentsReady, filterClassId, selectedDate]);

  // ── Mark individual student ──────────────────────────────────────────────────
  const markStudent = (studentId, status) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        time: status === "Present" || status === "Late" ? nowTime() : "",
      },
    }));
    setSaveStatus("");
  };

  const updateRemark = (studentId, remark) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], remark },
    }));
    setSaveStatus("");
  };

  // ── Bulk mark ────────────────────────────────────────────────────────────────
  const markAll = (status) => {
    const time = status === "Present" || status === "Late" ? nowTime() : "";
    const next = {};
    students.forEach((s) => {
      next[s.id] = { ...attendance[s.id], status, time };
    });
    setAttendance((prev) => ({ ...prev, ...next }));
    setSaveStatus("");
  };

  // ── Save to Firestore ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!filterClassId || !selectedDate) return;
    setSaving(true);
    setSaveStatus("");

    try {
      const docId = attendanceDocId(schoolCode, filterClassId, selectedDate);
      await setDoc(doc(db, "attendance", docId), {
        schoolCode,
        classId:   filterClassId,
        className: selectedClass?.name || "",
        date:      selectedDate,
        teacherId: userId,
        records:   attendance,
        savedAt:   serverTimestamp(),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 3500);
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  // ── CSV Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ["Student Code", "Name", "Status", "Time", "Remark"],
      ...filtered.map((s) => {
        const r = attendance[s.id] || {};
        return [s.studentCode, fullName(s), r.status || "Unmarked", r.time || "—", r.remark || ""];
      }),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${v ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url,
      download: `attendance_${selectedClass?.name || "class"}_${selectedDate}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived stats ────────────────────────────────────────────────────────────
  const filtered = students.filter((s) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      fullName(s).toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q)
    );
  });

  const presentCount  = students.filter((s) => attendance[s.id]?.status === "Present").length;
  const lateCount     = students.filter((s) => attendance[s.id]?.status === "Late").length;
  const absentCount   = students.filter((s) => attendance[s.id]?.status === "Absent").length;
  const unmarkedCount = students.filter((s) => !attendance[s.id]?.status).length;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Take Attendance
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            {isLoading
              ? "Loading…"
              : noAssignment
              ? "No classes assigned yet"
              : selectedClass
              ? `${selectedClass.name} · ${fmtDate(selectedDate)}`
              : "Select a class"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchStudents();
            }}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0 || isLoading}
            className="flex items-center gap-2 px-4 py-2.5 border border-[#0F2044]/20 hover:border-[#0F2044] rounded-2xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#0F2044]"
          >
            <Download size={15} /> Export
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isLoading || students.length === 0}
            className="flex items-center gap-2 bg-[#0F2044] hover:bg-black text-white px-6 py-2.5 rounded-2xl font-medium disabled:opacity-60 transition-all text-sm"
          >
            {saving ? <Spinner size={16} /> : <Save size={16} />}
            {saving ? "Saving…" : "Save Attendance"}
          </button>
        </div>
      </div>

      {/* ── Save feedback ────────────────────────────────────────────────────── */}
      {saveStatus === "saved" && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 px-5 py-3 rounded-2xl text-sm">
          <CheckCircle size={16} />
          Attendance saved successfully for {selectedClass?.name} on {fmtDate(selectedDate)}.
        </div>
      )}
      {saveStatus === "error" && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-2xl text-sm">
          <AlertCircle size={16} />
          Failed to save attendance. Please try again.
        </div>
      )}

      {/* ── No assignments ───────────────────────────────────────────────────── */}
      {noAssignment && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          No classes have been assigned to you yet. Ask your head teacher to assign classes
          from the Staff Management page.
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Summary cards ────────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Present",  value: presentCount,  Icon: CheckCircle, color: "text-emerald-600", cardBg: "bg-emerald-50 border-emerald-100" },
            { label: "Absent",   value: absentCount,   Icon: XCircle,     color: "text-red-600",     cardBg: "bg-red-50 border-red-100" },
            { label: "Late",     value: lateCount,     Icon: Clock,       color: "text-amber-500",   cardBg: "bg-amber-50 border-amber-100" },
            { label: "Total",    value: students.length, Icon: Users,     color: "text-[#0F2044]",   cardBg: "bg-white border-[#0F2044]/8" },
          ].map(({ label, value, Icon, color, cardBg }) => (
            <div key={label} className={`rounded-3xl p-5 border ${cardBg}`}>
              <div className="flex items-center gap-3">
                <Icon className={`w-7 h-7 ${color}`} />
                <div>
                  <p className={`text-2xl font-bold ${color}`}>
                    {isLoading ? <Spinner size={18} /> : value}
                  </p>
                  <p className="text-xs text-[#0F2044]/50">{label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      {!noAssignment && (
        <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4 items-end">
          {/* Class selector */}
          <div className="flex-1">
            <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">CLASS</label>
            <div className="relative">
              <select
                value={filterClassId}
                onChange={(e) => {
                  setFilterClassId(e.target.value);
                  setSaveStatus("");
                }}
                disabled={isLoading || classes.length === 0}
                className="w-full appearance-none pl-4 pr-10 py-3 bg-white border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044] disabled:opacity-50"
              >
                {classes.length === 0 && <option value="">No classes</option>}
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F2044]/40 pointer-events-none" />
            </div>
          </div>

          {/* Date picker */}
          <div className="flex-1">
            <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">DATE</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSaveStatus("");
              }}
              className="w-full px-4 py-3 border border-[#0F2044]/15 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/40 text-[#0F2044]"
            />
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">SEARCH</label>
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0F2044]/40" />
              <input
                type="text"
                placeholder="Name or student code…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl text-sm focus:outline-none focus:border-[#0F2044]/30"
              />
            </div>
          </div>

          {/* Bulk actions */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => markAll("Present")}
              disabled={students.length === 0 || isLoading}
              className="flex items-center gap-1.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-2xl transition-all disabled:opacity-40"
            >
              <CheckCircle size={14} /> All Present
            </button>
            <button
              onClick={() => markAll("Absent")}
              disabled={students.length === 0 || isLoading}
              className="flex items-center gap-1.5 px-4 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-2xl transition-all disabled:opacity-40"
            >
              <XCircle size={14} /> All Absent
            </button>
          </div>
        </div>
      )}

      {/* ── Attendance table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">

        {/* Table header bar */}
        <div className="px-6 py-4 bg-[#F7F5F0] border-b border-[#0F2044]/8 flex justify-between items-center">
          <div className="font-semibold text-[#0F2044] text-sm">
            {selectedClass ? `${selectedClass.name} · Roll Call` : "Roll Call"}
          </div>
          <div className="text-xs text-[#0F2044]/50">
            {isLoading
              ? "Loading…"
              : unmarkedCount > 0
              ? `${unmarkedCount} student${unmarkedCount !== 1 ? "s" : ""} unmarked`
              : students.length > 0
              ? "All students marked ✓"
              : ""}
          </div>
        </div>

        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-[#0F2044]/40">
            <Spinner size={28} />
            <p className="text-sm">Loading attendance…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-3 text-[#0F2044]/30">
            <Users size={36} />
            <p className="text-sm font-medium text-[#0F2044]/40">
              {students.length === 0
                ? `No students enrolled in ${selectedClass?.name || "this class"} yet.`
                : "No students match your search."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/8">
              <tr>
                {[
                  ["Student",      "text-left",   ""],
                  ["Student Code", "text-left",   "hidden md:table-cell"],
                  ["Status",       "text-center", ""],
                  ["Time",         "text-center", "hidden sm:table-cell"],
                  ["Remark",       "text-left",   "hidden lg:table-cell"],
                  ["Mark",         "text-center", ""],
                ].map(([label, align, hidden]) => (
                  <th
                    key={label}
                    className={`px-5 py-3.5 ${align} text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 ${hidden}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filtered.map((student) => {
                const record    = attendance[student.id] || {};
                const status    = record.status || "";
                const isFemale  = student.gender === "Female";
                const name      = fullName(student);
                const statusCfg = STATUS_CONFIG[status];

                return (
                  <tr
                    key={student.id}
                    className={`transition-colors ${
                      status === "Present" ? "hover:bg-emerald-50/40" :
                      status === "Late"    ? "hover:bg-amber-50/40" :
                      status === "Absent"  ? "hover:bg-red-50/30" :
                      "hover:bg-[#FAFAF8]"
                    }`}
                  >
                    {/* Name + avatar */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${isFemale ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                          {initials(name)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#0F2044]">{name}</div>
                          <div className="text-xs text-[#0F2044]/40">{student.dob || ""}</div>
                        </div>
                      </div>
                    </td>

                    {/* Student code */}
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="font-mono text-xs font-bold text-[#0F2044]/70 bg-[#F7F5F0] px-2.5 py-1 rounded-lg border border-[#0F2044]/10 tracking-widest">
                        {student.studentCode}
                      </span>
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-3.5 text-center">
                      {status ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ${statusCfg.bg} ${statusCfg.text}`}>
                          {status === "Present" && <CheckCircle size={11} />}
                          {status === "Late"    && <Clock size={11} />}
                          {status === "Absent"  && <XCircle size={11} />}
                          {status}
                        </span>
                      ) : (
                        <span className="inline-block text-xs font-medium px-3 py-1.5 rounded-xl bg-[#F7F5F0] text-[#0F2044]/35">
                          Unmarked
                        </span>
                      )}
                    </td>

                    {/* Time */}
                    <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                      <span className="text-xs text-[#0F2044]/60 font-mono">
                        {record.time || "—"}
                      </span>
                    </td>

                    {/* Remark */}
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <input
                        type="text"
                        placeholder="Add remark…"
                        value={record.remark || ""}
                        onChange={(e) => updateRemark(student.id, e.target.value)}
                        className="w-full bg-transparent border border-transparent focus:border-[#0F2044]/20 focus:bg-[#F7F5F0] rounded-xl px-3 py-1.5 text-xs outline-none transition-all placeholder:text-[#0F2044]/25 text-[#0F2044]/70"
                      />
                    </td>

                    {/* Mark buttons */}
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {["Present", "Late", "Absent"].map((s) => {
                          const cfg    = STATUS_CONFIG[s];
                          const active = status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => markStudent(student.id, s)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                                active
                                  ? `${cfg.activeBg} ${cfg.activeText}`
                                  : `${cfg.bg} ${cfg.text} hover:opacity-80`
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Unmarked warning ─────────────────────────────────────────────────── */}
      {!isLoading && unmarkedCount > 0 && students.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {unmarkedCount} student{unmarkedCount !== 1 ? "s are" : " is"} still unmarked.
          Save will record them with no status. Consider using "All Present" or "All Absent" to bulk-mark first.
        </div>
      )}

      <p className="text-center text-xs text-[#0F2044]/40 pt-1">
        Attendance is saved per class per date and synced with the Admin Dashboard.
        Past records can be reloaded by selecting a previous date.
      </p>
    </div>
  );
}