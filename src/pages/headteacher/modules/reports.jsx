// modules/ReportsModule.jsx
import { useState } from "react";
import { FileText, Download, Printer, TrendingUp, Award, Users } from "lucide-react";

const dummyReportData = {
  overallPerformance: {
    classAverage: 68.4,
    passRate: 87,
    topStudent: "Chisomo Banda",
    topScore: 89,
  },
  reportCards: [
    {
      id: "SS24001",
      name: "Chisomo Banda",
      form: "Form 3A",
      average: 82,
      grade: "1 (Distinction)",
      position: "1st",
      attendance: "94%",
      conduct: "Excellent",
    },
    {
      id: "SS24002",
      name: "Amina Phiri",
      form: "Form 3A",
      average: 64,
      grade: "3",
      position: "12th",
      attendance: "82%",
      conduct: "Good",
    },
    {
      id: "SS24003",
      name: "Kelvin Mwale",
      form: "Form 4A",
      average: 71,
      grade: "2",
      position: "5th",
      attendance: "78%",
      conduct: "Satisfactory",
    },
  ],
  performanceTrends: [
    { term: "Term 1", average: 65.2 },
    { term: "Term 2", average: 68.4 },
  ],
};

export default function ReportsModule() {
  const [reportType, setReportType] = useState("reportCards"); // reportCards, performance, attendance, discipline
  const [selectedClass, setSelectedClass] = useState("Form 3A");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Reports & Analytics
          </h2>
          <p className="text-[#0F2044]/60">Term 2 • 2026 • Generate, view and export official reports</p>
        </div>

        <div className="flex gap-3">
          <button className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a2a5c]">
            <Printer className="w-5 h-5" /> Print All Report Cards
          </button>
          <button className="flex items-center gap-3 border border-[#0F2044]/20 px-6 py-3.5 rounded-2xl hover:bg-[#F7F5F0]">
            <Download className="w-5 h-5" /> Export to Excel
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#0F2044]/10 pb-2">
        {[
          { id: "reportCards", label: "Report Cards", icon: FileText },
          { id: "performance", label: "Performance Analytics", icon: TrendingUp },
          { id: "attendance", label: "Attendance Reports", icon: Users },
          { id: "discipline", label: "Discipline Summary", icon: Award },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id)}
            className={`flex items-center gap-3 px-7 py-3.5 rounded-2xl font-medium transition-all ${
              reportType === tab.id 
                ? "bg-[#0F2044] text-white shadow-md" 
                : "bg-white border border-[#0F2044]/10 hover:bg-[#F7F5F0]"
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overall School Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Class Average (Form 3A)</p>
          <p className="text-5xl font-bold text-[#0F2044] mt-4">{dummyReportData.overallPerformance.classAverage}</p>
          <p className="text-emerald-600 text-sm mt-2">↑ 3.2 from Term 1</p>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Overall Pass Rate</p>
          <p className="text-5xl font-bold text-emerald-600 mt-4">{dummyReportData.overallPerformance.passRate}%</p>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Top Student</p>
          <p className="font-semibold text-xl mt-4">{dummyReportData.overallPerformance.topStudent}</p>
          <p className="text-[#F4B400]">{dummyReportData.overallPerformance.topScore}%</p>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8 flex items-center justify-center">
          <button className="w-full py-6 bg-[#F4B400] hover:bg-[#e0a000] text-[#0F2044] font-semibold rounded-2xl transition-all">
            Generate Full Term Report for SMC
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {reportType === "reportCards" && (
        <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
          <div className="p-8 bg-[#F7F5F0] border-b flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-xl">Mid-Term Report Cards - {selectedClass}</h3>
              <p className="text-sm text-[#0F2044]/60">Ready for printing and parent distribution</p>
            </div>
            <select 
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-6 py-3 border border-[#0F2044]/10 rounded-2xl"
            >
              <option>Form 3A</option>
              <option>Form 4B</option>
              <option>Form 2C</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white">
                <tr>
                  <th className="text-left p-6">Adm. No.</th>
                  <th className="text-left p-6">Student Name</th>
                  <th className="text-center p-6">Average (%)</th>
                  <th className="text-center p-6">Grade</th>
                  <th className="text-center p-6">Position</th>
                  <th className="text-center p-6">Attendance</th>
                  <th className="text-center p-6">Conduct</th>
                  <th className="text-center p-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dummyReportData.reportCards.map((student) => (
                  <tr key={student.id} className="hover:bg-[#F7F5F0]/70">
                    <td className="p-6 font-mono">{student.id}</td>
                    <td className="p-6 font-medium">{student.name}</td>
                    <td className="p-6 text-center font-bold text-lg">{student.average}</td>
                    <td className="p-6 text-center">
                      <span className="inline-block px-6 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                        {student.grade}
                      </span>
                    </td>
                    <td className="p-6 text-center font-semibold">{student.position}</td>
                    <td className="p-6 text-center">{student.attendance}</td>
                    <td className="p-6 text-center text-sm">{student.conduct}</td>
                    <td className="p-6 text-center">
                      <button className="px-6 py-2 bg-[#0F2044] text-white text-sm rounded-2xl hover:bg-[#1a2a5c]">
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportType === "performance" && (
        <div className="bg-white rounded-3xl p-10 border border-[#0F2044]/8">
          <h3 className="text-2xl font-semibold mb-8">Performance Trends</h3>
          <div className="h-80 flex items-center justify-center border border-dashed border-[#0F2044]/20 rounded-3xl">
            <div className="text-center">
              <TrendingUp className="w-16 h-16 mx-auto text-[#F4B400] mb-4" />
              <p className="font-medium">Line chart showing Term 1 vs Term 2 performance would appear here</p>
              <p className="text-sm text-[#0F2044]/60 mt-2">Class average improved from 65.2 to 68.4</p>
            </div>
          </div>
        </div>
      )}

      {reportType === "attendance" && (
        <div className="bg-white rounded-3xl p-10 border border-[#0F2044]/8 text-center">
          <Users className="w-16 h-16 mx-auto text-emerald-600 mb-6" />
          <h3 className="text-2xl font-semibold">Attendance Reports</h3>
          <p className="mt-4 text-[#0F2044]/60 max-w-md mx-auto">
            School-wide attendance: 89% • Boarding roll-call compliance: 93%<br />
            At-risk students (below 75%): 18 students
          </p>
          <button className="mt-8 px-10 py-4 bg-[#0F2044] text-white rounded-2xl">
            Generate Detailed Attendance PDF
          </button>
        </div>
      )}

      {reportType === "discipline" && (
        <div className="bg-white rounded-3xl p-10 border border-[#0F2044]/8">
          <h3 className="text-2xl font-semibold mb-6">Discipline Summary Report</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-8 bg-red-50 rounded-3xl">
              <p className="text-red-700 font-medium">Serious Cases This Term</p>
              <p className="text-6xl font-bold text-red-600 mt-4">7</p>
            </div>
            <div className="p-8 bg-amber-50 rounded-3xl">
              <p className="text-amber-700 font-medium">Most Common Offense</p>
              <p className="text-2xl font-semibold mt-6">Late for Evening Roll-Call</p>
              <p className="text-sm text-[#0F2044]/60 mt-2">14 incidents</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}