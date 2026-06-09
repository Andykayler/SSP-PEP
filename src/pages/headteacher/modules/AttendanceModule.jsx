// pages/head/modules/AttendanceOverview.jsx
import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs,
} from "firebase/firestore";

// ─── Icons ────────────────────────────────────────────────────────────────
const IC = {
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 01-5.356-1.857M17 20H7m5-2v2m-5-2v2m-3-2h.005M7 20H5"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.058 11H1M12 3v2m0 16v2m9-9H15M10 11l-.293-.293a1 1 0 00-1.414 0L5 13"/></svg>,
};

const Spinner = () => (
  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { 
    weekday: "short", 
    day: "numeric", 
    month: "short" 
  });
}

export default function AttendanceOverview({ schoolCode }) {
  const [classes, setClasses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch all classes
      const classSnap = await getDocs(
        query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
      );
      const classList = classSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.order - b.order);
      setClasses(classList);

      // Fetch attendance for selected date
      const attSnap = await getDocs(
        query(
          collection(db, "attendance"), 
          where("schoolCode", "==", schoolCode), 
          where("date", "==", selectedDate)
        )
      );

      const records = attSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setAttendanceRecords(records);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredRecords = attendanceRecords.filter(record => {
    if (selectedClassId === "all") return true;
    return record.classId === selectedClassId;
  });

  // Class-wise summary
  const classSummary = classes.map(cls => {
    const record = filteredRecords.find(r => r.classId === cls.id);
    const recordsObj = record?.records || {};
    const total = Object.keys(recordsObj).length;

    const present = Object.values(recordsObj).filter(r => r.status === "Present").length;
    const late = Object.values(recordsObj).filter(r => r.status === "Late").length;
    const absent = Object.values(recordsObj).filter(r => r.status === "Absent").length;

    return {
      ...cls,
      totalStudents: total,
      present,
      late,
      absent,
      unmarked: total - (present + late + absent),
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 0
    };
  });

  const overallPresent = filteredRecords.reduce((sum, r) => {
    return sum + Object.values(r.records || {}).filter(rec => rec.status === "Present").length;
  }, 0);

  const totalStudents = classSummary.reduce((sum, c) => sum + c.totalStudents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-app-text">Attendance Overview</h2>
          <p className="text-app-text/60">School-wide attendance report</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2.5 border border-app-border rounded-xl text-sm focus:border-[#0F2044]"
          />
          <button 
            onClick={fetchData} 
            className="p-2.5 border border-app-border rounded-xl hover:bg-app-bg transition-colors"
          >
            {IC.refresh}
          </button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-app-surface border border-app-border rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-app-text/50">Present Today</p>
          <p className="text-4xl font-bold text-emerald-600 mt-1">{overallPresent}</p>
        </div>
        <div className="bg-app-surface border border-app-border rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-app-text/50">Attendance Rate</p>
          <p className="text-4xl font-bold text-app-text mt-1">
            {totalStudents > 0 ? Math.round((overallPresent / totalStudents) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Class-wise Table */}
      <div className="bg-app-surface rounded-2xl border border-app-border overflow-hidden">
        <div className="px-6 py-4 bg-app-bg border-b flex items-center justify-between">
          <h3 className="font-semibold text-app-text">
            {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
        </div>

        {loading ? (
          <div className="p-20 flex justify-center"><Spinner /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0F2044]/5">
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-app-text/50">Class</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-app-text/50">Total Students</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-emerald-600">Present</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-amber-600">Late</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-red-600">Absent</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-app-text">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {classSummary.map(cls => (
                <tr key={cls.id} className="hover:bg-app-bg/60 transition-colors">
                  <td className="px-6 py-4 font-medium text-app-text">{cls.name}</td>
                  <td className="px-6 py-4 text-right text-sm">{cls.totalStudents}</td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-medium">{cls.present}</td>
                  <td className="px-6 py-4 text-right text-amber-600 font-medium">{cls.late}</td>
                  <td className="px-6 py-4 text-right text-red-600 font-medium">{cls.absent}</td>
                  <td className="px-6 py-4 text-right font-semibold text-app-text">
                    {cls.attendanceRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}