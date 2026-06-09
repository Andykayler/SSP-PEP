// pages/bursar/modules/Reports.jsx
import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

const IC = {
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>,
  chart:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>,
  warning:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  check:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
};

const Spinner = () => (
  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

const Btn = ({ children, variant = "primary", size = "md", loading, className = "", ...props }) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-sm" };
  const variants = {
    primary: "bg-[#0F2044] text-white hover:bg-[#0F2044]/90",
    gold:    "bg-[#F4B400] text-[#0F2044] hover:brightness-105",
    ghost:   "border border-[#0F2044]/15 text-[#0F2044]/70 hover:bg-[#0F2044]/5",
    teal:    "bg-teal-600 text-white hover:bg-teal-700",
  };
  return <button {...props} disabled={loading || props.disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>{loading ? <Spinner /> : children}</button>;
};

const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

export default function Reports({ schoolCode, schoolName }) {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [feeAssignments, setFeeAssignments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [activeReport, setActiveReport] = useState("summary");
  const [classFilter, setClassFilter] = useState("all");

  useEffect(() => { fetchAll(); }, [academicYear]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [stSnap, clSnap, faSnap, pySnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
      ]);
      setStudents(stSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
      setFeeAssignments(faSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPayments(pySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Compute per-student financials
  function getStudentFinancials(studentId) {
    const assigned = feeAssignments.filter(fa => fa.studentId === studentId);
    const totalCharged = assigned.reduce((s, fa) => s + (fa.amount || 0), 0);
    const totalPaid = payments.filter(p => p.studentId === studentId).reduce((s, p) => s + (p.amount || 0), 0);
    return { totalCharged, totalPaid, balance: totalCharged - totalPaid };
  }

  const enriched = students.map(s => ({ ...s, ...getStudentFinancials(s.id) }));

  // Overall summary
  const summary = enriched.reduce((acc, s) => {
    acc.totalCharged += s.totalCharged;
    acc.totalPaid += s.totalPaid;
    acc.totalBalance += s.balance;
    if (s.totalCharged > 0) {
      if (s.balance <= 0) acc.paid++;
      else if (s.totalPaid > 0) acc.partial++;
      else acc.unpaid++;
    } else { acc.noFees++; }
    return acc;
  }, { totalCharged: 0, totalPaid: 0, totalBalance: 0, paid: 0, partial: 0, unpaid: 0, noFees: 0 });

  // Class breakdown
  const classBreakdown = classes.map(cls => {
    const classStudents = enriched.filter(s => s.classId === cls.id);
    const totalCharged = classStudents.reduce((s, st) => s + st.totalCharged, 0);
    const totalPaid = classStudents.reduce((s, st) => s + st.totalPaid, 0);
    const balance = totalCharged - totalPaid;
    const rate = totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 0;
    return { ...cls, studentCount: classStudents.length, totalCharged, totalPaid, balance, rate };
  }).filter(c => c.studentCount > 0);

  // Monthly collections
  const monthlyData = payments.reduce((acc, p) => {
    const month = (p.paymentDate || "").substring(0, 7);
    if (!month) return acc;
    acc[month] = (acc[month] || 0) + p.amount;
    return acc;
  }, {});
  const sortedMonths = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));
  const maxMonthly = Math.max(...sortedMonths.map(([, v]) => v), 1);

  // Outstanding balances
  const outstanding = enriched
    .filter(s => s.balance > 0)
    .filter(s => classFilter === "all" || s.classId === classFilter)
    .sort((a, b) => b.balance - a.balance);

  // Payment method breakdown
  const methodBreakdown = payments.reduce((acc, p) => {
    acc[p.method] = (acc[p.method] || 0) + p.amount;
    return acc;
  }, {});

  // Export CSV
  function exportCSV() {
    const rows = [
      ["Student Name", "Student Code", "Class", "Total Charged (MWK)", "Total Paid (MWK)", "Balance (MWK)", "Status"],
      ...enriched.map(s => [
        s.fullName,
        s.studentCode,
        s.className || "",
        s.totalCharged,
        s.totalPaid,
        s.balance,
        s.balance <= 0 && s.totalCharged > 0 ? "Paid" : s.totalPaid > 0 ? "Partial" : s.totalCharged > 0 ? "Unpaid" : "No Fees",
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fee-report-${academicYear.replace("/", "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const REPORT_TABS = [
    { id: "summary", label: "Overview" },
    { id: "classes", label: "By Class" },
    { id: "outstanding", label: "Outstanding" },
    { id: "collections", label: "Collections" },
  ];

  if (loading) return (
    <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-16 flex flex-col items-center gap-3">
      <Spinner />
      <p className="text-sm text-[#0F2044]/50">Generating reports…</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F2044]">Financial Reports</h2>
          <p className="text-sm text-[#0F2044]/50 mt-0.5">Fee collection summaries and outstanding balances</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none appearance-none">
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn onClick={exportCSV} variant="ghost" size="md">{IC.download} Export CSV</Btn>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 p-1 bg-[#0F2044]/5 rounded-2xl w-fit flex-wrap">
        {REPORT_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveReport(t.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeReport === t.id ? "bg-white text-[#0F2044] shadow-sm" : "text-[#0F2044]/50 hover:text-[#0F2044]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeReport === "summary" && (
        <div className="space-y-5">
          {/* Big numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Fees Charged", value: fmt(summary.totalCharged), sub: "All students", color: "bg-[#0F2044] text-white", subColor: "text-white/50" },
              { label: "Total Collected", value: fmt(summary.totalPaid), sub: `${summary.totalCharged > 0 ? Math.round((summary.totalPaid / summary.totalCharged) * 100) : 0}% collection rate`, color: "bg-emerald-600 text-white", subColor: "text-white/70" },
              { label: "Outstanding Balance", value: fmt(summary.totalBalance), sub: `${summary.unpaid + summary.partial} students`, color: "bg-red-600 text-white", subColor: "text-white/70" },
              { label: "Total Payments", value: payments.length, sub: `${academicYear}`, color: "bg-[#F4B400] text-[#0F2044]", subColor: "text-[#0F2044]/60" },
            ].map(({ label, value, sub, color, subColor }) => (
              <div key={label} className={`rounded-2xl p-5 ${color}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${subColor}`}>{label}</p>
                <p className="text-2xl font-bold">{value}</p>
                <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-4">Student Payment Status</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Fully Paid", count: summary.paid, color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
                { label: "Partial", count: summary.partial, color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
                { label: "Unpaid", count: summary.unpaid, color: "bg-red-100 text-red-700", dot: "bg-red-500" },
                { label: "No Fees Assigned", count: summary.noFees, color: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
              ].map(({ label, count, color, dot }) => (
                <div key={label} className={`rounded-2xl p-4 ${color}`}>
                  <div className="flex items-center gap-2 mb-1"><span className={`w-2 h-2 rounded-full ${dot}`} /><p className="text-xs font-semibold">{label}</p></div>
                  <p className="text-3xl font-bold">{count}</p>
                  <p className="text-xs opacity-60">students</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {summary.totalCharged > 0 && (
              <div className="mt-5">
                <div className="flex justify-between text-xs text-[#0F2044]/50 mb-1.5">
                  <span>Collection progress</span>
                  <span>{Math.round((summary.totalPaid / summary.totalCharged) * 100)}%</span>
                </div>
                <div className="h-3 bg-[#0F2044]/8 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, (summary.totalPaid / summary.totalCharged) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-emerald-600 font-medium">{fmt(summary.totalPaid)} collected</span>
                  <span className="text-red-500 font-medium">{fmt(summary.totalBalance)} remaining</span>
                </div>
              </div>
            )}
          </div>

          {/* Payment method breakdown */}
          {Object.keys(methodBreakdown).length > 0 && (
            <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-4">Collections by Payment Method</p>
              <div className="space-y-3">
                {Object.entries(methodBreakdown).sort(([, a], [, b]) => b - a).map(([method, amount]) => {
                  const pct = summary.totalPaid > 0 ? (amount / summary.totalPaid) * 100 : 0;
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-[#0F2044]">{method}</span>
                        <span className="text-[#0F2044]/60">{fmt(amount)} <span className="text-xs text-[#0F2044]/30">({Math.round(pct)}%)</span></span>
                      </div>
                      <div className="h-2 bg-[#0F2044]/8 rounded-full overflow-hidden">
                        <div className="h-full bg-[#F4B400] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Class Breakdown Tab ── */}
      {activeReport === "classes" && (
        <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
          {classBreakdown.length === 0 ? (
            <div className="p-12 text-center"><p className="text-[#0F2044]/50">No data available for this period.</p></div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F2044]/5">
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Class</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Students</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widests uppercase text-[#0F2044]/40 hidden sm:table-cell">Charged</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden sm:table-cell">Collected</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Balance</th>
                  <th className="px-5 py-3.5 text-center text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {classBreakdown.map(cls => (
                  <tr key={cls.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${cls.level === "primary" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{cls.level === "primary" ? "P" : "S"}</span>
                        <span className="font-semibold text-[#0F2044]">{cls.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-sm text-[#0F2044]/60">{cls.studentCount}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-[#0F2044]/60 hidden sm:table-cell">{fmt(cls.totalCharged)}</td>
                    <td className="px-5 py-3.5 text-right text-sm text-emerald-600 font-medium hidden sm:table-cell">{fmt(cls.totalPaid)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-sm text-red-600">{fmt(cls.balance)}</td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-2 w-20 bg-[#0F2044]/10 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${cls.rate}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-[#0F2044]/60 w-8">{cls.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Outstanding Tab ── */}
      {activeReport === "outstanding" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none appearance-none">
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
              {outstanding.length} students · {fmt(outstanding.reduce((s, st) => s + st.balance, 0))} total outstanding
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
            {outstanding.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600">{IC.check}</div>
                <p className="font-semibold text-[#0F2044] mb-1">No outstanding balances!</p>
                <p className="text-sm text-[#0F2044]/50">All students are fully paid up for {academicYear}</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#0F2044]/5">
                    <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Student</th>
                    <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Class</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden sm:table-cell">Charged</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden sm:table-cell">Paid</th>
                    <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Balance Due</th>
                    <th className="px-5 py-3.5 text-center text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden lg:table-cell">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0F2044]/5">
                  {outstanding.map(s => {
                    const pct = s.totalCharged > 0 ? Math.round((s.totalPaid / s.totalCharged) * 100) : 0;
                    return (
                      <tr key={s.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${s.gender === "Female" ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>{initials(s.fullName)}</div>
                            <div>
                              <div className="text-sm font-semibold text-[#0F2044]">{s.fullName}</div>
                              <div className="text-xs text-[#0F2044]/40 font-mono">{s.studentCode}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-[#0F2044]/60 hidden md:table-cell">{s.className}</td>
                        <td className="px-5 py-3.5 text-right text-sm text-[#0F2044]/60 hidden sm:table-cell">{fmt(s.totalCharged)}</td>
                        <td className="px-5 py-3.5 text-right text-sm text-emerald-600 hidden sm:table-cell">{fmt(s.totalPaid)}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-red-600">{fmt(s.balance)}</td>
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 bg-[#0F2044]/10 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-[#0F2044]/40">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Collections Timeline ── */}
      {activeReport === "collections" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-5">Monthly Collections — {academicYear}</p>
            {sortedMonths.length === 0 ? (
              <div className="py-12 text-center text-[#0F2044]/50 text-sm">No payments recorded yet</div>
            ) : (
              <div className="space-y-3">
                {sortedMonths.map(([month, amount]) => {
                  const pct = (amount / maxMonthly) * 100;
                  const [year, mo] = month.split("-");
                  const label = new Date(Number(year), Number(mo) - 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
                  return (
                    <div key={month} className="flex items-center gap-4">
                      <div className="w-32 text-xs font-medium text-[#0F2044]/60 text-right flex-shrink-0">{label}</div>
                      <div className="flex-1 h-8 bg-[#F7F5F0] rounded-xl overflow-hidden">
                        <div className="h-full bg-[#0F2044] rounded-xl flex items-center justify-end pr-3 transition-all" style={{ width: `${Math.max(pct, 3)}%` }}>
                          {pct > 20 && <span className="text-xs font-bold text-white">{fmt(amount)}</span>}
                        </div>
                      </div>
                      {pct <= 20 && <div className="text-xs font-bold text-[#0F2044]/60 flex-shrink-0">{fmt(amount)}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent transactions table */}
          <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#0F2044]/5 bg-[#F7F5F0] flex items-center justify-between">
              <p className="text-sm font-semibold text-[#0F2044]">All Transactions ({academicYear})</p>
              <span className="text-xs text-[#0F2044]/40">{payments.length} records · {fmt(payments.reduce((s, p) => s + p.amount, 0))}</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0F2044]/5">
                  <th className="px-5 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Student</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Receipt</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden sm:table-cell">Method</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {[...payments].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(p => (
                  <tr key={p.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-[#0F2044]">{p.studentName}</div>
                      <div className="text-xs text-[#0F2044]/40">{p.className}</div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell"><span className="font-mono text-xs text-[#0F2044]/50">{p.receiptNo}</span></td>
                    <td className="px-5 py-3 text-xs text-[#0F2044]/60 hidden sm:table-cell">{p.method}</td>
                    <td className="px-5 py-3 text-xs text-[#0F2044]/40 hidden lg:table-cell">{p.paymentDate}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-700 text-sm">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}