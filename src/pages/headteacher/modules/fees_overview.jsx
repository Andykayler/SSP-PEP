// modules/FeesOverview.jsx
import { useState } from "react";
import { DollarSign, Download, Send, CheckCircle, AlertTriangle, CreditCard } from "lucide-react";

const dummyFeeData = [
  {
    id: "SS24001",
    name: "Chisomo Banda",
    form: "Form 3A",
    boarding: true,
    totalDue: 185000,
    amountPaid: 185000,
    balance: 0,
    lastPayment: "2026-04-02",
    paymentMethod: "Airtel Money",
    status: "Paid"
  },
  {
    id: "SS24002",
    name: "Amina Phiri",
    form: "Form 3A",
    boarding: true,
    totalDue: 185000,
    amountPaid: 120000,
    balance: 65000,
    lastPayment: "2026-03-15",
    paymentMethod: "Bank Transfer",
    status: "Partial"
  },
  {
    id: "SS24003",
    name: "Kelvin Mwale",
    form: "Form 4A",
    boarding: false,
    totalDue: 95000,
    amountPaid: 95000,
    balance: 0,
    lastPayment: "2026-04-10",
    paymentMethod: "TNM Mpamba",
    status: "Paid"
  },
  {
    id: "SS24005",
    name: "Blessings Nyirenda",
    form: "Form 2B",
    boarding: true,
    totalDue: 185000,
    amountPaid: 45000,
    balance: 140000,
    lastPayment: "2026-01-20",
    paymentMethod: "Cash",
    status: "Arrears"
  },
  {
    id: "SS24007",
    name: "Esther Chirwa",
    form: "Form 4B",
    boarding: true,
    totalDue: 185000,
    amountPaid: 185000,
    balance: 0,
    lastPayment: "2026-04-05",
    paymentMethod: "Airtel Money",
    status: "Paid"
  },
];

