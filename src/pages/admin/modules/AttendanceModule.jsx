import { useState } from "react";
import { Users, CheckCircle, XCircle, Clock, Download, Filter } from "lucide-react";

export default function AttendanceModule() {
  const [selectedDate, setSelectedDate] = useState("2026-03-27");
  const [selectedClass, setSelectedClass] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const [attendanceData, setAttendanceData] = useState([
    { id: "STU-001", name: "John Phiri", class: "Form 3A", status: "Present", time: "07:25", remark: "" },
    { id: "STU-002", name: "Mary Banda", class: "Form 2B", status: "Present", time: "07:30", remark: "" },
    { id: "STU-003", name: "Blessing Mwale", class: "Form 3A", status: "Absent", time: "", remark: "Sick" },
    { id: "STU-004", name: "Chisomo Kumwenda", class: "Form 1C", status: "Late", time: "08:05", remark: "" },
    { id: "STU-005", name: "Peter Banda", class: "Form 4A", status: "Present", time: "07:28", remark: "" },
  ]);

  const filteredData = attendanceData.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         student.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClass === "All" || student.class === selectedClass;
    return matchesSearch && matchesClass;
  });

  const presentCount = filteredData.filter(s => s.status === "Present").length;
  const absentCount = filteredData.filter(s => s.status === "Absent").length;
  const lateCount = filteredData.filter(s => s.status === "Late").length;

  const markAttendance = (id, newStatus) => {
    setAttendanceData(prev => 
      prev.map(student => 
        student.id === id ? { ...student, status: newStatus, time: newStatus === "Present" ? "07:35" : "" } : student
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-app-text" style={{ fontFamily: "'Playfair Display', serif" }}>
            Attendance Management
          </h2>
          <p className="text-app-text/60">Daily attendance tracking • Boarding & Day students</p>
        </div>
        <button className="flex items-center gap-2 bg-app-primary text-white px-6 py-3 rounded-2xl font-medium">
          <Download className="w-5 h-5" /> Export Report
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-app-surface rounded-3xl p-6 border border-app-border">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-3xl font-bold text-emerald-600">{presentCount}</p>
              <p className="text-sm text-app-text/60">Present Today</p>
            </div>
          </div>
        </div>
        <div className="bg-app-surface rounded-3xl p-6 border border-app-border">
          <div className="flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-3xl font-bold text-red-600">{absentCount}</p>
              <p className="text-sm text-app-text/60">Absent Today</p>
            </div>
          </div>
        </div>
        <div className="bg-app-surface rounded-3xl p-6 border border-app-border">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-3xl font-bold text-amber-600">{lateCount}</p>
              <p className="text-sm text-app-text/60">Late Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-app-surface rounded-3xl p-5 border border-app-border flex flex-col md:flex-row gap-4">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-5 py-3 border border-app-border rounded-2xl"
        />
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="px-5 py-3 border border-app-border rounded-2xl"
        >
          <option value="All">All Classes</option>
          <option value="Form 1C">Form 1C</option>
          <option value="Form 2B">Form 2B</option>
          <option value="Form 3A">Form 3A</option>
          <option value="Form 4A">Form 4A</option>
        </select>

        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-5 pr-4 py-3 bg-[#FAFAF8] border border-app-border rounded-2xl focus:border-[#F4B400]"
          />
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-app-bg">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">STUDENT ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">NAME</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">CLASS</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-app-text/60">STATUS</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">TIME</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">REMARK</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-app-text/60">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredData.map(student => (
              <tr key={student.id} className="hover:bg-[#FAFAF8]">
                <td className="px-6 py-5 font-mono">{student.id}</td>
                <td className="px-6 py-5 font-medium">{student.name}</td>
                <td className="px-6 py-5">{student.class}</td>
                <td className="px-6 py-5 text-center">
                  <span className={`inline-block px-4 py-1 text-xs font-medium rounded-full
                    ${student.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 
                      student.status === 'Absent' ? 'bg-red-100 text-red-700' : 
                      'bg-amber-100 text-amber-700'}`}>
                    {student.status}
                  </span>
                </td>
                <td className="px-6 py-5 text-sm">{student.time || '-'}</td>
                <td className="px-6 py-5 text-sm text-app-text/70">{student.remark || '-'}</td>
                <td className="px-6 py-5">
                  <div className="flex justify-center gap-2">
                    <button onClick={() => markAttendance(student.id, "Present")} className="px-3 py-1 text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl">Present</button>
                    <button onClick={() => markAttendance(student.id, "Absent")} className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-xl">Absent</button>
                    <button onClick={() => markAttendance(student.id, "Late")} className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl">Late</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}