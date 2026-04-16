// modules/PerformanceModule.jsx
import { useState } from "react";
import { Award, TrendingUp, Download, Save, Calculator } from "lucide-react";

const dummyStudents = [
  { id: "SS24001", name: "Chisomo Banda", ca1: 18, ca2: 22, exam: 65, total: 0, grade: "", rank: 0 },
  { id: "SS24002", name: "Amina Phiri", ca1: 15, ca2: 19, exam: 58, total: 0, grade: "", rank: 0 },
  { id: "SS24003", name: "Kelvin Mwale", ca1: 20, ca2: 24, exam: 72, total: 0, grade: "", rank: 0 },
  { id: "SS24005", name: "Blessings Nyirenda", ca1: 12, ca2: 16, exam: 45, total: 0, grade: "", rank: 0 },
  { id: "SS24006", name: "Tawonga Manda", ca1: 17, ca2: 21, exam: 68, total: 0, grade: "", rank: 0 },
  { id: "SS24007", name: "Esther Chirwa", ca1: 19, ca2: 23, exam: 70, total: 0, grade: "", rank: 0 },
];

const subjects = ["Mathematics", "Physics", "English", "Biology", "Chemistry", "History"];

export default function PerformanceModule() {
  const [students, setStudents] = useState(dummyStudents);
  const [selectedSubject, setSelectedSubject] = useState("Mathematics");
  const [selectedTerm, setSelectedTerm] = useState("Term 2");
  const [selectedClass, setSelectedClass] = useState("Form 3A");

  // Auto-calculate total and grade + ranking
  const calculateResults = (updatedStudents) => {
    const withTotals = updatedStudents.map(student => {
      const total = (student.ca1 + student.ca2) * 0.4 + student.exam * 0.6;
      let grade = "";
      
      if (total >= 80) grade = "1 (Distinction)";
      else if (total >= 70) grade = "2";
      else if (total >= 60) grade = "3";
      else if (total >= 50) grade = "4";
      else if (total >= 40) grade = "5";
      else if (total >= 30) grade = "6";
      else if (total >= 20) grade = "7";
      else grade = "8/9 (Fail)";

      return { ...student, total: Math.round(total), grade };
    });

    // Sort by total and assign ranks
    const sorted = [...withTotals].sort((a, b) => b.total - a.total);
    const ranked = sorted.map((student, index) => ({
      ...student,
      rank: index + 1
    }));

    return ranked;
  };

  const updateMark = (id, field, value) => {
    const updated = students.map(student =>
      student.id === id ? { ...student, [field]: parseInt(value) || 0 } : student
    );
    setStudents(calculateResults(updated));
  };

  const rankedStudents = calculateResults(students);

  const classAverage = (rankedStudents.reduce((sum, s) => sum + s.total, 0) / rankedStudents.length).toFixed(1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Enter Marks & Performance
          </h2>
          <p className="text-[#0F2044]/60">Continuous Assessment + Examination • MANEB Grading</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select 
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-6 py-3 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none"
          >
            <option>Form 3A</option>
            <option>Form 4B</option>
            <option>Form 2C</option>
          </select>

          <select 
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-6 py-3 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none"
          >
            {subjects.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          <select 
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="px-6 py-3 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none"
          >
            <option>Term 1</option>
            <option>Term 2</option>
            <option>Term 3</option>
          </select>

          <button className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3 rounded-2xl hover:bg-[#1a2a5c]">
            <Save className="w-5 h-5" /> Save All Marks
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Class Average</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-2">{classAverage}%</p>
          <p className="text-xs text-emerald-600 mt-1">↑ 3.2% from last term</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Students Scored 70+</p>
          <p className="text-4xl font-bold text-emerald-600 mt-2">
            {rankedStudents.filter(s => s.total >= 70).length}
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Pass Rate (≥40%)</p>
          <p className="text-4xl font-bold text-amber-600 mt-2">
            {Math.round((rankedStudents.filter(s => s.total >= 40).length / rankedStudents.length) * 100)}%
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex items-center justify-center gap-4">
          <button className="flex-1 bg-[#F4B400] hover:bg-[#e0a000] text-[#0F2044] font-medium py-4 rounded-2xl flex items-center justify-center gap-2">
            <Download className="w-5 h-5" /> Generate Report Cards
          </button>
        </div>
      </div>

      {/* Marks Entry Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <div className="p-6 border-b border-[#0F2044]/10 flex items-center justify-between bg-[#F7F5F0]">
          <h3 className="font-semibold text-lg">
            {selectedClass} — {selectedSubject} — {selectedTerm}
          </h3>
          <p className="text-sm text-[#0F2044]/60">40% CA + 60% Exam • MANEB Scale</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F7F5F0] border-b">
                <th className="text-left p-6">Adm. No.</th>
                <th className="text-left p-6">Student Name</th>
                <th className="text-center p-6">CA 1 (20)</th>
                <th className="text-center p-6">CA 2 (20)</th>
                <th className="text-center p-6">Exam (100)</th>
                <th className="text-center p-6 font-semibold">Total (100)</th>
                <th className="text-center p-6 font-semibold">Grade</th>
                <th className="text-center p-6 font-semibold">Class Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {rankedStudents.map((student, index) => (
                <tr key={student.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                  <td className="p-6 font-mono text-sm">{student.id}</td>
                  <td className="p-6 font-medium">{student.name}</td>

                  <td className="p-6">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={student.ca1}
                      onChange={(e) => updateMark(student.id, "ca1", e.target.value)}
                      className="w-20 text-center py-2 bg-white border border-[#0F2044]/20 rounded-xl focus:outline-none focus:border-[#F4B400]"
                    />
                  </td>
                  <td className="p-6">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={student.ca2}
                      onChange={(e) => updateMark(student.id, "ca2", e.target.value)}
                      className="w-20 text-center py-2 bg-white border border-[#0F2044]/20 rounded-xl focus:outline-none focus:border-[#F4B400]"
                    />
                  </td>
                  <td className="p-6">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={student.exam}
                      onChange={(e) => updateMark(student.id, "exam", e.target.value)}
                      className="w-20 text-center py-2 bg-white border border-[#0F2044]/20 rounded-xl focus:outline-none focus:border-[#F4B400]"
                    />
                  </td>

                  <td className="p-6 text-center font-bold text-lg text-[#0F2044]">
                    {student.total}
                  </td>
                  <td className="p-6 text-center">
                    <span className={`inline-block px-5 py-1 rounded-full text-sm font-medium
                      ${student.total >= 70 ? "bg-emerald-100 text-emerald-700" : 
                        student.total >= 50 ? "bg-amber-100 text-amber-700" : 
                        "bg-red-100 text-red-700"}`}>
                      {student.grade}
                    </span>
                  </td>
                  <td className="p-6 text-center font-semibold">
                    {student.rank}
                    {student.rank === 1 && <span className="text-amber-500"> 🏆</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remarks Section */}
      <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5" /> Teacher Comments (Auto-generated examples)
        </h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div className="p-5 bg-[#F7F5F0] rounded-2xl">
            Chisomo Banda is performing excellently. Keep up the good work.
          </div>
          <div className="p-5 bg-[#F7F5F0] rounded-2xl">
            Amina Phiri needs to improve consistency in Continuous Assessment.
          </div>
        </div>
      </div>
    </div>
  );
}