// modules/StudentManagement.jsx
import { useState } from "react";
import { Search, Eye, Bell, BellRing, X, Check, ChevronDown, Users } from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const dummyStudents = [
  {
    id: "SS24001",
    name: "Chisomo Banda",
    gender: "Male",
    form: "Form 3",
    stream: "A",
    admissionDate: "2024-01-15",
    parent: "Mrs. Grace Banda",
    parentPhone: "0999123456",
    parentEmail: "grace.banda@mail.mw",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Paid",
  },
  {
    id: "SS24002",
    name: "Amina Phiri",
    gender: "Female",
    form: "Form 2",
    stream: "B",
    admissionDate: "2024-01-20",
    parent: "Mr. Joseph Phiri",
    parentPhone: "0888456789",
    parentEmail: "joseph.phiri@mail.mw",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Pending",
  },
  {
    id: "SS24003",
    name: "Kelvin Mwale",
    gender: "Male",
    form: "Form 4",
    stream: "A",
    admissionDate: "2023-09-10",
    parent: "Mrs. Edith Mwale",
    parentPhone: "0999876543",
    parentEmail: "edith.mwale@mail.mw",
    boarding: "No",
    status: "Active",
    feeStatus: "Paid",
  },
  {
    id: "SS24004",
    name: "Tiyamike Kumwenda",
    gender: "Female",
    form: "Form 1",
    stream: "C",
    admissionDate: "2025-01-10",
    parent: "Mr. Patrick Kumwenda",
    parentPhone: "0999765432",
    parentEmail: "patrick.kumwenda@mail.mw",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Pending",
  },
  {
    id: "SS24005",
    name: "Dalitso Nkosi",
    gender: "Male",
    form: "Form 1",
    stream: "A",
    admissionDate: "2025-01-10",
    parent: "Mrs. Jane Nkosi",
    parentPhone: "0888321654",
    parentEmail: "jane.nkosi@mail.mw",
    boarding: "No",
    status: "Active",
    feeStatus: "Paid",
  },
  {
    id: "SS24006",
    name: "Kondwani Tembo",
    gender: "Male",
    form: "Form 3",
    stream: "B",
    admissionDate: "2024-01-15",
    parent: "Mr. Alick Tembo",
    parentPhone: "0999654321",
    parentEmail: "alick.tembo@mail.mw",
    boarding: "Yes",
    status: "Active",
    feeStatus: "Pending",
  },
];

