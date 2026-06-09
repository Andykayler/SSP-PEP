import { useState } from "react";
import { AlertTriangle, Plus, Eye, Trash2 } from "lucide-react";

export default function DisciplineModule() {
  const [searchTerm, setSearchTerm] = useState("");

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
    },
    {
      id: "DISC-002",
      date: "2026-03-24",
      student: "Mary Banda",
      class: "Form 2B",
      offense: "Using mobile phone",
      severity: "Medium",
      action: "Phone confiscated + warning letter to parent",
      reportedBy: "Mrs. Esther Phiri",
    },
    {
      id: "DISC-003",
      date: "2026-03-20",
      student: "John Phiri",
      class: "Form 3A",
      offense: "Late to morning assembly (repeated)",
      severity: "Low",
      action: "Extra duty + parent notification",
      reportedBy: "Mr. Kondwani Banda",
    },
  ]);

  const filteredRecords = disciplineRecords.filter(record =>
    record.student.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.offense.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-app-text" style={{ fontFamily: "'Playfair Display', serif" }}>
            Discipline Management
          </h2>
          <p className="text-app-text/60">Record and track student behavior cases</p>
        </div>
        <button className="flex items-center gap-2 bg-app-primary text-white px-6 py-3 rounded-2xl font-medium">
          <Plus className="w-5 h-5" /> Log New Offense
        </button>
      </div>

      <div className="bg-app-surface rounded-3xl p-5 border border-app-border">
        <input
          type="text"
          placeholder="Search student or offense..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-5 py-3 bg-[#FAFAF8] border border-app-border rounded-2xl focus:border-[#F4B400]"
        />
      </div>

      <div className="bg-app-surface rounded-3xl border border-app-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-app-bg">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">DATE</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">STUDENT</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">CLASS</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">OFFENSE</th>
              <th className="px-6 py-4 text-center text-xs font-bold tracking-widest text-app-text/60">SEVERITY</th>
              <th className="px-6 py-4 text-left text-xs font-bold tracking-widest text-app-text/60">ACTION TAKEN</th>
              <th className="px-6 py-4 text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRecords.map(record => (
              <tr key={record.id} className="hover:bg-[#FAFAF8]">
                <td className="px-6 py-5 text-sm">{record.date}</td>
                <td className="px-6 py-5 font-medium">{record.student}</td>
                <td className="px-6 py-5">{record.class}</td>
                <td className="px-6 py-5 text-sm">{record.offense}</td>
                <td className="px-6 py-5 text-center">
                  <span className={`px-4 py-1 text-xs rounded-full font-medium
                    ${record.severity === 'High' ? 'bg-red-100 text-red-700' : 
                      record.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                      'bg-emerald-100 text-emerald-700'}`}>
                    {record.severity}
                  </span>
                </td>
                <td className="px-6 py-5 text-sm text-app-text/70">{record.action}</td>
                <td className="px-6 py-5 text-center">
                  <button className="p-2 hover:bg-app-warning/10 text-[#F4B400] rounded-xl">
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}