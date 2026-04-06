import { useState } from "react";
import { CheckCircle, XCircle, Clock, Download, Save, Users } from "lucide-react";

export default function AttendanceModule() {
  const [selectedDate, setSelectedDate] = useState("2026-03-27");
  const [selectedClass, setSelectedClass] = useState("Form 3A"); // Default to one of teacher's classes
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Teacher's actual classes and students
  const [attendanceData, setAttendanceData] = useState([
    { id: "STU-001", name: "John Phiri", class: "Form 3A", status: "Present", time: "07:25", remark: "" },
    { id: "STU-003", name: "Blessing Mwale", class: "Form 3A", status: "Present", time: "07:28", remark: "" },
    { id: "STU-006", name: "Grace Nyirenda", class: "Form 3A", status: "", time: "", remark: "" },
    { id: "STU-007", name: "Tawonga Manda", class: "Form 3A", status: "", time: "", remark: "" },
    { id: "STU-008", name: "Kelvin Chirwa", class: "Form 3A", status: "Late", time: "08:10", remark: "Bus delay" },
    { id: "STU-012", name: "Aisha Suleman", class: "Form 3A", status: "", time: "", remark: "" },
  ]);

  const teacherClasses = ["Form 3A", "Form 4B"]; // Only classes this teacher teaches

  const filteredData = attendanceData.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = student.class === selectedClass;
    return matchesSearch && matchesClass;
  });

  const presentCount = filteredData.filter(s => s.status === "Present").length;
  const absentCount = filteredData.filter(s => s.status === "Absent").length;
  const lateCount = filteredData.filter(s => s.status === "Late").length;
  const unmarkedCount = filteredData.filter(s => !s.status).length;

  const markAttendance = (id, newStatus) => {
    setAttendanceData(prev =>
      prev.map(student =>
        student.id === id
          ? { 
              ...student, 
              status: newStatus, 
              time: newStatus === "Present" ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
                    newStatus === "Late" ? "08:05" : "" 
            }
          : student
      )
    );
  };

  const markAll = (status) => {
    setAttendanceData(prev =>
      prev.map(student =>
        student.class === selectedClass
          ? { 
              ...student, 
              status: status, 
              time: status === "Present" ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "" 
            }
          : student
      )
    );
  };

  const handleSaveAttendance = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1200));

    setSaveMessage("Attendance saved successfully for " + selectedClass);
    setTimeout(() => setSaveMessage(""), 3000);
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Take Attendance
          </h2>
          <p className="text-[#0F2044]/60">Morning Roll Call • {selectedDate}</p>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={handleSaveAttendance}
            disabled={isSaving}
            className="flex items-center gap-2 bg-[#0F2044] hover:bg-black text-white px-6 py-3 rounded-2xl font-medium disabled:opacity-70 transition-all"
          >
            <Save className="w-5 h-5" />
            {isSaving ? "Saving..." : "Save Attendance"}
          </button>
        </div>
      </div>

      {/* Status Message */}
      {saveMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-5 py-3 rounded-2xl flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {saveMessage}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-3xl font-bold text-emerald-600">{presentCount}</p>
              <p className="text-sm text-[#0F2044]/60">Present</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-3xl font-bold text-red-600">{absentCount}</p>
              <p className="text-sm text-[#0F2044]/60">Absent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-3xl font-bold text-amber-600">{lateCount}</p>
              <p className="text-sm text-[#0F2044]/60">Late</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-[#0F2044]" />
            <div>
              <p className="text-3xl font-bold text-[#0F2044]">{filteredData.length}</p>
              <p className="text-sm text-[#0F2044]/60">Total Students</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">CLASS</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400] bg-white"
            >
              {teacherClasses.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">DATE</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl"
            />
          </div>

          <div className="flex-1">
            <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">SEARCH STUDENT</label>
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-5 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400]"
            />
          </div>

          {/* Bulk Actions */}
          <div className="flex gap-2 md:mb-0.5">
            <button
              onClick={() => markAll("Present")}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-2xl transition-all flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> All Present
            </button>
            <button
              onClick={() => markAll("Absent")}
              className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-2xl transition-all flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" /> All Absent
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        <div className="px-6 py-4 bg-[#F7F5F0] border-b flex justify-between items-center">
          <div className="font-semibold text-[#0F2044]">{selectedClass} • Morning Roll Call</div>
          <div className="text-xs text-[#0F2044]/50">
            {unmarkedCount} students unmarked
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-[#F7F5F0]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">STUDENT ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">STUDENT NAME</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">STATUS</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">TIME</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">REMARK</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0F2044]/5">
            {filteredData.length > 0 ? (
              filteredData.map((student) => (
                <tr key={student.id} className="hover:bg-[#FAFAF8] transition-colors">
                  <td className="px-6 py-5 font-mono text-sm">{student.id}</td>
                  <td className="px-6 py-5 font-medium">{student.name}</td>
                  
                  <td className="px-6 py-5 text-center">
                    <span className={`inline-block px-5 py-1.5 text-xs font-semibold rounded-2xl
                      ${student.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 
                        student.status === 'Absent' ? 'bg-red-100 text-red-700' : 
                        student.status === 'Late' ? 'bg-amber-100 text-amber-700' : 
                        'bg-gray-100 text-gray-500'}`}>
                      {student.status || "Unmarked"}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-sm font-medium">
                    {student.time || "-"}
                  </td>

                  <td className="px-6 py-5">
                    <input
                      type="text"
                      placeholder="Add remark..."
                      value={student.remark || ""}
                      onChange={(e) => {
                        setAttendanceData(prev =>
                          prev.map(s => s.id === student.id ? { ...s, remark: e.target.value } : s)
                        );
                      }}
                      className="w-full bg-transparent border border-transparent focus:border-[#F4B400] rounded-xl px-3 py-1 text-sm outline-none"
                    />
                  </td>

                  <td className="px-6 py-5">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => markAttendance(student.id, "Present")}
                        className={`px-4 py-1.5 text-xs rounded-xl transition-all ${student.status === 'Present' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'}`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => markAttendance(student.id, "Late")}
                        className={`px-4 py-1.5 text-xs rounded-xl transition-all ${student.status === 'Late' ? 'bg-amber-600 text-white' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'}`}
                      >
                        Late
                      </button>
                      <button
                        onClick={() => markAttendance(student.id, "Absent")}
                        className={`px-4 py-1.5 text-xs rounded-xl transition-all ${student.status === 'Absent' ? 'bg-red-600 text-white' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}
                      >
                        Absent
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="px-6 py-16 text-center text-[#0F2044]/50">
                  No students found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-center text-xs text-[#0F2044]/50">
        Attendance is automatically synced with the Admin Dashboard and Parent Portal
      </div>
    </div>
  );
}