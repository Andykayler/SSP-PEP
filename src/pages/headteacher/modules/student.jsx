// modules/StudentManagement.jsx
import { useState, useEffect, useCallback } from "react";
import { Search, Eye, Bell, BellRing, X, Check, RefreshCw, AlertCircle } from "lucide-react";
import { db } from "../../../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMS = ["Form 1", "Form 2", "Form 3", "Form 4"];

const NOTIFICATION_TYPES = [
  { value: "general",    label: "General announcement" },
  { value: "fee",        label: "Fee reminder"         },
  { value: "event",      label: "Upcoming event"       },
  { value: "discipline", label: "Disciplinary notice"  },
  { value: "academic",   label: "Academic update"      },
  { value: "other",      label: "Other"                },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ value, type }) {
  const styles = {
    feeStatus: {
      Paid:    "bg-emerald-100 text-emerald-700",
      Pending: "bg-red-100 text-red-700",
    },
    boarding: {
      Yes: "bg-emerald-100 text-emerald-700",
      No:  "bg-amber-100 text-amber-700",
    },
    status: {
      active:    "bg-emerald-100 text-emerald-700",
      suspended: "bg-red-100 text-red-700",
    },
  };
  const label =
    type === "status"
      ? value?.charAt(0).toUpperCase() + value?.slice(1)
      : value;
  const cls = styles[type]?.[value] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${cls}`}>
      {label ?? "—"}
    </span>
  );
}

function Spinner({ size = 5 }) {
  return (
    <svg
      className={`animate-spin w-${size} h-${size} text-[#0F2044]/40`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── View Profile Modal ───────────────────────────────────────────────────────

function ViewModal({ student, onClose, onNotify }) {
  // Normalise field names from Firestore (may differ from old dummy shape)
  const name          = student.fullName      || `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "—";
  const admNo         = student.studentCode   || student.id || "—";
  const form          = student.className     || student.form || "—";
  const stream        = student.stream        || "—";
  const gender        = student.gender        || "—";
  const dob           = student.dob           || "—";
  const guardian      = student.guardianName  || student.parent || "—";
  const guardianPhone = student.guardianPhone || student.parentPhone || "—";
  const guardianEmail = student.guardianEmail || student.parentEmail || "—";
  const boarding      = student.boarding      || "—";
  const feeStatus     = student.feeStatus     || "—";
  const district      = student.district      || "—";
  const status        = student.status        || "active";

  const fields = [
    { label: "Student Code",     value: admNo         },
    { label: "Gender",           value: gender        },
    { label: "Date of Birth",    value: dob           },
    { label: "Class / Stream",   value: stream !== "—" ? `${form} — Stream ${stream}` : form },
    { label: "District",         value: district      },
    { label: "Boarding",         value: boarding      },
    { label: "Fee Status",       value: feeStatus     },
    { label: "Status",           value: status        },
    { label: "Parent / Guardian",value: guardian      },
    { label: "Parent Phone",     value: guardianPhone },
    { label: "Parent Email",     value: guardianEmail },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md p-8 my-4">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#0F2044]">{name}</h3>
            <p className="text-sm text-[#0F2044]/50 mt-0.5">{admNo} &bull; {form}</p>
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

function NotificationModal({ targets, schoolCode, senderName, onClose }) {
  const isAll = targets === "all";

  const [type,    setType]    = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("sms");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  const recipientCount = isAll ? null : targets.length;
  const recipientLabel = isAll
    ? "All parents / guardians"
    : recipientCount === 1
    ? (targets[0].guardianName || targets[0].parent || targets[0].fullName || "Parent")
    : `${recipientCount} selected parents`;

  const handleSend = async () => {
    if (!message.trim()) { setError("Please enter a message."); return; }
    setSending(true);
    setError("");

    try {
      // Build recipient list
      const recipientList = isAll
        ? [{ name: "All parents", phone: null, email: null }]
        : targets.map((s) => ({
            studentId:    s.id,
            studentCode:  s.studentCode || s.id,
            studentName:  s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
            guardianName: s.guardianName || s.parent || "—",
            phone:        s.guardianPhone || s.parentPhone || null,
            email:        s.guardianEmail || s.parentEmail || null,
          }));

      await addDoc(collection(db, "notifications"), {
        schoolCode,
        type,
        subject:    subject.trim() || null,
        message:    message.trim(),
        channel,
        recipients: recipientList,
        isAll,
        sentBy:     senderName || "Head Teacher",
        status:     "sent",
        createdAt:  serverTimestamp(),
      });

      setSent(true);
      setTimeout(onClose, 2200);
    } catch (err) {
      setError("Failed to send: " + err.message);
    } finally {
      setSending(false);
    }
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
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

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
                { key: "sms",   label: "SMS"   },
                { key: "email", label: "Email" },
                { key: "both",  label: "Both"  },
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
            disabled={sending}
            className="flex-1 py-3.5 border border-[#0F2044]/20 rounded-2xl text-sm font-medium hover:bg-[#F7F5F0] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 py-3.5 bg-[#0F2044] text-white rounded-2xl text-sm font-medium hover:bg-[#1a3060] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {sending ? <Spinner size={4} /> : <BellRing className="w-4 h-4" />}
            {sending ? "Sending…" : "Send notification"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * Props:
 *   schoolCode  – string  (required) from the parent dashboard / auth context
 *   senderName  – string  (optional) name of the logged-in head teacher
 */
export default function StudentManagement({ schoolCode, senderName }) {
  const [students,       setStudents]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [fetchError,     setFetchError]     = useState("");

  // Filters
  const [searchTerm,      setSearchTerm]      = useState("");
  const [filterForm,      setFilterForm]      = useState("All");
  const [filterBoarding,  setFilterBoarding]  = useState("All");
  const [filterFee,       setFilterFee]       = useState("All");

  // Modals
  const [viewStudent,    setViewStudent]    = useState(null);
  const [notifyTargets,  setNotifyTargets]  = useState(null); // array | "all"

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!schoolCode) return;
    setLoading(true);
    setFetchError("");
    try {
      const q    = query(collection(db, "students"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) =>
          (a.fullName || a.lastName || "").localeCompare(b.fullName || b.lastName || "")
        );
      setStudents(data);
    } catch (err) {
      setFetchError("Could not load students: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolCode]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Normalise class field — stored as className or form
  const getForm = (s) => s.className || s.form || "";

  const filtered = students.filter((s) => {
    const q           = searchTerm.toLowerCase();
    const fullName    = (s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim()).toLowerCase();
    const code        = (s.studentCode || s.id || "").toLowerCase();
    const matchSearch = !searchTerm || fullName.includes(q) || code.includes(q);
    const matchForm   = filterForm === "All" || getForm(s) === filterForm;
    const matchBoard  = filterBoarding === "All" || (s.boarding || "No") === filterBoarding;
    const matchFee    = filterFee === "All" || (s.feeStatus || "—") === filterFee;
    return matchSearch && matchForm && matchBoard && matchFee;
  });

  // Summary
  const boardingCount    = students.filter((s) => s.boarding === "Yes").length;
  const feesPaidCount    = students.filter((s) => s.feeStatus === "Paid").length;
  const feesPendingCount = students.filter((s) => s.feeStatus === "Pending").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-bold text-[#0F2044]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Student Records
          </h2>
          <p className="text-[#0F2044]/60 text-sm mt-0.5">
            {loading ? "Loading…" : `${students.length} students enrolled`} &bull; Term 2, 2026
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="p-2.5 border border-[#0F2044]/15 rounded-xl text-[#0F2044]/50 hover:bg-[#F7F5F0] hover:text-[#0F2044] transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setNotifyTargets("all")}
            disabled={students.length === 0 || loading}
            className="flex items-center gap-2 bg-[#0F2044] text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-[#1a3060] transition-colors disabled:opacity-50"
          >
            <BellRing className="w-4 h-4" />
            Notify all parents
          </button>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {fetchError}
          <button onClick={fetchStudents} className="ml-auto underline text-xs font-medium">Retry</button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total students", value: students.length, color: "text-[#0F2044]" },
          { label: "Boarding",       value: boardingCount,    color: "text-[#0F2044]" },
          { label: "Fees paid",      value: feesPaidCount,    color: "text-emerald-600" },
          { label: "Fees pending",   value: feesPendingCount, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl p-4 border border-[#0F2044]/8">
            <p className="text-xs text-[#0F2044]/60">{label}</p>
            {loading
              ? <div className="mt-2 h-8 w-10 bg-[#0F2044]/8 rounded-lg animate-pulse" />
              : <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            }
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-[#0F2044]/8">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F2044]/40" />
            <input
              type="text"
              placeholder="Search by name or student code…"
              className="w-full pl-9 pr-3 py-2 bg-[#F7F5F0] border border-[#0F2044]/10 rounded-lg focus:outline-none focus:border-[#0F2044]/30 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Form filter */}
          <select
            value={filterForm}
            onChange={(e) => setFilterForm(e.target.value)}
            className="px-4 py-2 bg-white border border-[#0F2044]/10 rounded-lg focus:outline-none text-sm min-w-[120px]"
          >
            <option value="All">All forms</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>

          {/* Boarding filter */}
          <select
            value={filterBoarding}
            onChange={(e) => setFilterBoarding(e.target.value)}
            className="px-4 py-2 bg-white border border-[#0F2044]/10 rounded-lg focus:outline-none text-sm min-w-[120px]"
          >
            <option value="All">All boarding</option>
            <option value="Yes">Boarding</option>
            <option value="No">Day scholar</option>
          </select>

          {/* Fee filter */}
          <select
            value={filterFee}
            onChange={(e) => setFilterFee(e.target.value)}
            className="px-4 py-2 bg-white border border-[#0F2044]/10 rounded-lg focus:outline-none text-sm min-w-[120px]"
          >
            <option value="All">All fee status</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
          </select>

          {/* Notify filtered subset */}
          {!loading && filtered.length > 0 && filtered.length < students.length && (
            <button
              onClick={() => setNotifyTargets(filtered)}
              className="flex items-center gap-2 px-4 py-2 border border-[#0F2044]/20 rounded-lg text-sm font-medium hover:bg-[#F7F5F0] transition-colors text-[#0F2044]/70"
            >
              <Bell className="w-3.5 h-3.5" />
              Notify {filtered.length} filtered
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-[#0F2044]/8">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size={8} />
              <p className="text-sm text-[#0F2044]/40">Loading students…</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#F7F5F0] border-b border-[#0F2044]/8">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Class</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Parent / Guardian</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Contact</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Boarding</th>
                  {/* <th className="text-center px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Fees</th> */}
                  <th className="text-center px-4 py-3 text-xs font-medium text-[#0F2044]/60 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F2044]/5">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-[#0F2044]/40 text-sm">
                      {students.length === 0 ? "No students enrolled yet." : "No students match your filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((student) => {
                    const fullName = student.fullName || `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "—";
                    const code     = student.studentCode || student.id || "—";
                    const cls      = getForm(student) || "—";
                    const stream   = student.stream ? ` — ${student.stream}` : "";
                    const guardian = student.guardianName || student.parent || "—";
                    const phone    = student.guardianPhone || student.parentPhone || "—";
                    const email    = student.guardianEmail || student.parentEmail || null;

                    return (
                      <tr key={student.id} className="hover:bg-[#F7F5F0]/70 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-[#0F2044]/60">{code}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm text-[#0F2044]">{fullName}</p>
                          <p className="text-xs text-[#0F2044]/50 mt-0.5">{student.gender || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2.5 py-1 bg-[#0F2044]/5 rounded-full text-xs font-medium text-[#0F2044]/70">
                            {cls}{stream}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-[#0F2044]">{guardian}</p>
                          <p className="text-xs text-[#0F2044]/40 mt-0.5">{student.guardianRelation || ""}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-mono text-[#0F2044]/70">{phone}</p>
                          {email && <p className="text-xs text-[#0F2044]/40 mt-0.5">{email}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge value={student.boarding || "No"} type="boarding" />
                        </td>
                        {/* <td className="px-4 py-3 text-center">
                          {student.feeStatus
                            ? <StatusBadge value={student.feeStatus} type="feeStatus" />
                            : <span className="text-xs text-[#0F2044]/30">—</span>
                          }
                        </td> */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setViewStudent(student)}
                              className="p-1.5 hover:bg-[#F7F5F0] rounded-lg text-[#0F2044]/50 hover:text-[#0F2044] transition-colors"
                              title="View profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setNotifyTargets([student])}
                              className="p-1.5 hover:bg-amber-50 rounded-lg text-[#0F2044]/50 hover:text-amber-600 transition-colors"
                              title="Notify parent"
                            >
                              <Bell className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
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
          schoolCode={schoolCode}
          senderName={senderName}
          onClose={() => setNotifyTargets(null)}
        />
      )}
    </div>
  );
}