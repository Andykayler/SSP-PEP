// modules/AttendanceOverview.jsx
import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  Calendar, RefreshCw, Download, TrendingUp, TrendingDown,
  Users, CheckCircle, Clock, XCircle, BarChart3, Search,
} from "lucide-react";
import "./staff-management.css";

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

function KpiCard({ label, value, sub, icon: Icon, accent = "neutral", loading }) {
  let cardClass = "stat-card";
  let valueClass = "stat-card__value";
  if (accent === "success") valueClass += " stat-card__value--success";
  if (accent === "warning") valueClass += " stat-card__value--warning";
  if (accent === "danger") valueClass += " stat-card__value--danger";
  if (accent === "info") valueClass += " stat-card__value--accent";
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card__label">{label}</div>
          <div className={valueClass}>{loading ? <Spinner size={22} /> : value}</div>
          {sub && <div className="stat-card__sub">{sub}</div>}
        </div>
        {Icon && <Icon size={24} className="text-muted shrink-0" />}
      </div>
    </div>
  );
}

function RateBar({ value }) {
  const color = value >= 90 ? "var(--success)" : value >= 75 ? "var(--primary)" : value >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-primary-dim rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold text-app-text/70 w-9 text-right">{value}%</span>
    </div>
  );
}

function rankBadge(rank) {
  if (rank === 1) return "bg-warning text-app-text";
  if (rank === 2) return "bg-gray-200 text-gray-700";
  if (rank === 3) return "bg-amber-100 text-amber-700";
  return "bg-app-bg text-muted";
}

