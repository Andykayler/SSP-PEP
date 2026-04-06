import { useState } from "react";
import { AlertTriangle, Plus, Eye, Trash2, Edit2, Clock } from "lucide-react";

export default function DisciplineModule() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState("Medium");

  const [disciplineRecords, setDisciplineRecords] = useState([
    {
      id: "DISC-001",
      date: "2026-03-25",
      student: "Blessing Mwale",
      class: "Form 3A",
      offense: "Fighting in dormitory",
      severity: "High",
      action: "3 days suspension + counseling",
      reportedBy: "Mr. James Mwale",
      status: "Resolved",
    },
    {
      id: "DISC-002",
      date: "2026-03-24",
      student: "Mary Banda",
      class: "Form 2B",
      offense: "Using mobile phone during study hours",
      severity: "Medium",
      action: "Phone confiscated for 7 days + warning letter to parent",
      reportedBy: "Mrs. Esther Phiri",
      status: "Pending Parent Response",
    },
    {
      id: "DISC-003",
      date: "2026-03-20",
      student: "John Phiri",
      class: "Form 3A",
      offense: "Repeated lateness to morning assembly",
      severity: "Low",
      action: "Extra cleaning duty + parent notification via SMS",
      reportedBy: "Mr. Kondwani Banda",
      status: "Resolved",
    },
  ]);

  const [newRecord, setNewRecord] = useState({
    student: "",
    class: "Form 3A",
    offense: "",
    severity: "Medium",
    action: "",
  });

  const filteredRecords = disciplineRecords.filter(record =>
    record.student.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.offense.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.class.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addNewRecord = () => {
    if (!newRecord.student || !newRecord.offense) return;

    const record = {
      id: `DISC-${String(Date.now()).slice(-4)}`,
      date: new Date().toISOString().split('T')[0],
      student: newRecord.student,
      class: newRecord.class,
      offense: newRecord.offense,
      severity: newRecord.severity,
      action: newRecord.action || "Verbal warning + parent notification",
      reportedBy: "Mr. Martin Khumbata", // Current teacher
      status: "Pending Review",
    };

    setDisciplineRecords([record, ...disciplineRecords]);
    setNewRecord({ student: "", class: "Form 3A", offense: "", severity: "Medium", action: "" });
    setShowNewForm(false);
  };

  const deleteRecord = (id) => {
    if (confirm("Delete this discipline record?")) {
      setDisciplineRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Discipline Management
          </h2>
          <p className="text-[#0F2044]/60">Track behavior • Log offenses • Follow school policy</p>
        </div>

        <button 
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 bg-[#0F2044] hover:bg-black text-white px-6 py-3 rounded-2xl font-medium transition-all"
        >
          <Plus className="w-5 h-5" /> Log New Offense
        </button>
      </div>

      {/* New Offense Form */}
      {showNewForm && (
        <div className="bg-white rounded-3xl border border-[#0F2044]/8 p-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Log New Discipline Case
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">STUDENT NAME</label>
              <input
                type="text"
                value={newRecord.student}
                onChange={(e) => setNewRecord({ ...newRecord, student: e.target.value })}
                placeholder="e.g. Grace Nyirenda"
                className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">CLASS</label>
              <select
                value={newRecord.class}
                onChange={(e) => setNewRecord({ ...newRecord, class: e.target.value })}
                className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
              >
                <option value="Form 3A">Form 3A</option>
                <option value="Form 4B">Form 4B</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">OFFENSE / INCIDENT</label>
              <input
                type="text"
                value={newRecord.offense}
                onChange={(e) => setNewRecord({ ...newRecord, offense: e.target.value })}
                placeholder="Describe the offense clearly..."
                className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">SEVERITY</label>
              <div className="flex gap-2">
                {["Low", "Medium", "High"].map((level) => (
                  <button
                    key={level}
                    onClick={() => setNewRecord({ ...newRecord, severity: level })}
                    className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-all ${
                      newRecord.severity === level 
                        ? level === "High" ? "bg-red-600 text-white" 
                          : level === "Medium" ? "bg-amber-600 text-white" 
                          : "bg-emerald-600 text-white"
                        : "bg-gray-100 hover:bg-gray-200 text-[#0F2044]"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">ACTION TAKEN / RECOMMENDED</label>
              <input
                type="text"
                value={newRecord.action}
                onChange={(e) => setNewRecord({ ...newRecord, action: e.target.value })}
                placeholder="e.g. Warning letter, Suspension, Counseling..."
                className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={addNewRecord}
              className="flex-1 bg-[#0F2044] text-white py-3 rounded-2xl font-medium hover:bg-black transition-all"
            >
              Save Discipline Record
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-[#0F2044] py-3 rounded-2xl font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-3xl p-5 border border-[#0F2044]/8">
        <input
          type="text"
          placeholder="Search by student name or offense..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-5 py-3 bg-[#FAFAF8] border border-[#0F2044]/10 rounded-2xl focus:border-[#F4B400]"
        />
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
        <div className="px-6 py-4 bg-[#F7F5F0] border-b flex items-center justify-between">
          <div className="font-semibold text-[#0F2044]">Recent Discipline Cases</div>
          <div className="text-xs text-[#0F2044]/50">
            {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-[#F7F5F0]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">DATE</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">STUDENT</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">CLASS</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">OFFENSE</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">SEVERITY</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-[#0F2044]/60">ACTION</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-[#0F2044]/60">STATUS</th>
              <th className="px-6 py-4 text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRecords.length > 0 ? (
              filteredRecords.map(record => (
                <tr key={record.id} className="hover:bg-[#FAFAF8] transition-colors">
                  <td className="px-6 py-5 text-sm font-medium">{record.date}</td>
                  <td className="px-6 py-5 font-medium">{record.student}</td>
                  <td className="px-6 py-5 text-sm">{record.class}</td>
                  <td className="px-6 py-5 text-sm">{record.offense}</td>
                  <td className="px-6 py-5 text-center">
                    <span className={`px-5 py-1 text-xs font-semibold rounded-2xl
                      ${record.severity === 'High' ? 'bg-red-100 text-red-700' : 
                        record.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                        'bg-emerald-100 text-emerald-700'}`}>
                      {record.severity}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm text-[#0F2044]/70">{record.action}</td>
                  <td className="px-6 py-5 text-center">
                    <span className={`inline-block px-4 py-1 text-xs rounded-full font-medium
                      ${record.status.includes('Resolved') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center gap-2">
                      <button className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteRecord(record.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="py-16 text-center text-[#0F2044]/50">
                  No discipline records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-center text-xs text-[#0F2044]/50">
        All serious cases are automatically escalated to the School Administrator
      </div>
    </div>
  );
}