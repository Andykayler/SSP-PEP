// modules/AttendanceModule.jsx  (Head Teacher / Admin view)
// Reads live Firestore attendance records written by teachers via the teacher AttendanceModule.

import { useState, useEffect, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "firebase/firestore";
import {
  Users, AlertTriangle, Download, X, CheckCircle,
  XCircle, Clock, RefreshCw, Loader2, ChevronDown,
  Search, AlertCircle,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-[#0F2044]/40 inline-block" />;
}

function fullName(s) {
  return s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.name || "—";
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
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// Must match the teacher module's doc-ID scheme exactly
function attendanceDocId(schoolCode, classId, date) {
  return `${schoolCode}_${classId}_${date}`;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  Present: "bg-emerald-100 text-emerald-700",
  Late:    "bg-amber-100  text-amber-700",
  Absent:  "bg-red-100    text-red-700",
};

const STATUS_ROW_BG = {
  Present: "hover:bg-emerald-50/40",
  Late:    "hover:bg-amber-50/40",
  Absent:  "hover:bg-red-50/30",
};

const HOUSES = ["Chimutu House", "Mulanje House", "Zomba House", "Sapitwa House"];

// ─── Reason Modal ─────────────────────────────────────────────────────────────

function ReasonModal({ student, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-[#0F2044]">{fullName(student)}</h3>
            <p className="text-sm text-[#0F2044]/50 mt-0.5">
              {student.studentCode || student.house || ""}{" "}
              {student.studentCode || student.house ? "·" : ""}
              {" "}
              <span className={`font-medium ${
                student.status === "Absent" ? "text-red-600" :
                student.status === "Late"   ? "text-amber-600" :
                "text-emerald-600"
              }`}>
                {student.status || "Unmarked"}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F7F5F0] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#0F2044]/40" />
          </button>
        </div>

        <div className="bg-[#F7F5F0] rounded-2xl px-5 py-4 border border-[#0F2044]/5">
          <p className="text-xs text-[#0F2044]/50 mb-1">Reason on record</p>
          <p className="text-sm text-[#0F2044] leading-relaxed">
            {student.remark || student.reason || "No reason provided."}
          </p>
        </div>

        {student.time && student.time !== "--" && student.time !== "" && (
          <p className="text-xs text-[#0F2044]/40 mt-4 text-center">
            Time marked: {student.time}
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full py-3 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0] transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttendanceModule({ schoolCode }) {
  const [activeTab,     setActiveTab]     = useState("class");
  const [selectedDate,  setSelectedDate]  = useState(todayISO());
  const [classes,       setClasses]       = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students,      setStudents]      = useState([]);
  const [attendance,    setAttendance]    = useState({}); // { studentId: { status, time, remark } }
  const [searchTerm,    setSearchTerm]    = useState("");
  const [filterStatus,  setFilterStatus]  = useState("All");
  const [filterHouse,   setFilterHouse]   = useState("All");
  const [viewingStudent, setViewingStudent] = useState(null);
  const [lastSavedAt,   setLastSavedAt]   = useState(null);

  const [classesReady,    setClassesReady]    = useState(false);
  const [studentsReady,   setStudentsReady]   = useState(false);
  const [attendanceReady, setAttendanceReady] = useState(false);
  const [error,           setError]           = useState("");

  const isLoading = !classesReady || !studentsReady || !attendanceReady;
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // ── Step 1: Load all classes for the school ──────────────────────────────────
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;

    (async () => {
      setClassesReady(false);
      setStudentsReady(false);
      setAttendanceReady(false);
      setError("");

      try {
        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;

        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        setClasses(list);
        setClassesReady(true);

        if (list.length > 0) {
          setSelectedClassId(list[0].id);
        } else {
          setStudentsReady(true);
          setAttendanceReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        setError("Could not load classes.");
        setClassesReady(true);
        setStudentsReady(true);
        setAttendanceReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [schoolCode]);

  // ── Step 2: Load students for selected class ─────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!schoolCode || !selectedClassId) return;
    setStudentsReady(false);
    setAttendanceReady(false);

    try {
      const snap = await getDocs(
        query(
          collection(db, "students"),
          where("schoolCode", "==", schoolCode),
          where("classId",   "==", selectedClassId)
        )
      );
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""));
      setStudents(list);
    } catch (err) {
      setError(`Could not load students: ${err.message}`);
    } finally {
      setStudentsReady(true);
    }
  }, [schoolCode, selectedClassId]);

  useEffect(() => {
    if (classesReady && selectedClassId) fetchStudents();
  }, [fetchStudents, classesReady, selectedClassId]);

  // ── Step 3: Load attendance record written by teacher ────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!schoolCode || !selectedClassId || !selectedDate) return;
    setAttendanceReady(false);

    try {
      const docId   = attendanceDocId(schoolCode, selectedClassId, selectedDate);
      const docSnap = await getDoc(doc(db, "attendance", docId));

      if (docSnap.exists()) {
        setAttendance(docSnap.data().records ?? {});
        setLastSavedAt(docSnap.data().savedAt?.toDate?.() ?? null);
      } else {
        setAttendance({});
        setLastSavedAt(null);
      }
    } catch (err) {
      setAttendance({});
      setLastSavedAt(null);
    } finally {
      setAttendanceReady(true);
    }
  }, [schoolCode, selectedClassId, selectedDate]);

  useEffect(() => {
    if (studentsReady && selectedClassId && selectedDate) fetchAttendance();
  }, [fetchAttendance, studentsReady, selectedClassId, selectedDate]);

  // ── Reset filters on tab switch ───────────────────────────────────────────────
  const switchTab = (tab) => {
    setActiveTab(tab);
    setFilterStatus("All");
    setFilterHouse("All");
    setSearchTerm("");
  };

  // ── Merge students with their attendance records ──────────────────────────────
  const studentsWithRecords = students.map((s) => ({
    ...s,
    record: attendance[s.id] || {},
  }));

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = studentsWithRecords.filter((s) => {
    const matchStatus = filterStatus === "All"
      || (filterStatus === "Unmarked" ? !s.record.status : s.record.status === filterStatus);
    const matchSearch = !searchTerm
      || fullName(s).toLowerCase().includes(searchTerm.toLowerCase())
      || s.studentCode?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const presentCount  = studentsWithRecords.filter((s) => s.record.status === "Present").length;
  const lateCount     = studentsWithRecords.filter((s) => s.record.status === "Late").length;
  const absentCount   = studentsWithRecords.filter((s) => s.record.status === "Absent").length;
  const unmarkedCount = studentsWithRecords.filter((s) => !s.record.status).length;
  const attendanceRate = students.length > 0
    ? Math.round(((presentCount + lateCount) / students.length) * 100)
    : 0;

  // ── CSV export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (activeTab === "class") {
      const rows = [
        ["Student Code", "Name", "Status", "Time", "Remark"],
        ...studentsWithRecords.map((s) => [
          s.studentCode || "",
          fullName(s),
          s.record.status || "Unmarked",
          s.record.time  || "—",
          s.record.remark || "",
        ]),
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
    } else {
      alert("Exporting boarding roll-call report — " + fmtDate(selectedDate));
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Attendance
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            {fmtDate(selectedDate)}
            {lastSavedAt && (
              <span className="ml-2 text-[#0F2044]/40 text-xs">
                · Last saved {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchStudents(); }}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#0F2044]/10 rounded-xl hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/60 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleExport}
            disabled={students.length === 0 || isLoading}
            className="flex items-center gap-2 bg-[#0F2044] text-white px-5 py-2.5 rounded-2xl hover:bg-black transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export report
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#F7F5F0] p-1 rounded-2xl w-fit">
        {[
          { key: "class",    label: "Class attendance" },
          { key: "boarding", label: "Boarding roll-call" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors
              ${activeTab === key
                ? "bg-white text-[#0F2044] shadow-sm"
                : "text-[#0F2044]/60 hover:text-[#0F2044]"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          CLASS ATTENDANCE TAB — live Firestore data
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "class" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Total",    value: students.length, color: "text-[#0F2044]",   bg: "bg-white border-[#0F2044]/8", Icon: Users },
              { label: "Present",  value: presentCount,    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", Icon: CheckCircle },
              { label: "Late",     value: lateCount,       color: "text-amber-500",   bg: "bg-amber-50 border-amber-100",   Icon: Clock },
              { label: "Absent",   value: absentCount,     color: "text-red-600",     bg: "bg-red-50 border-red-100",       Icon: XCircle },
              { label: "Attendance rate", value: isLoading ? null : `${attendanceRate}%`, color: attendanceRate >= 80 ? "text-emerald-600" : "text-red-500", bg: "bg-white border-[#0F2044]/8", Icon: null },
            ].map(({ label, value, color, bg, Icon }) => (
              <div key={label} className={`rounded-3xl p-5 border ${bg}`}>
                <div className="flex items-center gap-3">
                  {Icon && <Icon className={`w-6 h-6 ${color} flex-shrink-0`} />}
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

          {/* No record notice */}
          {!isLoading && lastSavedAt === null && students.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              No attendance has been submitted for <strong>{selectedClass?.name}</strong> on{" "}
              <strong>{fmtDate(selectedDate)}</strong> yet. The teacher may not have taken attendance.
            </div>
          )}

          {/* Unmarked warning */}
          {!isLoading && lastSavedAt !== null && unmarkedCount > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {unmarkedCount} student{unmarkedCount !== 1 ? "s are" : " is"} still unmarked in the
              teacher's record for this session.
            </div>
          )}

          {/* Filters row */}
          <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4 items-end">
            {/* Class selector */}
            <div className="flex-1">
              <label className="block text-[10px] font-bold tracking-widest text-[#0F2044]/50 mb-1.5">CLASS</label>
              <div className="relative">
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setFilterStatus("All");
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
                onChange={(e) => setSelectedDate(e.target.value)}
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

            {/* Status filter */}
            <div className="flex gap-2 flex-wrap shrink-0">
              {["All", "Present", "Late", "Absent", "Unmarked"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-colors
                    ${filterStatus === s
                      ? "bg-[#0F2044] text-white border-[#0F2044]"
                      : "border-[#0F2044]/15 text-[#0F2044]/60 hover:border-[#0F2044]/30"
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Attendance table */}
          <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
            <div className="px-6 py-4 bg-[#F7F5F0] border-b border-[#0F2044]/8 flex justify-between items-center">
              <div className="font-semibold text-[#0F2044] text-sm">
                {selectedClass ? `${selectedClass.name} · Roll Call` : "Roll Call"}
              </div>
              <div className="text-xs text-[#0F2044]/50">
                {isLoading ? "Loading…" : `${filtered.length} student${filtered.length !== 1 ? "s" : ""}`}
              </div>
            </div>

            {isLoading ? (
              <div className="py-24 flex flex-col items-center gap-3 text-[#0F2044]/40">
                <Spinner size={28} />
                <p className="text-sm">Loading attendance records…</p>
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
                    const rec    = student.record;
                    const status = rec.status || "";
                    const name   = fullName(student);
                    const isFemale = student.gender === "Female";

                    return (
                      <tr
                        key={student.id}
                        className={`transition-colors ${STATUS_ROW_BG[status] || "hover:bg-[#FAFAF8]"}`}
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
                            {student.studentCode || "—"}
                          </span>
                        </td>

                        {/* Status badge */}
                        <td className="px-5 py-3.5 text-center">
                          {status ? (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ${STATUS_BADGE[status]}`}>
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
                            {rec.time || "—"}
                          </span>
                        </td>

                        {/* Remark — read-only, click to view */}
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          {rec.remark ? (
                            <button
                              onClick={() => setViewingStudent({ ...student, ...rec })}
                              className="text-xs text-[#0F2044]/60 hover:text-[#0F2044] transition-colors underline underline-offset-2 text-left"
                            >
                              {rec.remark}
                            </button>
                          ) : status && status !== "Present" ? (
                            <button
                              onClick={() => setViewingStudent({ ...student, ...rec })}
                              className="text-xs text-[#0F2044]/30 hover:text-[#0F2044]/60 transition-colors"
                            >
                              No remark — view
                            </button>
                          ) : (
                            <span className="text-xs text-[#0F2044]/25">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          BOARDING ROLL-CALL TAB — static / manual data (unchanged)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "boarding" && (
        <BoardingTab
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          filterHouse={filterHouse}
          setFilterHouse={setFilterHouse}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          setViewingStudent={setViewingStudent}
        />
      )}

      {/* Reason modal */}
      {viewingStudent && (
        <ReasonModal student={viewingStudent} onClose={() => setViewingStudent(null)} />
      )}

      <p className="text-center text-xs text-[#0F2044]/40 pt-1">
        Showing live attendance data submitted by class teachers.
        Select a previous date to view historical records.
      </p>
    </div>
  );
}

// ─── Boarding Tab (static data, unchanged from original) ──────────────────────

const boardingData = [
  { id: 1,  name: "Chisomo Banda",      house: "Chimutu House",  status: "Present", time: "21:45", reason: "" },
  { id: 2,  name: "Amina Phiri",        house: "Chimutu House",  status: "Present", time: "21:40", reason: "" },
  { id: 3,  name: "Kelvin Mwale",       house: "Mulanje House",  status: "Absent",  time: "--",    reason: "In sick bay — matron confirmed" },
  { id: 4,  name: "Blessings Nyirenda", house: "Chimutu House",  status: "Present", time: "21:50", reason: "" },
  { id: 5,  name: "Tawonga Manda",      house: "Zomba House",    status: "Present", time: "21:42", reason: "" },
  { id: 6,  name: "Kondwani Tembo",     house: "Mulanje House",  status: "Present", time: "21:38", reason: "" },
  { id: 7,  name: "Grace Phiri",        house: "Sapitwa House",  status: "Absent",  time: "--",    reason: "No reason — under investigation" },
  { id: 8,  name: "Mercy Kumwenda",     house: "Zomba House",    status: "Present", time: "21:44", reason: "" },
];

function BoardingTab({
  selectedDate, setSelectedDate,
  filterHouse, setFilterHouse,
  filterStatus, setFilterStatus,
  setViewingStudent,
}) {
  const filteredBoarding = boardingData.filter((s) => {
    const mHouse  = filterHouse  === "All" || s.house  === filterHouse;
    const mStatus = filterStatus === "All" || s.status === filterStatus;
    return mHouse && mStatus;
  });

  const presentB = boardingData.filter((s) => s.status === "Present").length;
  const absentB  = boardingData.filter((s) => s.status === "Absent").length;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Total boarders</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-2">{boardingData.length}</p>
        </div>
        <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
          <p className="text-sm text-emerald-600">Accounted for</p>
          <p className="text-4xl font-bold text-emerald-600 mt-2">{presentB}</p>
        </div>
        <div className="bg-red-50 rounded-3xl p-6 border border-red-100">
          <p className="text-sm text-red-600">Absent / unaccounted</p>
          <p className="text-4xl font-bold text-red-600 mt-2">{absentB}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-medium text-[#0F2044]/70">
            Evening roll-call · 21:30
          </p>
        </div>

        <div className="ml-auto flex flex-wrap gap-3">
          <select
            value={filterHouse}
            onChange={(e) => setFilterHouse(e.target.value)}
            className="px-4 py-2 border border-[#0F2044]/10 rounded-xl text-sm focus:outline-none bg-white text-[#0F2044]/70"
          >
            <option value="All">All houses</option>
            {HOUSES.map((h) => <option key={h}>{h}</option>)}
          </select>

          {["All", "Present", "Absent"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors
                ${filterStatus === s
                  ? "bg-[#0F2044] text-white border-[#0F2044]"
                  : "border-[#0F2044]/15 text-[#0F2044]/60 hover:border-[#0F2044]/30"
                }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <table className="w-full">
          <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/8">
            <tr>
              {["Student name", "House", "Status", "Time marked", "Reason"].map((h, i) => (
                <th key={h} className={`p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide ${i === 2 ? "text-center" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0F2044]/5">
            {filteredBoarding.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-[#0F2044]/40 text-sm">
                  No records match this filter.
                </td>
              </tr>
            ) : (
              filteredBoarding.map((student) => (
                <tr key={student.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                  <td className="p-5 font-medium text-sm text-[#0F2044]">{student.name}</td>
                  <td className="p-5 text-sm text-[#0F2044]/60">{student.house}</td>
                  <td className="p-5 text-center">
                    <span className={`inline-block px-4 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[student.status]}`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="p-5 text-sm text-[#0F2044]/60 font-mono">{student.time}</td>
                  <td className="p-5">
                    {student.status === "Absent" ? (
                      <button
                        onClick={() => setViewingStudent(student)}
                        className="flex items-center gap-1.5 text-sm text-[#0F2044]/60 hover:text-[#0F2044] transition-colors underline underline-offset-2"
                      >
                        {student.reason || "No reason — view"}
                      </button>
                    ) : (
                      <span className="text-sm text-[#0F2044]/30">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}