const FORMS = ["Form 1", "Form 2", "Form 3", "Form 4"];
const NOTIFICATION_TYPES = [
  { value: "general", label: "General announcement" },
  { value: "fee", label: "Fee reminder" },
  { value: "event", label: "Upcoming event" },
  { value: "discipline", label: "Disciplinary notice" },
  { value: "academic", label: "Academic update" },
  { value: "other", label: "Other" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ value, type }) {
  const styles = {
    feeStatus: {
      Paid: "bg-emerald-100 text-emerald-700",
      Pending: "bg-red-100 text-red-700",
    },
    boarding: {
      Yes: "bg-emerald-100 text-emerald-700",
      No: "bg-amber-100 text-amber-700",
    },
  };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${styles[type][value]}`}>
      {value}
    </span>
  );
}

// ─── View Profile Modal ───────────────────────────────────────────────────────

function ViewModal({ student, onClose, onNotify }) {
  const fields = [
    { label: "Admission No.", value: student.id },
    { label: "Gender", value: student.gender },
    { label: "Form / Stream", value: `${student.form} — Stream ${student.stream}` },
    { label: "Admission date", value: student.admissionDate },
    { label: "Boarding", value: student.boarding },
    { label: "Fee status", value: student.feeStatus },
    { label: "Parent / Guardian", value: student.parent },
    { label: "Parent phone", value: student.parentPhone },
    { label: "Parent email", value: student.parentEmail },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#0F2044]">{student.name}</h3>
            <p className="text-sm text-[#0F2044]/50 mt-0.5">{student.id} &bull; {student.form}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F7F5F0] rounded-xl">
            <X className="w-5 h-5 text-[#0F2044]/40" />
          </button>
        </div>

        <div className="space-y-3 mb-8">
          {fields.map(({ label, value }) => (
            <div
              key={label}
              className="flex justify-between items-center border-b border-[#0F2044]/5 pb-3 last:border-0 last:pb-0"
            >
              <span className="text-xs text-[#0F2044]/50">{label}</span>
              <span className="text-sm text-[#0F2044] font-medium">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0] transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => { onClose(); onNotify([student]); }}
            className="flex-1 py-3 bg-[#0F2044] text-white rounded-2xl text-sm font-medium hover:bg-[#1a3060] transition-colors flex items-center justify-center gap-2"
          >
            <Bell className="w-4 h-4" />
            Notify parent
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notification Modal ───────────────────────────────────────────────────────

function NotificationModal({ targets, onClose }) {
  const isAll = targets === "all";
  const [type, setType] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("sms");
  const [sent, setSent] = useState(false);

  const recipientLabel = isAll
    ? "All parents / guardians"
    : targets.length === 1
    ? targets[0].parent
    : `${targets.length} selected parents`;

  const handleSend = () => {
    if (!message.trim()) { alert("Please enter a message."); return; }
    setSent(true);
    setTimeout(onClose, 2000);
  };

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl w-full max-w-sm p-10 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-[#0F2044] mb-1">Notification sent</h3>
          <p className="text-sm text-[#0F2044]/50">
            {isAll ? "All parents have been notified." : `${recipientLabel} has been notified.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg p-8 my-4">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#0F2044]">Send notification</h3>
            <p className="text-sm text-[#0F2044]/50 mt-0.5">To: {recipientLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#F7F5F0] rounded-xl">
            <X className="w-5 h-5 text-[#0F2044]/40" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Type */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-1.5">Notification type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm bg-white"
            >
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-1.5">Subject</label>
            <input
              type="text"
              placeholder="e.g. Sports Day — Friday 2nd May"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm"
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-1.5">Message</label>
            <textarea
              placeholder="Type your message here…"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 border border-[#0F2044]/10 rounded-xl focus:outline-none focus:border-[#0F2044]/40 text-sm resize-none"
            />
            <p className="text-xs text-[#0F2044]/30 mt-1 text-right">{message.length} characters</p>
          </div>

          {/* Channel */}
          <div>
            <label className="text-xs text-[#0F2044]/50 block mb-2">Send via</label>
            <div className="flex gap-3">
              {[
                { key: "sms", label: "SMS" },
                { key: "email", label: "Email" },
                { key: "both", label: "Both" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setChannel(key)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors
                    ${channel === key
                      ? "bg-[#0F2044] text-white border-[#0F2044]"
                      : "border-[#0F2044]/15 text-[#0F2044]/60 hover:border-[#0F2044]/30"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="flex-1 py-3.5 bg-[#0F2044] text-white rounded-2xl text-sm font-medium hover:bg-[#1a3060] transition-colors flex items-center justify-center gap-2"
          >
            <BellRing className="w-4 h-4" />
            Send notification
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StudentManagement() {
  const students = dummyStudents;

  const [searchTerm, setSearchTerm] = useState("");
  const [filterForm, setFilterForm] = useState("All");
  const [filterBoarding, setFilterBoarding] = useState("All");
  const [filterFee, setFilterFee] = useState("All");

  // Modal state
  const [viewStudent, setViewStudent] = useState(null);
  const [notifyTargets, setNotifyTargets] = useState(null); // array of students | "all"

  const filtered = students.filter((s) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    const matchForm = filterForm === "All" || s.form === filterForm;
    const matchBoarding = filterBoarding === "All" || s.boarding === filterBoarding;
    const matchFee = filterFee === "All" || s.feeStatus === filterFee;
    return matchSearch && matchForm && matchBoarding && matchFee;
  });

  // Summary counts
  const boardingCount = students.filter((s) => s.boarding === "Yes").length;
  const feesPaidCount = students.filter((s) => s.feeStatus === "Paid").length;
  const feesPendingCount = students.filter((s) => s.feeStatus === "Pending").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-3xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Student Records
          </h2>
          <p className="text-[#0F2044]/60 mt-1">
            {students.length} students enrolled &bull; Term 2, 2026
          </p>
        </div>

        <button
          onClick={() => setNotifyTargets("all")}
          className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl font-medium hover:bg-[#1a3060] transition-colors"
        >
          <BellRing className="w-5 h-5" />
          Notify all parents
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: "Total students", value: students.length, color: "text-[#0F2044]" },
          { label: "Boarding", value: boardingCount, color: "text-[#0F2044]" },
          { label: "Fees paid", value: feesPaidCount, color: "text-emerald-600" },
          { label: "Fees pending", value: feesPendingCount, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
            <p className="text-sm text-[#0F2044]/60">{label}</p>
            <p className={`text-4xl font-bold mt-2 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-[#0F2044]/8">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 relative min-w-[240px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F2044]/40" />
            <input
              type="text"
              placeholder="Search by name or admission number…"
              className="w-full pl-11 pr-4 py-3.5 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#0F2044]/30 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Form filter */}
          <select
            value={filterForm}
            onChange={(e) => setFilterForm(e.target.value)}
            className="px-5 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm min-w-[140px]"
          >
            <option value="All">All forms</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>

          {/* Boarding filter */}
          <select
            value={filterBoarding}
            onChange={(e) => setFilterBoarding(e.target.value)}
            className="px-5 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm min-w-[140px]"
          >
            <option value="All">All boarding</option>
            <option value="Yes">Boarding</option>
            <option value="No">Day scholar</option>
          </select>

          {/* Fee filter */}
          <select
            value={filterFee}
            onChange={(e) => setFilterFee(e.target.value)}
            className="px-5 py-3.5 bg-white border border-[#0F2044]/10 rounded-2xl focus:outline-none text-sm min-w-[140px]"
          >
            <option value="All">All fee status</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
          </select>

          {/* Notify filtered */}
          {filtered.length > 0 && filtered.length < students.length && (
            <button
              onClick={() => setNotifyTargets(filtered)}
              className="flex items-center gap-2 px-5 py-3.5 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/70"
            >
              <Bell className="w-4 h-4" />
              Notify {filtered.length} filtered
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/8">
              <tr>
                <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Adm. No.</th>
                <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Student</th>
                <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Form</th>
                <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Parent / Guardian</th>
                <th className="text-left p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Contact</th>
                <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Boarding</th>
                <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Fees</th>
                <th className="text-center p-5 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-[#0F2044]/40 text-sm">
                    No students match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr key={student.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                    <td className="p-5 font-mono text-xs text-[#0F2044]/60">{student.id}</td>
                    <td className="p-5">
                      <p className="font-medium text-sm text-[#0F2044]">{student.name}</p>
                      <p className="text-xs text-[#0F2044]/50 mt-0.5">{student.gender}</p>
                    </td>
                    <td className="p-5">
                      <span className="inline-block px-3 py-1 bg-[#0F2044]/5 rounded-full text-xs font-medium text-[#0F2044]/70">
                        {student.form} &mdash; {student.stream}
                      </span>
                    </td>
                    <td className="p-5">
                      <p className="text-sm text-[#0F2044]">{student.parent}</p>
                    </td>
                    <td className="p-5">
                      <p className="text-sm font-mono text-[#0F2044]/70">{student.parentPhone}</p>
                      <p className="text-xs text-[#0F2044]/40 mt-0.5">{student.parentEmail}</p>
                    </td>
                    <td className="p-5 text-center">
                      <StatusBadge value={student.boarding} type="boarding" />
                    </td>
                    <td className="p-5 text-center">
                      <StatusBadge value={student.feeStatus} type="feeStatus" />
                    </td>
                    <td className="p-5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewStudent(student)}
                          className="p-2 hover:bg-[#F7F5F0] rounded-xl text-[#0F2044]/50 hover:text-[#0F2044] transition-colors"
                          title="View profile"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setNotifyTargets([student])}
                          className="p-2 hover:bg-amber-50 rounded-xl text-[#0F2044]/50 hover:text-amber-600 transition-colors"
                          title="Notify parent"
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {viewStudent && (
        <ViewModal
          student={viewStudent}
          onClose={() => setViewStudent(null)}
          onNotify={(targets) => { setViewStudent(null); setNotifyTargets(targets); }}
        />
      )}

      {notifyTargets && (
        <NotificationModal
          targets={notifyTargets}
          onClose={() => setNotifyTargets(null)}
        />
      )}
    </div>
  );
}