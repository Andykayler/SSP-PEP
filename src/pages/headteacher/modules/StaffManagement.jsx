// modules/StaffManagement.jsx
import { useState } from "react";
import { Users, UserPlus, Edit2, Trash2, Eye, Award, Calendar } from "lucide-react";

const dummyStaff = [
  {
    id: "T001",
    name: "Mr. Martin Khumbata",
    role: "Mathematics & Physics Teacher",
    department: "Sciences",
    form: "Form 3 & 4",
    phone: "0999123456",
    email: "martin.khumbata@school.mw",
    status: "Active",
    joinDate: "2023-01-15",
    subjects: ["Mathematics", "Physics"],
  },
  {
    id: "T002",
    name: "Mrs. Esther Chirwa",
    role: "English Teacher",
    department: "Languages",
    form: "Form 1 - 4",
    phone: "0888456789",
    email: "esther.chirwa@school.mw",
    status: "Active",
    joinDate: "2022-09-01",
    subjects: ["English"],
  },
  {
    id: "T003",
    name: "Mr. Patrick Banda",
    role: "Chemistry Teacher",
    department: "Sciences",
    form: "Form 3 & 4",
    phone: "0999876543",
    email: "patrick.banda@school.mw",
    status: "Active",
    joinDate: "2024-01-10",
    subjects: ["Chemistry"],
  },
  {
    id: "S001",
    name: "Mrs. Grace Manda",
    role: "Boarding Matron",
    department: "Administration",
    form: "Boarding",
    phone: "0999765432",
    email: "grace.manda@school.mw",
    status: "Active",
    joinDate: "2021-06-01",
    subjects: [],
  },
  {
    id: "T004",
    name: "Mr. Joseph Phiri",
    role: "History Teacher",
    department: "Humanities",
    form: "Form 2 & 3",
    phone: "0888123456",
    email: "joseph.phiri@school.mw",
    status: "On Leave",
    joinDate: "2023-03-20",
    subjects: ["History"],
  },
];

export default function StaffManagement() {
  const [staff, setStaff] = useState(dummyStaff);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredStaff = staff.filter((member) => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDept = 
      filterDepartment === "All" || member.department === filterDepartment;

    return matchesSearch && matchesDept;
  });

  const activeCount = staff.filter(s => s.status === "Active").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Staff Management
          </h2>
          <p className="text-[#0F2044]/60">Total Staff: {staff.length} • Active: {activeCount}</p>
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a2a5c]"
        >
          <UserPlus className="w-5 h-5" />
          Add New Staff
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Teaching Staff</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-2">
            {staff.filter(s => s.role.includes("Teacher")).length}
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Support Staff</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-2">
            {staff.filter(s => !s.role.includes("Teacher")).length}
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">On Leave</p>
          <p className="text-4xl font-bold text-amber-600 mt-2">
            {staff.filter(s => s.status === "On Leave").length}
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Average Experience</p>
          <p className="text-4xl font-bold text-emerald-600 mt-2">4.2 yrs</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search by name or staff ID..."
            className="w-full pl-6 pr-6 py-4 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="px-6 py-4 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none"
        >
          <option value="All">All Departments</option>
          <option value="Sciences">Sciences</option>
          <option value="Languages">Languages</option>
          <option value="Humanities">Humanities</option>
          <option value="Administration">Administration</option>
        </select>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <table className="w-full">
          <thead className="bg-[#F7F5F0]">
            <tr>
              <th className="text-left p-6">Staff ID</th>
              <th className="text-left p-6">Name</th>
              <th className="text-left p-6">Role</th>
              <th className="text-left p-6">Department</th>
              <th className="text-left p-6">Contact</th>
              <th className="text-center p-6">Status</th>
              <th className="text-center p-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0F2044]/5">
            {filteredStaff.map((member) => (
              <tr key={member.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                <td className="p-6 font-mono text-sm">{member.id}</td>
                <td className="p-6 font-medium">{member.name}</td>
                <td className="p-6">
                  <div>{member.role}</div>
                  {member.subjects.length > 0 && (
                    <div className="text-xs text-[#0F2044]/60 mt-1">
                      {member.subjects.join(", ")}
                    </div>
                  )}
                </td>
                <td className="p-6">{member.department}</td>
                <td className="p-6">
                  <div className="text-sm">{member.phone}</div>
                  <div className="text-xs text-[#0F2044]/60">{member.email}</div>
                </td>
                <td className="p-6 text-center">
                  <span className={`inline-block px-5 py-1 rounded-full text-xs font-medium
                    ${member.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {member.status}
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

      {/* Add New Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8">
            <h3 className="text-2xl font-bold text-[#0F2044] mb-6">Add New Staff Member</h3>
            
            <div className="space-y-6">
              <div>
                <label className="text-sm text-[#0F2044]/60 block mb-2">Full Name</label>
                <input type="text" className="w-full px-6 py-3 border border-[#0F2044]/10 rounded-2xl" placeholder="e.g. Mrs. Mary Kamanga" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-[#0F2044]/60 block mb-2">Role</label>
                  <input type="text" className="w-full px-6 py-3 border border-[#0F2044]/10 rounded-2xl" placeholder="Subject Teacher" />
                </div>
                <div>
                  <label className="text-sm text-[#0F2044]/60 block mb-2">Department</label>
                  <select className="w-full px-6 py-3 border border-[#0F2044]/10 rounded-2xl">
                    <option>Sciences</option>
                    <option>Languages</option>
                    <option>Humanities</option>
                    <option>Administration</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-[#0F2044]/60 block mb-2">Phone Number</label>
                <input type="tel" className="w-full px-6 py-3 border border-[#0F2044]/10 rounded-2xl" placeholder="0999 123 456" />
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-4 border border-[#0F2044]/20 rounded-2xl font-medium hover:bg-[#F7F5F0]"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  alert("Staff member added successfully! (Demo)");
                  setShowAddModal(false);
                }}
                className="flex-1 py-4 bg-[#0F2044] text-white rounded-2xl font-medium hover:bg-[#1a2a5c]"
              >
                Add Staff Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}