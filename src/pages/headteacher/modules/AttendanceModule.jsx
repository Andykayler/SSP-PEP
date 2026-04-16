// modules/AttendanceModule.jsx
import { useState } from "react";
import { Calendar, CheckCircle, XCircle, Clock, Users, AlertTriangle, Download } from "lucide-react";

const dummyClassAttendance = [
  {
    id: 1,
    studentId: "SS24001",
    name: "Chisomo Banda",
    form: "Form 3A",
    status: "Present",
    time: "08:05",
    remark: ""
  },
  {
    id: 2,
    studentId: "SS24002",
    name: "Amina Phiri",
    form: "Form 3A",
    status: "Present",
    time: "08:00",
    remark: ""
  },
  {
    id: 3,
    studentId: "SS24003",
    name: "Kelvin Mwale",
    form: "Form 3A",
    status: "Late",
    time: "08:25",
    remark: "Traffic"
  },
  {
    id: 4,
    studentId: "SS24005",
    name: "Blessings Nyirenda",
    form: "Form 3A",
    status: "Absent",
    time: "--",
    remark: "Sick"
  },
  {
    id: 5,
    studentId: "SS24006",
    name: "Tawonga Manda",
    form: "Form 3A",
    status: "Present",
    time: "07:58",
    remark: ""
  },
];

const boardingRollCall = [
  { id: 1, name: "Chisomo Banda", house: "Chimutu House", status: "Present", time: "21:45" },
  { id: 2, name: "Amina Phiri", house: "Chimutu House", status: "Present", time: "21:40" },
  { id: 3, name: "Kelvin Mwale", house: "Mulanje House", status: "Absent", time: "--" },
  { id: 4, name: "Blessings Nyirenda", house: "Chimutu House", status: "Present", time: "21:50" },
];

export default function AttendanceModule() {
  const [activeTab, setActiveTab] = useState("class"); // "class" or "boarding"
  const [selectedClass, setSelectedClass] = useState("Form 3A - Mathematics");
  const [attendance, setAttendance] = useState(dummyClassAttendance);

  const markAttendance = (id, newStatus) => {
    setAttendance(prev =>
      prev.map(student =>
        student.id === id ? { ...student, status: newStatus, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : student
      )
    );
  };

  const presentCount = attendance.filter(s => s.status === "Present").length;
  const lateCount = attendance.filter(s => s.status === "Late").length;
  const absentCount = attendance.filter(s => s.status === "Absent").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Attendance Management
          </h2>
          <p className="text-[#0F2044]/60">Term 2 • 2026 Academic Year</p>
        </div>
        <button className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a2a5c]">
          <Download className="w-5 h-5" />
          Export Attendance Report
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-[#0F2044]/10">
        <button
          onClick={() => setActiveTab("class")}
          className={`px-8 py-4 font-medium text-lg transition-all border-b-4 ${activeTab === "class" 
            ? "border-[#F4B400] text-[#0F2044]" 
            : "border-transparent text-[#0F2044]/60 hover:text-[#0F2044]"}`}
        >
          Class Attendance
        </button>
        <button
          onClick={() => setActiveTab("boarding")}
          className={`px-8 py-4 font-medium text-lg transition-all border-b-4 ${activeTab === "boarding" 
            ? "border-[#F4B400] text-[#0F2044]" 
            : "border-transparent text-[#0F2044]/60 hover:text-[#0F2044]"}`}
        >
          Boarding Evening Roll-Call
        </button>
      </div>

      {activeTab === "class" && (
        <>
          {/* Class Selector */}
          <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Users className="w-8 h-8 text-[#F4B400]" />
              <div>
                <p className="text-sm text-[#0F2044]/60">Current Class</p>
                <select 
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="text-2xl font-semibold bg-transparent focus:outline-none text-[#0F2044]"
                >
                  <option>Form 3A - Mathematics</option>
                  <option>Form 4B - Physics</option>
                  <option>Form 2C - English</option>
                  <option>Form 1A - General Studies</option>
                </select>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-sm text-[#0F2044]/60">Today: Thursday, 16 April 2026</p>
              <p className="text-2xl font-bold text-[#0F2044]">{presentCount}/{attendance.length} Present</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-emerald-600 text-sm font-medium">PRESENT</p>
                  <p className="text-5xl font-bold text-emerald-600 mt-2">{presentCount}</p>
                </div>
                <CheckCircle className="w-12 h-12 text-emerald-600" />
              </div>
            </div>
            <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-amber-600 text-sm font-medium">LATE</p>
                  <p className="text-5xl font-bold text-amber-600 mt-2">{lateCount}</p>
                </div>
                <Clock className="w-12 h-12 text-amber-600" />
              </div>
            </div>
            <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-red-600 text-sm font-medium">ABSENT</p>
                  <p className="text-5xl font-bold text-red-600 mt-2">{absentCount}</p>
                </div>
                <XCircle className="w-12 h-12 text-red-600" />
              </div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
            <table className="w-full">
              <thead className="bg-[#F7F5F0]">
                <tr>
                  <th className="text-left p-6">Adm. No.</th>
                  <th className="text-left p-6">Student Name</th>
                  <th className="text-left p-6">Arrival Time</th>
                  <th className="text-center p-6">Status</th>
                  <th className="text-left p-6">Remark</th>
                  <th className="text-center p-6 w-48">Mark Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attendance.map((student) => (
                  <tr key={student.id} className="hover:bg-[#F7F5F0]/60">
                    <td className="p-6 font-mono">{student.studentId}</td>
                    <td className="p-6 font-medium">{student.name}</td>
                    <td className="p-6 text-sm text-[#0F2044]/70">{student.time}</td>
                    <td className="p-6 text-center">
                      <span className={`inline-flex px-5 py-1.5 rounded-full text-sm font-medium
                        ${student.status === "Present" ? "bg-emerald-100 text-emerald-700" : 
                          student.status === "Late" ? "bg-amber-100 text-amber-700" : 
                          "bg-red-100 text-red-700"}`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="p-6 text-sm">{student.remark}</td>
                    <td className="p-6">
                      <div className="flex gap-2 justify-center">
                        <button 
                          onClick={() => markAttendance(student.id, "Present")}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-2xl transition-all"
                        >
                          Present
                        </button>
                        <button 
                          onClick={() => markAttendance(student.id, "Late")}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-2xl transition-all"
                        >
                          Late
                        </button>
                        <button 
                          onClick={() => markAttendance(student.id, "Absent")}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-2xl transition-all"
                        >
                          Absent
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "boarding" && (
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
              <div>
                <h3 className="text-2xl font-bold">Boarding Evening Roll-Call</h3>
                <p className="text-[#0F2044]/60">Thursday, 16 April 2026 • 21:30</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-emerald-600 font-medium">42 / 48 Students Present</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F7F5F0]">
                <tr>
                  <th className="text-left p-6">Student Name</th>
                  <th className="text-left p-6">House</th>
                  <th className="text-center p-6">Status</th>
                  <th className="text-left p-6">Time Marked</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {boardingRollCall.map((student) => (
                  <tr key={student.id} className="hover:bg-[#F7F5F0]/60">
                    <td className="p-6 font-medium">{student.name}</td>
                    <td className="p-6">{student.house}</td>
                    <td className="p-6 text-center">
                      <span className={`px-6 py-2 rounded-full text-sm font-medium ${student.status === "Present" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="p-6 text-sm text-[#0F2044]/70">{student.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}