export default function FeesOverview() {
  const [feesData] = useState(dummyFeeData);
  const [filterStatus, setFilterStatus] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredFees = feesData.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "All" || student.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalDue = feesData.reduce((sum, s) => sum + s.totalDue, 0);
  const totalPaid = feesData.reduce((sum, s) => sum + s.amountPaid, 0);
  const totalBalance = feesData.reduce((sum, s) => sum + s.balance, 0);
  const arrearsCount = feesData.filter(s => s.balance > 0).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Fee Tracking & Payments
          </h2>
          <p className="text-[#0F2044]/60">Term 2 • 2026 • Lilongwe Secondary School</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a2a5c]">
            <Send className="w-5 h-5" /> Send Reminders
          </button>
          <button className="flex items-center gap-3 border border-[#0F2044]/20 px-6 py-3.5 rounded-2xl hover:bg-[#F7F5F0]">
            <Download className="w-5 h-5" /> Export Statement
          </button>
        </div>
      </div>

      {/* School Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-[#0F2044]/60">Total Due This Term</p>
              <p className="text-4xl font-bold text-[#0F2044] mt-3">MK {totalDue.toLocaleString()}</p>
            </div>
            <DollarSign className="w-12 h-12 text-[#F4B400]" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-[#0F2044]/60">Total Collected</p>
              <p className="text-4xl font-bold text-emerald-600 mt-3">MK {totalPaid.toLocaleString()}</p>
            </div>
            <CheckCircle className="w-12 h-12 text-emerald-600" />
          </div>
          <p className="text-xs text-emerald-600 mt-4">Collection Rate: {Math.round((totalPaid / totalDue) * 100)}%</p>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-[#0F2044]/60">Outstanding Balance</p>
              <p className="text-4xl font-bold text-red-600 mt-3">MK {totalBalance.toLocaleString()}</p>
            </div>
            <AlertTriangle className="w-12 h-12 text-red-600" />
          </div>
          <p className="text-xs text-red-600 mt-4">{arrearsCount} students in arrears</p>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8 flex flex-col justify-center">
          <p className="text-sm text-[#0F2044]/60">Payment Methods Used</p>
          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-[#F4B400]" />
              <span className="font-medium">Airtel Money</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-blue-600" />
              <span className="font-medium">TNM Mpamba</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search student name or admission number..."
            className="w-full pl-6 pr-6 py-4 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select 
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-6 py-4 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none min-w-[180px]"
        >
          <option value="All">All Students</option>
          <option value="Paid">Paid</option>
          <option value="Partial">Partial Payment</option>
          <option value="Arrears">Arrears</option>
        </select>
      </div>

      {/* Fees Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <table className="w-full">
          <thead className="bg-[#F7F5F0]">
            <tr>
              <th className="text-left p-6">Adm. No.</th>
              <th className="text-left p-6">Student Name</th>
              <th className="text-left p-6">Form</th>
              <th className="text-center p-6">Boarding</th>
              <th className="text-right p-6">Total Due (MK)</th>
              <th className="text-right p-6">Paid (MK)</th>
              <th className="text-right p-6">Balance (MK)</th>
              <th className="text-center p-6">Last Payment</th>
              <th className="text-center p-6">Method</th>
              <th className="text-center p-6">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0F2044]/5">
            {filteredFees.map((student) => (
              <tr key={student.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                <td className="p-6 font-mono text-sm">{student.id}</td>
                <td className="p-6 font-medium">{student.name}</td>
                <td className="p-6">{student.form}</td>
                <td className="p-6 text-center">
                  <span className={`inline-block px-4 py-1 rounded-full text-xs ${student.boarding ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {student.boarding ? "Yes" : "Day"}
                  </span>
                </td>
                <td className="p-6 text-right font-medium">MK {student.totalDue.toLocaleString()}</td>
                <td className="p-6 text-right font-medium text-emerald-600">MK {student.amountPaid.toLocaleString()}</td>
                <td className="p-6 text-right font-medium">
                  <span className={student.balance > 0 ? "text-red-600" : "text-emerald-600"}>
                    MK {student.balance.toLocaleString()}
                  </span>
                </td>
                <td className="p-6 text-center text-sm text-[#0F2044]/70">{student.lastPayment}</td>
                <td className="p-6 text-center text-sm">{student.paymentMethod}</td>
                <td className="p-6 text-center">
                  <span className={`inline-block px-5 py-1 rounded-full text-xs font-medium
                    ${student.status === "Paid" ? "bg-emerald-100 text-emerald-700" : 
                      student.status === "Partial" ? "bg-amber-100 text-amber-700" : 
                      "bg-red-100 text-red-700"}`}>
                    {student.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Actions for Bursar */}
      <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
        <h3 className="font-semibold text-lg mb-6">Quick Bursar Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button className="p-8 border border-[#0F2044]/10 rounded-3xl hover:border-[#F4B400] hover:bg-[#F7F5F0] transition-all text-left">
            <CreditCard className="w-10 h-10 text-[#F4B400] mb-4" />
            <div className="font-medium">Record New Payment</div>
            <div className="text-sm text-[#0F2044]/60 mt-1">Via Airtel Money, Mpamba or Bank</div>
          </button>
          <button className="p-8 border border-[#0F2044]/10 rounded-3xl hover:border-[#F4B400] hover:bg-[#F7F5F0] transition-all text-left">
            <Send className="w-10 h-10 text-red-600 mb-4" />
            <div className="font-medium">Send Bulk Reminders</div>
            <div className="text-sm text-[#0F2044]/60 mt-1">To parents with arrears</div>
          </button>
          <button className="p-8 border border-[#0F2044]/10 rounded-3xl hover:border-[#F4B400] hover:bg-[#F7F5F0] transition-all text-left">
            <Download className="w-10 h-10 text-[#0F2044] mb-4" />
            <div className="font-medium">Generate Financial Report</div>
            <div className="text-sm text-[#0F2044]/60 mt-1">For Head Teacher & SMC</div>
          </button>
        </div>
      </div>
    </div>
  );
}