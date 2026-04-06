import { useState } from "react";
import { TrendingUp, Award, BarChart3, Download, Users, AlertTriangle, Edit3 } from "lucide-react";

export default function PerformanceModule() {
  const [selectedTerm, setSelectedTerm] = useState("Term 2 2026");
  const [selectedClass, setSelectedClass] = useState("Form 3A"); // Teacher's main class
  const [viewMode, setViewMode] = useState("overview"); // overview, enter-marks, ranking

  const teacherClasses = ["Form 3A", "Form 4B"]; // Classes this teacher teaches

  // Sample data - only students from teacher's classes
  const [performanceData, setPerformanceData] = useState([
    {
      id: "STU-001",
      name: "John Phiri",
      class: "Form 3A",
      subjects: {
        Mathematics: 92,
        English: 78,
        Biology: 95,
        History: 85,
      },
      average: 87.5,
      rank: 2,
      trend: "up",
      lastUpdated: "2026-03-25",
    },
    {
      id: "STU-003",
      name: "Blessing Mwale",
      class: "Form 3A",
      subjects: {
        Mathematics: 96,
        English: 88,
        Biology: 89,
        History: 92,
      },
      average: 91.2,
      rank: 1,
      trend: "up",
      lastUpdated: "2026-03-26",
    },
    {
      id: "STU-006",
      name: "Grace Nyirenda",
      class: "Form 3A",
      subjects: {
        Mathematics: 65,
        English: 82,
        Biology: 71,
        History: 68,
      },
      average: 71.5,
      rank: 8,
      trend: "down",
      lastUpdated: "2026-03-20",
    },
    {
      id: "STU-008",
      name: "Kelvin Chirwa",
      class: "Form 3A",
      subjects: {
        Mathematics: 88,
        English: 79,
        Biology: 84,
        History: 91,
      },
      average: 85.5,
      rank: 3,
      trend: "stable",
      lastUpdated: "2026-03-26",
    },
  ]);

  const filteredStudents = performanceData.filter(student => 
    student.class === selectedClass
  );

  const classAverage = filteredStudents.length 
    ? (filteredStudents.reduce((sum, s) => sum + s.average, 0) / filteredStudents.length).toFixed(1) 
    : 0;

  const atRiskCount = filteredStudents.filter(s => s.average < 60).length;

  // Update a student's mark
  const updateMark = (studentId, subject, newScore) => {
    setPerformanceData(prev =>
      prev.map(student => {
        if (student.id === studentId) {
          const newSubjects = { ...student.subjects, [subject]: parseFloat(newScore) || 0 };
          const newAverage = Object.values(newSubjects).reduce((a, b) => a + b, 0) / 4;
          
          return {
            ...student,
            subjects: newSubjects,
            average: Math.round(newAverage * 10) / 10,
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        }
        return student;
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            My Students' Performance
          </h2>
          <p className="text-[#0F2044]/60">Continuous Assessment • MANEB-aligned • Real-time updates</p>
        </div>

        <div className="flex gap-3">
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="px-5 py-3 bg-white border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
          >
            <option value="Term 1 2026">Term 1 2026</option>
            <option value="Term 2 2026">Term 2 2026</option>
            <option value="Term 3 2025">Term 3 2025</option>
          </select>

          <button className="flex items-center gap-2 px-6 py-3 bg-[#0F2044] text-white rounded-2xl font-medium hover:bg-black transition-colors">
            <Download className="w-5 h-5" /> Export Report Cards
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Class Average</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-1">{classAverage}%</p>
          <p className="text-xs text-emerald-600 mt-2">↑ 4.1% from last term</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Students in Class</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-1">{filteredStudents.length}</p>
          <p className="text-xs text-[#0F2044]/60 mt-1">Form {selectedClass}</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Top Performer</p>
          <p className="text-xl font-bold text-[#0F2044] mt-2">
            {filteredStudents.sort((a, b) => b.average - a.average)[0]?.name || "—"}
          </p>
          <p className="text-sm text-emerald-600">
            {filteredStudents.sort((a, b) => b.average - a.average)[0]?.average || 0}%
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">At-Risk Students</p>
          <p className="text-4xl font-bold text-amber-600 mt-1">{atRiskCount}</p>
          <p className="text-xs text-amber-600">Below 60% average</p>
        </div>
      </div>

      {/* Class & View Selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold tracking-widest text-[#0F2044]/60 mb-1">MY CLASS</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-5 py-3 border border-[#0F2044]/15 rounded-2xl focus:border-[#F4B400]"
          >
            {teacherClasses.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        <div className="flex border-b border-[#0F2044]/10 flex-1">
          {[
            { id: "overview", label: "Performance Overview" },
            { id: "enter-marks", label: "Enter / Edit Marks" },
            { id: "ranking", label: "Class Ranking" }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`flex-1 py-4 text-sm font-medium transition-all border-b-2 ${
                viewMode === mode.id 
                  ? "border-[#F4B400] text-[#0F2044]" 
                  : "border-transparent text-[#0F2044]/60 hover:text-[#0F2044]"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW */}
      {viewMode === "overview" && (
        <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
          <div className="px-6 py-4 bg-[#F7F5F0] border-b">
            <h3 className="font-semibold">Performance Overview - {selectedClass}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F2044]/10">
                  <th className="px-6 py-4 text-left">Student Name</th>
                  <th className="px-6 py-4 text-center">Mathematics</th>
                  <th className="px-6 py-4 text-center">English</th>
                  <th className="px-6 py-4 text-center">Biology</th>
                  <th className="px-6 py-4 text-center">History</th>
                  <th className="px-6 py-4 text-center font-bold">Average</th>
                  <th className="px-6 py-4 text-center">Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-[#FAFAF8]">
                    <td className="px-6 py-5 font-medium">{student.name}</td>
                    {Object.entries(student.subjects).map(([sub, score]) => (
                      <td key={sub} className="px-6 py-5 text-center font-medium">
                        {score}
                      </td>
                    ))}
                    <td className="px-6 py-5 text-center font-bold text-lg">{student.average}%</td>
                    <td className="px-6 py-5 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-[#F4B400]/10 text-[#F4B400] rounded-full text-sm font-bold">
                        {student.rank}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ENTER / EDIT MARKS - Most Important for Teachers */}
      {viewMode === "enter-marks" && (
        <div className="bg-white rounded-3xl border border-[#0F2044]/8 overflow-hidden">
          <div className="px-6 py-4 bg-[#F7F5F0] border-b flex justify-between items-center">
            <h3 className="font-semibold">Enter Continuous Assessment Marks - {selectedClass}</h3>
            <span className="text-xs text-emerald-600 font-medium">Last saved: Today</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F2044]/10 bg-white">
                  <th className="px-6 py-4 text-left">Student</th>
                  <th className="px-6 py-4 text-center">Mathematics</th>
                  <th className="px-6 py-4 text-center">English</th>
                  <th className="px-6 py-4 text-center">Biology</th>
                  <th className="px-6 py-4 text-center">History</th>
                  <th className="px-6 py-4 text-center">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-[#FAFAF8]">
                    <td className="px-6 py-6 font-medium">{student.name}</td>
                    
                    {Object.entries(student.subjects).map(([subject, score]) => (
                      <td key={subject} className="px-6 py-6 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={score}
                          onChange={(e) => updateMark(student.id, subject, e.target.value)}
                          className="w-20 text-center bg-white border border-[#0F2044]/20 focus:border-[#F4B400] rounded-xl py-2 font-medium outline-none"
                        />
                      </td>
                    ))}

                    <td className="px-6 py-6 text-center font-bold text-lg text-[#0F2044]">
                      {student.average}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 border-t bg-[#F7F5F0] text-center text-sm text-[#0F2044]/60">
            Changes are saved automatically • Marks contribute to Continuous Assessment (40%)
          </div>
        </div>
      )}

      {/* CLASS RANKING */}
      {viewMode === "ranking" && (
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <div className="text-center mb-8">
            <Award className="w-12 h-12 mx-auto text-[#F4B400] mb-3" />
            <h3 className="text-2xl font-bold">Class Ranking - {selectedClass}</h3>
            <p className="text-[#0F2044]/60 mt-1">{selectedTerm}</p>
          </div>

          <div className="space-y-4">
            {[...filteredStudents]
              .sort((a, b) => b.average - a.average)
              .map((student, index) => (
                <div
                  key={student.id}
                  className={`flex items-center justify-between px-6 py-5 rounded-2xl border ${
                    index < 3 ? "border-[#F4B400]/30 bg-[#F4B400]/5" : "border-[#0F2044]/10"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-2xl bg-[#0F2044] text-white flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{student.name}</p>
                      <p className="text-xs text-[#0F2044]/60">{student.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#0F2044]">{student.average}%</p>
                    <p className="text-xs text-emerald-600">Average</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* At-Risk Alert */}
      {atRiskCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Early Intervention Needed</p>
            <p className="text-sm text-amber-700 mt-1">
              {atRiskCount} student{atRiskCount > 1 ? 's are' : ' is'} performing below 60%. 
              Consider scheduling remedial sessions and notifying parents.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}