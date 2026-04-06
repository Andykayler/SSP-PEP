import { useState } from "react";
import { TrendingUp, Award, BarChart3, Download, Filter, Users, AlertTriangle } from "lucide-react";

export default function PerformanceModule() {
  const [selectedTerm, setSelectedTerm] = useState("Term 2 2026");
  const [selectedClass, setSelectedClass] = useState("All Classes");
  const [viewMode, setViewMode] = useState("overview"); // overview, ranking, subject

  // Sample Performance Data
  const [performanceData] = useState([
    {
      id: "STU-001",
      name: "John Phiri",
      class: "Form 3A",
      average: 87.5,
      rank: 2,
      subjects: {
        Mathematics: 92,
        English: 78,
        Biology: 95,
        History: 85,
      },
      trend: "up",
    },
    {
      id: "STU-002",
      name: "Mary Banda",
      class: "Form 2B",
      average: 82.3,
      rank: 5,
      subjects: {
        Mathematics: 75,
        English: 94,
        Biology: 80,
        History: 80,
      },
      trend: "stable",
    },
    {
      id: "STU-003",
      name: "Blessing Mwale",
      class: "Form 3A",
      average: 91.2,
      rank: 1,
      subjects: {
        Mathematics: 96,
        English: 88,
        Biology: 89,
        History: 92,
      },
      trend: "up",
    },
    {
      id: "STU-004",
      name: "Chisomo Kumwenda",
      class: "Form 1C",
      average: 76.8,
      rank: 12,
      subjects: {
        Mathematics: 68,
        English: 89,
        Biology: 72,
        History: 78,
      },
      trend: "down",
    },
  ]);

  const filteredStudents = performanceData.filter(student => 
    selectedClass === "All Classes" || student.class === selectedClass
  );

  const classAverage = (filteredStudents.reduce((sum, s) => sum + s.average, 0) / filteredStudents.length) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Academic Performance
          </h2>
          <p className="text-[#0F2044]/60">MANEB-aligned grading • Class rankings • Performance trends</p>
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
          <button className="flex items-center gap-2 px-6 py-3 bg-[#0F2044] text-white rounded-2xl font-medium">
            <Download className="w-5 h-5" /> Export Report Card
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Class Average</p>
          <p className="text-4xl font-bold text-[#0F2044] mt-2">{classAverage.toFixed(1)}%</p>
          <p className="text-xs text-emerald-600 mt-1">↑ 3.2% from last term</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Top Performer</p>
          <p className="text-2xl font-bold text-[#0F2044] mt-2">Blessing Mwale</p>
          <p className="text-sm text-[#0F2044]/60">91.2% • Form 3A</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Pass Rate</p>
          <p className="text-4xl font-bold text-emerald-600 mt-2">94%</p>
          <p className="text-xs text-[#0F2044]/60">38 out of 40 students</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">At Risk Students</p>
          <p className="text-4xl font-bold text-amber-600 mt-2">3</p>
          <p className="text-xs text-amber-600">Below 60% average</p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex border-b border-[#0F2044]/10">
        {["overview", "ranking", "subject"].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-8 py-4 font-medium text-sm transition-all border-b-2 ${
              viewMode === mode 
                ? "border-[#F4B400] text-[#0F2044]" 
                : "border-transparent text-[#0F2044]/60 hover:text-[#0F2044]"
            }`}
          >
            {mode === "overview" && "Overview"}
            {mode === "ranking" && "Class Ranking"}
            {mode === "subject" && "Subject Analysis"}
          </button>
        ))}
      </div>

      {/* Main Content */}
      {viewMode === "overview" && (
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <div className="flex justify-between mb-6">
            <h3 className="font-semibold text-lg">Student Performance Overview</h3>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-4 py-2 border border-[#0F2044]/15 rounded-xl"
            >
              <option value="All Classes">All Classes</option>
              <option value="Form 3A">Form 3A</option>
              <option value="Form 2B">Form 2B</option>
              <option value="Form 1C">Form 1C</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F2044]/10">
                  <th className="py-4 text-left">Student</th>
                  <th className="py-4 text-left">Class</th>
                  <th className="py-4 text-center">Average</th>
                  <th className="py-4 text-center">Rank</th>
                  <th className="py-4 text-center">Trend</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => (
                  <tr key={student.id} className="border-b border-[#0F2044]/5 hover:bg-[#FAFAF8]">
                    <td className="py-5 font-medium">{student.name}</td>
                    <td className="py-5 text-[#0F2044]/70">{student.class}</td>
                    <td className="py-5 text-center font-bold text-lg">{student.average}%</td>
                    <td className="py-5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-[#F4B400]/10 text-[#F4B400] rounded-full text-sm font-bold">
                        {student.rank}
                      </span>
                    </td>
                    <td className="py-5 text-center">
                      {student.trend === "up" && <span className="text-emerald-600">↑</span>}
                      {student.trend === "down" && <span className="text-red-600">↓</span>}
                      {student.trend === "stable" && <span className="text-gray-400">→</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === "ranking" && (
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h3 className="text-2xl font-bold mb-2">Class Ranking - {selectedTerm}</h3>
          <p className="text-[#0F2044]/60 mb-8">Full ranking table with subject-wise breakdown will be displayed here</p>
          <div className="inline-flex px-6 py-3 bg-[#F4B400]/10 text-[#F4B400] rounded-2xl text-sm font-medium">
            Top 3 students highlighted automatically
          </div>
        </div>
      )}

      {viewMode === "subject" && (
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <h3 className="font-semibold text-lg mb-6">Subject Performance Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {["Mathematics", "English", "Biology", "History"].map((subject) => (
              <div key={subject} className="border border-[#0F2044]/10 rounded-3xl p-6">
                <p className="text-sm text-[#0F2044]/60">{subject}</p>
                <p className="text-4xl font-bold text-[#0F2044] mt-3">84.6%</p>
                <p className="text-xs text-emerald-600 mt-1">Class Average</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Insights */}
      <div className="bg-[#F7F5F0] border border-[#0F2044]/10 rounded-3xl p-6">
        <div className="flex items-center gap-2 text-amber-600 mb-3">
          <AlertTriangle className="w-5 h-5" /> <span className="font-medium">At-Risk Students</span>
        </div>
        <p className="text-sm text-[#0F2044]/70">
          3 students are currently below 60% average. Consider early intervention and parent notification.
        </p>
      </div>
    </div>
  );
}