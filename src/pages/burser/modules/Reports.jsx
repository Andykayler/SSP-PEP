// pages/bursar/modules/Reports.jsx
import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Download, TrendingUp, Users, AlertTriangle, Receipt, BarChart3, Check } from "lucide-react";
import "./staff-management.css";

const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export default function Reports({ schoolCode, schoolName }) {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [feeAssignments, setFeeAssignments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [activeTab, setActiveTab] = useState("overview");
  const [classFilter, setClassFilter] = useState("all");

  useEffect(() => {
    fetchAll();
  }, [academicYear]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [stSnap, clSnap, faSnap, pySnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear), orderBy("createdAt", "desc"))),
      ]);

      setStudents(stSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setFeeAssignments(faSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPayments(pySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  // Enriched student data
  const enriched = useMemo(() => {
    return students.map(s => {
      const assigned = feeAssignments.filter(fa => fa.studentId === s.id);
      const totalCharged = assigned.reduce((sum, fa) => sum + (fa.amount || 0), 0);
      const totalPaid = payments.filter(p => p.studentId === s.id).reduce((sum, p) => sum + (p.amount || 0), 0);
      return { ...s, totalCharged, totalPaid, balance: totalCharged - totalPaid };
    });
  }, [students, feeAssignments, payments]);

  const summary = useMemo(() => {
    return enriched.reduce((acc, s) => {
      acc.totalCharged += s.totalCharged;
      acc.totalPaid += s.totalPaid;
      acc.totalBalance += Math.max(s.balance, 0);
      if (s.totalCharged > 0) {
        if (s.balance <= 0) acc.fullyPaid++;
        else if (s.totalPaid > 0) acc.partial++;
        else acc.unpaid++;
      } else acc.noFees++;
      return acc;
    }, { totalCharged: 0, totalPaid: 0, totalBalance: 0, fullyPaid: 0, partial: 0, unpaid: 0, noFees: 0 });
  }, [enriched]);

  const collectionRate = summary.totalCharged > 0 ? Math.round((summary.totalPaid / summary.totalCharged) * 100) : 0;

  // Class breakdown
  const classBreakdown = useMemo(() => {
    return classes.map(cls => {
      const clsStudents = enriched.filter(s => s.classId === cls.id);
      const charged = clsStudents.reduce((sum, s) => sum + s.totalCharged, 0);
      const paid = clsStudents.reduce((sum, s) => sum + s.totalPaid, 0);
      return {
        ...cls,
        studentCount: clsStudents.length,
        charged,
        paid,
        balance: charged - paid,
        rate: charged > 0 ? Math.round((paid / charged) * 100) : 0
      };
    }).filter(c => c.studentCount > 0);
  }, [classes, enriched]);

  // Outstanding students
  const outstanding = useMemo(() => {
    return enriched
      .filter(s => s.balance > 0 && (classFilter === "all" || s.classId === classFilter))
      .sort((a, b) => b.balance - a.balance);
  }, [enriched, classFilter]);

  // Monthly collections
  const monthlyCollections = useMemo(() => {
    const map = {};
    payments.forEach(p => {
      const month = p.paymentDate?.slice(0, 7);
      if (month) map[month] = (map[month] || 0) + p.amount;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [payments]);

  const maxMonthlyAmount = useMemo(
    () => Math.max(1, ...monthlyCollections.map(([, amount]) => amount)),
    [monthlyCollections]
  );

  const exportCSV = () => {
    const headers = ["Student Name", "Code", "Class", "Charged", "Paid", "Balance", "Status"];
    const rows = enriched.map(s => [
      s.fullName, s.studentCode, s.className || "",
      s.totalCharged, s.totalPaid, s.balance,
      s.balance <= 0 && s.totalCharged > 0 ? "Fully Paid" : s.totalPaid > 0 ? "Partial" : s.totalCharged > 0 ? "Unpaid" : "No Fees"
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fee-report-${academicYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "classes", label: "By Class", icon: Users },
    { id: "outstanding", label: "Outstanding", icon: AlertTriangle },
    { id: "collections", label: "Collections", icon: Receipt },
  ];

  if (loading) {
    return (
      <div className="card flex flex-col items-center justify-center" style={{ padding: "80px 0" }}>
        <div className="spinner" style={{ width: "48px", height: "48px" }} />
        <p className="mt-4 text-muted">Preparing financial intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex-between flex-wrap">
        <div>
          <h2>Financial Reports</h2>
          <p className="text-muted">Real-time insights into fee collection performance</p>
        </div>

        <div className="flex gap-2">
          <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="form-input form-input--compact">
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCSV} className="btn btn--secondary flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab flex items-center gap-2 ${activeTab === tab.id ? "tab--active" : ""}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card__label">Total Charged</div>
              <div className="stat-card__value">{fmt(summary.totalCharged)}</div>
              <div className="stat-card__sub">Across all students</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Total Collected</div>
              <div className="stat-card__value text-success">{fmt(summary.totalPaid)}</div>
              <div className="stat-card__sub">{collectionRate}% collection rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Outstanding</div>
              <div className="stat-card__value text-danger">{fmt(summary.totalBalance)}</div>
              <div className="stat-card__sub">{summary.unpaid + summary.partial} students</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Collection Rate</div>
              <div className="stat-card__value">{collectionRate}%</div>
              <div className="progress-bar mt-2">
                <div className="progress-bar__fill progress-bar__fill--success" style={{ width: `${collectionRate}%` }} />
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="stats-grid">
            {[
              { label: "Fully Paid", count: summary.fullyPaid, tile: "stat-tile--success" },
              { label: "Partial", count: summary.partial, tile: "stat-tile--warning" },
              { label: "Unpaid", count: summary.unpaid, tile: "stat-tile--danger" },
              { label: "No Fees", count: summary.noFees, tile: "stat-tile--neutral" },
            ].map(({ label, count, tile }) => (
              <div key={label} className={`card p-5 ${tile}`}>
                <div className="text-sm text-muted">{label}</div>
                <div className="text-4xl font-bold mt-1">{count}</div>
                <div className="text-xs text-muted mt-1">students</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BY CLASS */}
      {activeTab === "classes" && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                  <th>Charged</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {classBreakdown.map(cls => (
                  <tr key={cls.id}>
                    <td className="font-medium">{cls.name}</td>
                    <td>{cls.studentCount}</td>
                    <td className="text-right">{fmt(cls.charged)}</td>
                    <td className="text-right text-success">{fmt(cls.paid)}</td>
                    <td className="text-right text-danger">{fmt(cls.balance)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar flex-1">
                          <div className="progress-bar__fill progress-bar__fill--success" style={{ width: `${cls.rate}%` }} />
                        </div>
                        <span className="text-sm font-medium">{cls.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OUTSTANDING */}
      {activeTab === "outstanding" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="form-input form-input--compact">
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="text-sm text-muted">
              {outstanding.length} students • {fmt(outstanding.reduce((sum, s) => sum + s.balance, 0))} due
            </div>
          </div>

          <div className="card">
            {outstanding.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon"><Check size={28} /></div>
                <div className="empty-state__title">All Clear!</div>
                <p className="empty-state__sub">No outstanding balances this term</p>
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Charged</th>
                      <th>Paid</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstanding.map(s => (
                      <tr key={s.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="assignment-avatar">{initials(s.fullName)}</div>
                            <div>
                              <div className="data-table__primary">{s.fullName}</div>
                              <div className="data-table__meta">{s.studentCode}</div>
                            </div>
                          </div>
                        </td>
                        <td>{s.className}</td>
                        <td className="text-right">{fmt(s.totalCharged)}</td>
                        <td className="text-right text-success">{fmt(s.totalPaid)}</td>
                        <td className="text-right font-bold text-danger">{fmt(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COLLECTIONS */}
      {activeTab === "collections" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="font-semibold mb-5 flex items-center gap-2">
              <TrendingUp size={18} /> Monthly Collection Trend
            </h3>
            {monthlyCollections.length > 0 ? (
              <div className="space-y-5">
                {monthlyCollections.map(([month, amount]) => {
                  const [y, m] = month.split("-");
                  const label = new Date(y, m - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                  return (
                    <div key={month} className="flex items-center gap-4">
                      <div className="text-sm font-medium text-muted" style={{ width: 112, flexShrink: 0 }}>{label}</div>
                      <div className="progress-bar flex-1" style={{ height: 12 }}>
                        <div className="progress-bar__fill progress-bar__fill--success" style={{ width: `${(amount / maxMonthlyAmount) * 100}%` }} />
                      </div>
                      <div className="font-semibold text-right" style={{ width: 96, flexShrink: 0 }}>{fmt(amount)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted text-center" style={{ padding: "48px 0" }}>No payments recorded yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
