// modules/AttendanceModule.jsx
import { useState } from "react";
import {
  Users, AlertTriangle, Download, X
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const CLASSES = [
  "Form 1A", "Form 1B", "Form 1C",
  "Form 2A", "Form 2B",
  "Form 3A", "Form 3B",
  "Form 4A", "Form 4B",
];

const HOUSES = ["Chimutu House", "Mulanje House", "Zomba House", "Sapitwa House"];

const classAttendanceData = {
  "Form 3A": [
    { id: 1, studentId: "SS24001", name: "Chisomo Banda",     status: "Present", time: "08:05", reason: "" },
    { id: 2, studentId: "SS24002", name: "Amina Phiri",       status: "Present", time: "08:00", reason: "" },
    { id: 3, studentId: "SS24003", name: "Kelvin Mwale",      status: "Late",    time: "08:25", reason: "Traffic" },
    { id: 4, studentId: "SS24004", name: "Blessings Nyirenda",status: "Absent",  time: "--",    reason: "Sick — reported by parent" },
    { id: 5, studentId: "SS24005", name: "Tawonga Manda",     status: "Present", time: "07:58", reason: "" },
    { id: 6, studentId: "SS24006", name: "Kondwani Tembo",    status: "Present", time: "08:02", reason: "" },
  ],
  "Form 4A": [
    { id: 7,  studentId: "SS24010", name: "Grace Phiri",      status: "Present", time: "07:55", reason: "" },
    { id: 8,  studentId: "SS24011", name: "Lyton Chirwa",     status: "Absent",  time: "--",    reason: "Funeral — letter submitted" },
    { id: 9,  studentId: "SS24012", name: "Fatuma Nkosi",     status: "Present", time: "08:03", reason: "" },
    { id: 10, studentId: "SS24013", name: "Dalitso Banda",    status: "Late",    time: "08:32", reason: "Bus delay" },
  ],
  "Form 2B": [
    { id: 11, studentId: "SS24020", name: "Mercy Kumwenda",   status: "Present", time: "08:01", reason: "" },
    { id: 12, studentId: "SS24021", name: "Taonga Mwale",     status: "Present", time: "07:59", reason: "" },
    { id: 13, studentId: "SS24022", name: "Yusuf Phiri",      status: "Absent",  time: "--",    reason: "No reason provided" },
    { id: 14, studentId: "SS24023", name: "Mphatso Tembo",    status: "Present", time: "08:07", reason: "" },
  ],
};

// Fill remaining classes with generated data
CLASSES.forEach((cls) => {
  if (!classAttendanceData[cls]) {
    classAttendanceData[cls] = [
      { id: Math.random(), studentId: "SS240XX", name: "Sample Student A", status: "Present", time: "08:01", reason: "" },
      { id: Math.random(), studentId: "SS240XY", name: "Sample Student B", status: "Present", time: "08:04", reason: "" },
    ];
  }
});

const boardingData = [
  { id: 1,  name: "Chisomo Banda",     house: "Chimutu House",  status: "Present", time: "21:45", reason: "" },
  { id: 2,  name: "Amina Phiri",       house: "Chimutu House",  status: "Present", time: "21:40", reason: "" },
  { id: 3,  name: "Kelvin Mwale",      house: "Mulanje House",  status: "Absent",  time: "--",    reason: "In sick bay — matron confirmed" },
  { id: 4,  name: "Blessings Nyirenda",house: "Chimutu House",  status: "Present", time: "21:50", reason: "" },
  { id: 5,  name: "Tawonga Manda",     house: "Zomba House",    status: "Present", time: "21:42", reason: "" },
  { id: 6,  name: "Kondwani Tembo",    house: "Mulanje House",  status: "Present", time: "21:38", reason: "" },
  { id: 7,  name: "Grace Phiri",       house: "Sapitwa House",  status: "Absent",  time: "--",    reason: "No reason — under investigation" },
  { id: 8,  name: "Mercy Kumwenda",    house: "Zomba House",    status: "Present", time: "21:44", reason: "" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  Present: "bg-emerald-100 text-emerald-700",
  Late:    "bg-amber-100 text-amber-700",
  Absent:  "bg-red-100 text-red-700",
};

function ReasonModal({ student, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-8">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-[#0F2044]">{student.name}</h3>
            <p className="text-sm text-[#0F2044]/50 mt-0.5">
              {student.studentId || student.house} &bull;{" "}
              <span className={`font-medium ${student.status === "Absent" ? "text-red-600" : "text-amber-600"}`}>
                {student.status}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F7F5F0] rounded-xl">
            <X className="w-5 h-5 text-[#0F2044]/40" />
          </button>
        </div>

        <div className="bg-[#F7F5F0] rounded-2xl px-5 py-4 border border-[#0F2044]/5">
          <p className="text-xs text-[#0F2044]/50 mb-1">Reason on record</p>
          <p className="text-sm text-[#0F2044] leading-relaxed">
            {student.reason || "No reason provided."}
          </p>
        </div>

        {student.time && student.time !== "--" && (
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

export default function AttendanceModule() {
  const [activeTab, setActiveTab]       = useState("class");
  const [selectedClass, setSelectedClass] = useState("Form 3A");
  const [filterHouse, setFilterHouse]   = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [viewingStudent, setViewingStudent] = useState(null);

  // ── Class tab ──
  const classStudents = classAttendanceData[selectedClass] || [];
  const filteredClass = classStudents.filter(
    (s) => filterStatus === "All" || s.status === filterStatus
  );

  const presentC = classStudents.filter((s) => s.status === "Present").length;
  const lateC    = classStudents.filter((s) => s.status === "Late").length;
  const absentC  = classStudents.filter((s) => s.status === "Absent").length;

  // ── Boarding tab ──
  const filteredBoarding = boardingData.filter((s) => {
    const mHouse  = filterHouse  === "All" || s.house  === filterHouse;
    const mStatus = filterStatus === "All" || s.status === filterStatus;
    return mHouse && mStatus;
  });

  const presentB = boardingData.filter((s) => s.status === "Present").length;
  const absentB  = boardingData.filter((s) => s.status === "Absent").length;

  // Reset filters on tab switch
  const switchTab = (tab) => {
    setActiveTab(tab);
    setFilterStatus("All");
    setFilterHouse("All");
  };

  // Fake export
  const handleExport = () => {
    alert(
      activeTab === "class"
        ? `Exporting daily attendance for ${selectedClass} — Thursday, 16 April 2026`
        : "Exporting boarding roll-call report — Thursday, 16 April 2026"
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Attendance
          </h2>
          <p className="text-[#0F2044]/60 mt-1">Term 2 &bull; Thursday, 16 April 2026</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a3060] transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Export daily report
        </button>
      </div>

      {/* Tabs */}
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

      {/* ── CLASS ATTENDANCE ────────────────────────────────── */}
      {activeTab === "class" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-[#0F2044]/60">Total</p>
              <p className="text-4xl font-bold text-[#0F2044] mt-2">{classStudents.length}</p>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-emerald-600">Present</p>
              <p className="text-4xl font-bold text-emerald-600 mt-2">{presentC}</p>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-amber-600">Late</p>
              <p className="text-4xl font-bold text-amber-600 mt-2">{lateC}</p>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-red-600">Absent</p>
              <p className="text-4xl font-bold text-red-600 mt-2">{absentC}</p>
            </div>
          </div>

          {/* Filters row */}
          <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-[#0F2044]/40" />
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-lg font-semibold bg-transparent focus:outline-none text-[#0F2044] pr-2"
              >
                {CLASSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="ml-auto flex gap-3">
              {["All", "Present", "Late", "Absent"].map((s) => (
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
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Adm. No.</th>
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Student name</th>
                  <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Status</th>
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Time</th>
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {filteredClass.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-[#0F2044]/40 text-sm">
                      No records match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredClass.map((student) => (
                    <tr key={student.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                      <td className="p-5 font-mono text-xs text-[#0F2044]/60">{student.studentId}</td>
                      <td className="p-5 font-medium text-sm text-[#0F2044]">{student.name}</td>
                      <td className="p-5 text-center">
                        <span className={`inline-block px-4 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[student.status]}`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="p-5 text-sm text-[#0F2044]/60 font-mono">{student.time}</td>
                      <td className="p-5">
                        {student.status !== "Present" ? (
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
      )}

      {/* ── BOARDING ROLL-CALL ───────────────────────────────── */}
      {activeTab === "boarding" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-[#0F2044]/60">Total boarders</p>
              <p className="text-4xl font-bold text-[#0F2044] mt-2">{boardingData.length}</p>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-emerald-600">Accounted for</p>
              <p className="text-4xl font-bold text-emerald-600 mt-2">{presentB}</p>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
              <p className="text-sm text-red-600">Absent / unaccounted</p>
              <p className="text-4xl font-bold text-red-600 mt-2">{absentB}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-medium text-[#0F2044]/70">
                Evening roll-call &bull; 21:30
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
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Student name</th>
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">House</th>
                  <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Status</th>
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Time marked</th>
                  <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Reason</th>
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
      )}

      {/* Reason modal */}
      {viewingStudent && (
        <ReasonModal student={viewingStudent} onClose={() => setViewingStudent(null)} />
      )}
    </div>
  );
}