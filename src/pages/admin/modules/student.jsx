import { useState } from "react";
import { Users, Plus, Search, Filter, Download, Eye, Edit, Trash2 } from "lucide-react";

export default function StudentModule() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Sample Student Data (you will later connect this to your backend)
  const [students, setStudents] = useState([
    {
      id: "STU-001",
      name: "John Phiri",
      class: "Form 3A",
      gender: "Male",
      age: 16,
      admissionDate: "2024-01-15",
      status: "Active",
      parent: "Mr. Charles Phiri",
      contact: "+265 999 123 456",
    },
    {
      id: "STU-002",
      name: "Mary Banda",
      class: "Form 2B",
      gender: "Female",
      age: 15,
      admissionDate: "2024-02-10",
      status: "Active",
      parent: "Mrs. Grace Banda",
      contact: "+265 888 654 321",
    },
    {
      id: "STU-003",
      name: "Blessing Mwale",
      class: "Form 4A",
      gender: "Male",
      age: 17,
      admissionDate: "2023-09-05",
      status: "Active",
      parent: "Mr. Peter Mwale",
      contact: "+265 977 112 233",
    },
    {
      id: "STU-004",
      name: "Chisomo Kumwenda",
      class: "Form 1C",
      gender: "Female",
      age: 14,
      admissionDate: "2025-01-20",
      status: "Active",
      parent: "Ms. Ruth Kumwenda",
      contact: "+265 922 445 566",
    },
  ]);

  const filteredStudents = students.filter((student) => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = filterClass === "all" || student.class === filterClass;
    return matchesSearch && matchesClass;
  });

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this student?")) {
      setStudents(students.filter(s => s.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Student Management
          </h2>
          <p className="text-[#0F2044]/60">Manage all enrolled students • Total: {students.length}</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-[#0F2044] hover:bg-[#1a3366] text-white px-6 py-3 rounded-2xl font-medium transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Add New Student
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0F2044]/40 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by name or student ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400] focus:ring-2 focus:ring-[#F4B400]/20 outline-none"
          />
        </div>

        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-5 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400] focus:ring-2 focus:ring-[#F4B400]/20 outline-none"
        >
          <option value="all">All Classes</option>
          <option value="Form 1A">Form 1A</option>
          <option value="Form 1C">Form 1C</option>
          <option value="Form 2B">Form 2B</option>
          <option value="Form 3A">Form 3A</option>
          <option value="Form 4A">Form 4A</option>
        </select>

        <button className="flex items-center gap-2 px-6 py-3 border border-[#0F2044]/20 hover:border-[#0F2044]/40 rounded-2xl transition-colors">
          <Download className="w-5 h-5" />
          Export
        </button>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-full">
            <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/10">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">STUDENT ID</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">NAME</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">CLASS</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">GENDER</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">AGE</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">PARENT</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">CONTACT</th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">STATUS</th>
                <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-[#FAFAF8] transition-colors">
                  <td className="px-6 py-4 font-mono text-sm text-[#0F2044]/70">{student.id}</td>
                  <td className="px-6 py-4 font-medium text-[#0F2044]">{student.name}</td>
                  <td className="px-6 py-4 text-sm">{student.class}</td>
                  <td className="px-6 py-4 text-sm">{student.gender}</td>
                  <td className="px-6 py-4 text-sm">{student.age}</td>
                  <td className="px-6 py-4 text-sm text-[#0F2044]/70">{student.parent}</td>
                  <td className="px-6 py-4 text-sm font-mono">{student.contact}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                      {student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button className="p-2 hover:bg-[#F4B400]/10 text-[#0F2044]/70 hover:text-[#F4B400] rounded-xl transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-blue-100 text-[#0F2044]/70 hover:text-blue-600 rounded-xl transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(student.id)}
                        className="p-2 hover:bg-red-100 text-[#0F2044]/70 hover:text-red-600 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredStudents.length === 0 && (
          <div className="py-20 text-center text-[#0F2044]/50">
            No students found matching your search.
          </div>
        )}
      </div>

      {/* Add Student Modal (Basic Version) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8">
            <h3 className="text-2xl font-bold text-[#0F2044] mb-6">Add New Student</h3>
            <p className="text-[#0F2044]/60 mb-8">Fill in the student details below.</p>
            
            <div className="space-y-4">
              <input type="text" placeholder="Full Name" className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl" />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Class (e.g. Form 3A)" className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl" />
                <input type="number" placeholder="Age" className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl" />
              </div>
              <input type="tel" placeholder="Parent Contact (+265 ...)" className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl" />
            </div>

            <div className="flex gap-3 mt-10">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 border border-[#0F2044]/20 rounded-2xl font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  alert("Student added successfully! (Demo)");
                  setShowAddModal(false);
                }}
                className="flex-1 py-3 bg-[#0F2044] text-white rounded-2xl font-medium hover:bg-[#1a3366]"
              >
                Add Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}