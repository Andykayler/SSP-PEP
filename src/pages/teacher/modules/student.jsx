import { useState } from "react";
import { Users, Search, Download, Eye, TrendingUp, Award } from "lucide-react";

export default function Studentmodule() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("Form 3A");

  const teacherClasses = ["Form 3A", "Form 4B"];

  const [students] = useState([
    { id: "STU-001", name: "John Phiri", class: "Form 3A", gender: "Male", age: 16, average: 87.5, parent: "Mr. Charles Phiri", contact: "+265 999 123 456" },
    { id: "STU-003", name: "Blessing Mwale", class: "Form 3A", gender: "Male", age: 17, average: 91.2, parent: "Mr. Peter Mwale", contact: "+265 977 112 233" },
    { id: "STU-006", name: "Grace Nyirenda", class: "Form 3A", gender: "Female", age: 16, average: 71.5, parent: "Mrs. Florence Nyirenda", contact: "+265 888 776 554" },
    { id: "STU-008", name: "Kelvin Chirwa", class: "Form 3A", gender: "Male", age: 16, average: 85.5, parent: "Mr. Dickson Chirwa", contact: "+265 922 334 455" },
    { id: "STU-012", name: "Aisha Suleman", class: "Form 4B", gender: "Female", age: 17, average: 82.0, parent: "Mr. Yusuf Suleman", contact: "+265 955 667 889" },
  ]);

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         student.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = student.class === filterClass;
    return matchesSearch && matchesClass;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            My Students
          </h2>
          <p className="text-[#0F2044]/60">Students enrolled in my classes • {filteredStudents.length} shown</p>
        </div>

        <div className="text-xs bg-amber-100 text-amber-700 px-4 py-2 rounded-2xl flex items-center gap-2">
          <span>You can view and manage students in your classes only.</span>
          <span className="font-medium">New admissions → Admin Portal</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0F2044]/40 w-5 h-5" />
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400]"
          />
        </div>

        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-5 py-3 bg-white border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
        >
          {teacherClasses.map(cls => (
            <option key={cls} value={cls}>{cls}</option>
          ))}
        </select>

        <button className="flex items-center gap-2 px-6 py-3 border border-[#0F2044]/20 hover:border-[#0F2044] rounded-2xl transition-colors">
          <Download className="w-5 h-5" /> Export Class List
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#F7F5F0]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">STUDENT NAME</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">GENDER</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">AGE</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">AVERAGE</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">PARENT</th>
              <th className="px-6 py-4 text-center">QUICK ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredStudents.map(student => (
              <tr key={student.id} className="hover:bg-[#FAFAF8]">
                <td className="px-6 py-5 font-mono">{student.id}</td>
                <td className="px-6 py-5 font-medium">{student.name}</td>
                <td className="px-6 py-5 text-center">{student.gender}</td>
                <td className="px-6 py-5 text-center">{student.age}</td>
                <td className="px-6 py-5 text-center font-bold text-emerald-600">
                  {student.average}%
                </td>
                <td className="px-6 py-5 text-sm text-[#0F2044]/70">{student.parent}</td>
                <td className="px-6 py-5">
                  <div className="flex justify-center gap-3">
                    <button className="flex items-center gap-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl transition">
                      <TrendingUp className="w-4 h-4" /> Attendance
                    </button>
                    <button className="flex items-center gap-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-4 py-2 rounded-xl transition">
                      <Award className="w-4 h-4" /> Marks
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-[#0F2044]/50">
        To add a new student or change class, please contact the School Administrator.
      </p>
    </div>
  );
}