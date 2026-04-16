// modules/StudentManagement.jsx
import { useState } from "react";
import { UserPlus, Search, Edit2, Trash2, Eye, Download, Filter } from "lucide-react";

const dummyStudents = [
  {
    id: "SS24001",
    name: "Chisomo Banda",
    gender: "Male",
    form: "Form 3",
    stream: "A",
    admissionDate: "2024-01-15",
    parent: "Mrs. Grace Banda",
    parentPhone: "0999123456",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Paid",
  },
  {
    id: "SS24002",
    name: "Amina Phiri",
    gender: "Female",
    form: "Form 2",
    stream: "B",
    admissionDate: "2024-01-20",
    parent: "Mr. Joseph Phiri",
    parentPhone: "0888456789",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Pending",
  },
  {
    id: "SS24003",
    name: "Kelvin Mwale",
    gender: "Male",
    form: "Form 4",
    stream: "A",
    admissionDate: "2023-09-10",
    parent: "Mrs. Edith Mwale",
    parentPhone: "0999876543",
    boarding: "No",
    status: "Active",
    feeStatus: "Paid",
  },
  {
    id: "SS24004",
    name: "Tiyamike Kumwenda",
    gender: "Female",
    form: "Form 1",
    stream: "C",
    admissionDate: "2025-01-10",
    parent: "Mr. Patrick Kumwenda",
    parentPhone: "0999765432",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Pending",
  },
];

export default function StudentManagement() {
  const [students] = useState(dummyStudents);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterForm, setFilterForm] = useState("All");

  const filteredStudents = students.filter((student) => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesForm = filterForm === "All" || student.form === filterForm;
    return matchesSearch && matchesForm;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Student Management
          </h2>
          <p className="text-[#0F2044]/60">Total Students: {students.length} • Term 2, 2026</p>
        </div>
        <button className="flex items-center gap-3 bg-[#0F2044] hover:bg-[#1a2a5c] text-white px-6 py-3.5 rounded-2xl font-medium transition-all">
          <UserPlus className="w-5 h-5" />
          Enroll New Student
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex flex-wrap gap-4 items-center">
        <div className="flex-1 relative min-w-[280px]">
          <Search className="absolute left-5 top-4 text-[#0F2044]/40" />
          <input
            type="text"
            placeholder="Search by name or admission number..."
            className="w-full pl-14 pr-6 py-4 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#F4B400]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="px-6 py-4 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none min-w-[160px]"
          value={filterForm}
          onChange={(e) => setFilterForm(e.target.value)}
        >
          <option value="All">All Forms</option>
          <option value="Form 1">Form 1</option>
          <option value="Form 2">Form 2</option>
          <option value="Form 3">Form 3</option>
          <option value="Form 4">Form 4</option>
        </select>

        <button className="flex items-center gap-2 px-6 py-4 border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0]">
          <Download className="w-5 h-5" /> Export to Excel
        </button>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-full">
            <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/10">
              <tr>
                <th className="text-left p-6 font-semibold text-[#0F2044]">Adm. No.</th>
                <th className="text-left p-6 font-semibold text-[#0F2044]">Student Name</th>
                <th className="text-left p-6 font-semibold text-[#0F2044]">Form / Stream</th>
                <th className="text-left p-6 font-semibold text-[#0F2044]">Parent / Guardian</th>
                <th className="text-left p-6 font-semibold text-[#0F2044]">Contact</th>
                <th className="text-center p-6 font-semibold text-[#0F2044]">Boarding</th>
                <th className="text-center p-6 font-semibold text-[#0F2044]">Fee Status</th>
                <th className="text-center p-6 font-semibold text-[#0F2044]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                  <td className="p-6 font-mono text-sm">{student.id}</td>
                  <td className="p-6 font-medium">{student.name}</td>
                  <td className="p-6">
                    <span className="inline-block px-4 py-1 bg-[#0F2044]/5 rounded-full text-sm">
                      {student.form} {student.stream}
                    </span>
                  </td>
                  <td className="p-6 text-sm">{student.parent}</td>
                  <td className="p-6 text-sm font-mono">{student.parentPhone}</td>
                  <td className="p-6 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${student.boarding === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {student.boarding}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <span className={`inline-block px-4 py-1 rounded-full text-xs font-medium ${student.feeStatus === "Paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {student.feeStatus}
                    </span>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center justify-center gap-3">
                      <button className="p-2 hover:bg-[#F7F5F0] rounded-xl text-[#0F2044]/70 hover:text-[#0F2044]">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button className="p-2 hover:bg-[#F7F5F0] rounded-xl text-[#0F2044]/70 hover:text-[#0F2044]">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button className="p-2 hover:bg-red-50 rounded-xl text-red-600/70 hover:text-red-600">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredStudents.length === 0 && (
        <div className="text-center py-20 text-[#0F2044]/50">No students found matching your search.</div>
      )}
    </div>
  );
}