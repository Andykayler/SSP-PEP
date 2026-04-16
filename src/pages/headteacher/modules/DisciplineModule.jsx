// modules/DisciplineModule.jsx
import { useState } from "react";
import { AlertTriangle, Plus, Eye, Edit2, Clock, UserCheck } from "lucide-react";

const dummyDisciplineCases = [
  {
    id: 1,
    date: "2026-04-14",
    studentId: "SS24003",
    studentName: "Kelvin Mwale",
    form: "Form 4A",
    offense: "Fighting in dormitory",
    severity: "Serious",
    reportedBy: "Mr. Martin Khumbata",
    status: "Pending Review",
    punishment: "Suspension (3 days)",
    parentNotified: true,
  },
  {
    id: 2,
    date: "2026-04-13",
    studentId: "SS24002",
    studentName: "Amina Phiri",
    form: "Form 3A",
    offense: "Late for evening roll-call",
    severity: "Minor",
    reportedBy: "Mrs. Jane Mphande",
    status: "Resolved",
    punishment: "Extra duty (cleaning)",
    parentNotified: true,
  },
  {
    id: 3,
    date: "2026-04-12",
    studentId: "SS24005",
    studentName: "Blessings Nyirenda",
    form: "Form 2B",
    offense: "Using mobile phone in class",
    severity: "Serious",
    reportedBy: "Mr. Martin Khumbata",
    status: "Pending Review",
    punishment: "",
    parentNotified: false,
  },
  {
    id: 4,
    date: "2026-04-10",
    studentId: "SS24001",
    studentName: "Chisomo Banda",
    form: "Form 3A",
    offense: "Uniform violation (no tie)",
    severity: "Minor",
    reportedBy: "Ms. Esther Chirwa",
    status: "Resolved",
    punishment: "Warning",
    parentNotified: true,
  },
];

const offenseTypes = [
  "Fighting", "Late for class/roll-call", "Using mobile phone", 
  "Uniform violation", "Absent without permission", "Bullying", 
  "Stealing", "Disrespect to teacher", "Smoking", "Other"
];

export default function DisciplineModule() {
  const [cases, setCases] = useState(dummyDisciplineCases);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState("All");

  const filteredCases = cases.filter(caseItem => 
    filter === "All" || caseItem.severity === filter
  );

  const addNewCase = () => {
    // In real app, this would open a modal with form
    alert("New discipline case form would open here.\n(For demo: Student selection, offense type, severity, etc.)");
    setShowAddForm(false);
  };

  const updateStatus = (id, newStatus) => {
    setCases(prev => prev.map(caseItem => 
      caseItem.id === id ? { ...caseItem, status: newStatus } : caseItem
    ));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Discipline Management
          </h2>
          <p className="text-[#0F2044]/60">Track behavior • Log offenses • Parent notifications</p>
        </div>

        <button 
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-6 py-3.5 rounded-2xl font-medium transition-all"
        >
          <Plus className="w-5 h-5" />
          Log New Offense
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="text-red-600 text-sm font-medium">THIS WEEK</div>
          <div className="text-5xl font-bold text-[#0F2044] mt-3">12</div>
          <div className="text-xs text-[#0F2044]/60 mt-1">New cases logged</div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="text-amber-600 text-sm font-medium">PENDING</div>
          <div className="text-5xl font-bold text-[#0F2044] mt-3">
            {cases.filter(c => c.status === "Pending Review").length}
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <div className="text-emerald-600 text-sm font-medium">RESOLVED</div>
          <div className="text-5xl font-bold text-[#0F2044] mt-3">
            {cases.filter(c => c.status === "Resolved").length}
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex items-center">
          <div>
            <div className="text-sm text-[#0F2044]/60">Serious Cases</div>
            <div className="text-4xl font-bold text-red-600">3</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <button 
          onClick={() => setFilter("All")}
          className={`px-6 py-3 rounded-2xl font-medium transition-all ${filter === "All" ? "bg-[#0F2044] text-white" : "bg-white border border-[#0F2044]/10 hover:bg-[#F7F5F0]"}`}
        >
          All Cases
        </button>
        <button 
          onClick={() => setFilter("Serious")}
          className={`px-6 py-3 rounded-2xl font-medium transition-all ${filter === "Serious" ? "bg-[#0F2044] text-white" : "bg-white border border-[#0F2044]/10 hover:bg-[#F7F5F0]"}`}
        >
          Serious Only
        </button>
        <button 
          onClick={() => setFilter("Minor")}
          className={`px-6 py-3 rounded-2xl font-medium transition-all ${filter === "Minor" ? "bg-[#0F2044] text-white" : "bg-white border border-[#0F2044]/10 hover:bg-[#F7F5F0]"}`}
        >
          Minor Only
        </button>
      </div>

      {/* Discipline Cases Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <div className="p-6 bg-[#F7F5F0] border-b flex items-center justify-between">
          <h3 className="font-semibold">All Discipline Records</h3>
          <span className="text-sm text-[#0F2044]/60">{filteredCases.length} cases</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F7F5F0] border-b">
                <th className="text-left p-6">Date</th>
                <th className="text-left p-6">Student</th>
                <th className="text-left p-6">Offense</th>
                <th className="text-center p-6">Severity</th>
                <th className="text-left p-6">Reported By</th>
                <th className="text-center p-6">Status</th>
                <th className="text-left p-6">Punishment</th>
                <th className="text-center p-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filteredCases.map((caseItem) => (
                <tr key={caseItem.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                  <td className="p-6 text-sm font-mono">{caseItem.date}</td>
                  <td className="p-6">
                    <div className="font-medium">{caseItem.studentName}</div>
                    <div className="text-xs text-[#0F2044]/60">{caseItem.studentId} • {caseItem.form}</div>
                  </td>
                  <td className="p-6 text-sm">{caseItem.offense}</td>
                  <td className="p-6 text-center">
                    <span className={`inline-block px-5 py-1 rounded-full text-xs font-medium
                      ${caseItem.severity === "Serious" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {caseItem.severity}
                    </span>
                  </td>
                  <td className="p-6 text-sm">{caseItem.reportedBy}</td>
                  <td className="p-6 text-center">
                    <span className={`inline-block px-4 py-1 rounded-full text-xs font-medium
                      ${caseItem.status === "Resolved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {caseItem.status}
                    </span>
                  </td>
                  <td className="p-6 text-sm text-[#0F2044]/80">{caseItem.punishment || "—"}</td>
                  <td className="p-6">
                    <div className="flex items-center justify-center gap-3">
                      <button className="p-2 hover:bg-[#F7F5F0] rounded-xl text-[#0F2044]/70 hover:text-[#0F2044]">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => updateStatus(caseItem.id, caseItem.status === "Resolved" ? "Pending Review" : "Resolved")}
                        className="px-4 py-2 text-xs font-medium bg-white border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0]"
                      >
                        {caseItem.status === "Resolved" ? "Re-open" : "Mark Resolved"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Case Floating Button Info */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4">
            <h3 className="text-2xl font-bold mb-6">Log New Discipline Case</h3>
            <p className="text-[#0F2044]/60 mb-8">This would open a detailed form with student search, offense dropdown, severity, and parent notification option.</p>
            <div className="flex gap-4">
              <button 
                onClick={addNewCase}
                className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-medium"
              >
                Create Case
              </button>
              <button 
                onClick={() => setShowAddForm(false)}
                className="flex-1 bg-[#F7F5F0] py-4 rounded-2xl font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}