function exportToCsv(data, columns, filename) {
  const csvRows = [];
  csvRows.push(columns.map(c => c.label).join(","));
  for (const row of data) {
    const values = columns.map(c => {
      const val = row[c.key];
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  }
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceOverview({ schoolCode }) {
  const [classes, setClasses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchData() {
    setLoading(true);
    try {
      const classSnap = await getDocs(
        query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
      );
      const classList = classSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setClasses(classList);

      const attSnap = await getDocs(
        query(
          collection(db, "attendance"),
          where("schoolCode", "==", schoolCode),
          where("date", "==", selectedDate)
        )
      );
      setAttendanceRecords(attSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }

  const classSummary = useMemo(() => {
    return classes.map((cls) => {
      const record = attendanceRecords.find((r) => r.classId === cls.id);
      const recordsObj = record?.records || {};
      const total = Object.keys(recordsObj).length;
      const present = Object.values(recordsObj).filter((r) => r.status === "Present").length;
      const late = Object.values(recordsObj).filter((r) => r.status === "Late").length;
      const absent = Object.values(recordsObj).filter((r) => r.status === "Absent").length;
      const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      return { ...cls, totalStudents: total, present, late, absent, attendanceRate };
    });
  }, [classes, attendanceRecords]);

  const filteredSummary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? classSummary.filter((c) => c.name?.toLowerCase().includes(q)) : classSummary;
    return [...list].sort((a, b) => b.attendanceRate - a.attendanceRate);
  }, [classSummary, search]);

  const overallPresent = attendanceRecords.reduce(
    (sum, r) => sum + Object.values(r.records || {}).filter((rec) => rec.status === "Present").length,
    0
  );
  const overallLate = attendanceRecords.reduce(
    (sum, r) => sum + Object.values(r.records || {}).filter((rec) => rec.status === "Late").length,
    0
  );
  const overallAbsent = attendanceRecords.reduce(
    (sum, r) => sum + Object.values(r.records || {}).filter((rec) => rec.status === "Absent").length,
    0
  );
  const totalStudents = classSummary.reduce((sum, c) => sum + c.totalStudents, 0);
  const overallRate = totalStudents > 0 ? Math.round(((overallPresent + overallLate) / totalStudents) * 100) : 0;

  const withData = classSummary.filter((c) => c.totalStudents > 0);
  const bestClass = withData.length ? [...withData].sort((a, b) => b.attendanceRate - a.attendanceRate)[0] : null;
  const worstClass = withData.length ? [...withData].sort((a, b) => a.attendanceRate - b.attendanceRate)[0] : null;

  const dateLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const handleExport = () => {
    exportToCsv(
      filteredSummary,
      [
        { key: "name", label: "Class" },
        { key: "totalStudents", label: "Total Students" },
        { key: "present", label: "Present" },
        { key: "late", label: "Late" },
        { key: "absent", label: "Absent" },
        { key: "attendanceRate", label: "Rate %" },
      ],
      `attendance-${selectedDate}.csv`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Attendance Analytics</h2>
          <p className="text-muted">School-wide attendance insights · {dateLabel}</p>
        </div>
        <div className="flex gap-2">
          <div className="search-wrapper" style={{ margin: 0, width: "auto" }}>
            <Calendar size={14} className="search-icon" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="search-input"
              style={{ padding: "8px 12px 8px 36px", width: "160px" }}
            />
          </div>
          <button onClick={fetchData} disabled={loading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button onClick={handleExport} disabled={loading || !filteredSummary.length} className="btn-refresh">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <KpiCard label="Total Students" value={totalStudents} icon={Users} accent="info" loading={loading} />
        <KpiCard label="Present" value={overallPresent} icon={CheckCircle} accent="success" loading={loading} />
        <KpiCard label="Late" value={overallLate} icon={Clock} accent="warning" loading={loading} />
        <KpiCard label="Absent" value={overallAbsent} icon={XCircle} accent="danger" loading={loading} />
        <KpiCard label="Attendance Rate" value={`${overallRate}%`} sub="Present + late" icon={BarChart3} accent="neutral" loading={loading} />
      </div>

      {/* Best / Worst Class Insights */}
      {!loading && (bestClass || worstClass) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bestClass && (
            <div className="card p-5 flex items-center gap-4 border-success/30 bg-success/5">
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <TrendingUp size={22} className="text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-success">Best Performing Class</p>
                <p className="font-bold text-app-text truncate">{bestClass.name}</p>
                <p className="text-sm text-success font-semibold">{bestClass.attendanceRate}% attendance · {bestClass.present} present</p>
              </div>
            </div>
          )}
          {worstClass && worstClass.id !== bestClass?.id && (
            <div className="card p-5 flex items-center gap-4 border-warning/30 bg-warning/5">
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <TrendingDown size={22} className="text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-warning">Needs Attention</p>
                <p className="font-bold text-app-text truncate">{worstClass.name}</p>
                <p className="text-sm text-warning font-semibold">{worstClass.attendanceRate}% attendance · {worstClass.absent} absent</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="cc__head">
          <div className="cc__head-left">
            <BarChart3 size={18} />
            <h3>Class Attendance Ranking</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs">{dateLabel}</span>
            <div className="search-wrapper" style={{ margin: 0 }}>
              <Search size={12} className="search-icon" />
              <input
                type="text"
                placeholder="Search classes…"
                className="search-input"
                style={{ padding: "6px 12px 6px 32px", fontSize: "0.75rem", width: "180px" }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="data-table-wrap">
          {loading ? (
            <div className="empty-state py-12"><Spinner size={28} /><p className="empty-state__sub">Loading attendance…</p></div>
          ) : filteredSummary.length === 0 ? (
            <div className="empty-state py-12">
              <Users size={32} className="text-muted" />
              <p className="empty-state__title">No attendance data</p>
              <p className="empty-state__sub">{search ? "No classes match your search." : "No classes or attendance records for this date."}</p>
            </div>
          ) : (
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Rank</th><th>Class</th><th>Students</th><th>Present</th><th>Late</th><th>Absent</th><th>Rate</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.map((cls, idx) => {
                  const rateLabel = cls.attendanceRate >= 90 ? "Excellent" : cls.attendanceRate >= 75 ? "Good" : cls.attendanceRate >= 60 ? "Fair" : "Low";
                  const rateVariant = cls.attendanceRate >= 90 ? "success" : cls.attendanceRate >= 75 ? "success" : cls.attendanceRate >= 60 ? "warning" : "danger";
                  return (
                    <tr key={cls.id}>
                      <td data-label="Rank">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-bold ${rankBadge(idx + 1)}`}>
                          {idx + 1}
                        </span>
                       </td>
                      <td data-label="Class" className="font-semibold">{cls.name}</td>
                      <td data-label="Students">{cls.totalStudents}</td>
                      <td data-label="Present" className="text-success">{cls.present}</td>
                      <td data-label="Late" className="text-warning">{cls.late}</td>
                      <td data-label="Absent" className="text-danger">{cls.absent}</td>
                      <td data-label="Rate"><RateBar value={cls.attendanceRate} /></td>
                      <td data-label="Status">
                        <span className={`status-pill status-pill--${rateVariant}`}>{rateLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="cc__head border-t">
          <p className="text-muted text-[10px]">Rankings based on attendance rate (present + late) for the selected date.</p>
        </div>
      </div>
    </div>
  );
}