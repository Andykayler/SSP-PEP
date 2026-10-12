// modules/StudentManagement.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Eye, Bell, BellRing, X, Check, RefreshCw, AlertCircle } from "lucide-react";
import { db } from "../../../firebase";
import useCampusScope from "../../../hooks/useCampusScope";
import { fetchSchoolClasses } from "../../../services/staffAssignments";
import "./staff-management.css";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Constants ────────────────────────────────────────────────────────────────
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
  let badgeClass = "status-pill";
  if (type === "feeStatus") {
    badgeClass += value === "Paid" ? " status-pill--success" : " status-pill--danger";
  } else if (type === "boarding") {
    badgeClass += value === "Yes" ? " status-pill--success" : " status-pill--warning";
  } else if (type === "status") {
    badgeClass += value === "active" ? " status-pill--success" : " status-pill--danger";
  }
  const label = type === "status" ? value?.charAt(0).toUpperCase() + value?.slice(1) : value;
  return <span className={badgeClass}>{label ?? "—"}</span>;
}

function Spinner({ size = 20 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

// ─── View Profile Modal ───────────────────────────────────────────────────────
function ViewModal({ student, onClose, onNotify, schoolBoards }) {
  const name          = student.fullName || `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "—";
  const admNo         = student.studentCode || student.id || "—";
  const form          = student.className || student.form || "—";
  const stream        = student.stream || "—";
  const gender        = student.gender || "—";
  const dob           = student.dob || "—";
  const guardian      = student.guardianName || student.parent || "—";
  const guardianPhone = student.guardianPhone || student.parentPhone || "—";
  const guardianEmail = student.guardianEmail || student.parentEmail || "—";
  const boarding      = student.boarding || "—";
  const feeStatus     = student.feeStatus || "—";
  const district      = student.district || "—";
  const status        = student.status || "active";

  const fields = [
    { label: "Student Code",     value: admNo         },
    { label: "Gender",           value: gender        },
    { label: "Date of Birth",    value: dob           },
    { label: "Class / Stream",   value: stream !== "—" ? `${form} — Stream ${stream}` : form },
    { label: "District",         value: district      },
    ...(schoolBoards ? [{ label: "Boarding", value: boarding }] : []),
    { label: "Fee Status",      value: feeStatus     },
    { label: "Status",           value: status        },
    { label: "Parent / Guardian",value: guardian      },
    { label: "Parent Phone",     value: guardianPhone },
    { label: "Parent Email",     value: guardianEmail },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <div>
            <h3>{name}</h3>
            <p>{admNo} • {form}</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body space-y-3">
          {fields.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center border-b border-primary-dim pb-2 last:border-0 last:pb-0">
              <span className="text-muted text-[10px] uppercase tracking-wide">{label}</span>
              <span className="text-sm text-app-text font-medium">{value}</span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">Close</button>
          <button onClick={() => { onClose(); onNotify([student]); }} className="btn-save">
            <Bell size={14} /> Notify parent
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notification Modal ───────────────────────────────────────────────────────
function NotificationModal({ targets, schoolCode, senderName, onClose }) {
  const isAll = targets === "all";
  const [type, setType] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("sms");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

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
      const recipientList = isAll
        ? [{ name: "All parents", phone: null, email: null }]
        : targets.map(s => ({
            studentId: s.id,
            studentCode: s.studentCode || s.id,
            studentName: s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
            guardianName: s.guardianName || s.parent || "—",
            phone: s.guardianPhone || s.parentPhone || null,
            email: s.guardianEmail || s.parentEmail || null,
          }));
      await addDoc(collection(db, "notifications"), {
        schoolCode,
        type,
        subject: subject.trim() || null,
        message: message.trim(),
        channel,
        recipients: recipientList,
        isAll,
        sentBy: senderName || "Head Teacher",
        status: "sent",
        createdAt: serverTimestamp(),
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
      <div className="modal-overlay">
        <div className="modal-container text-center" style={{ maxWidth: "400px" }}>
          <div className="modal-body py-8">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h3 className="font-bold text-lg mb-1">Notification sent</h3>
            <p className="text-muted text-sm">
              {isAll ? "All parents have been notified." : `${recipientLabel} has been notified.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <div>
            <h3>Send notification</h3>
            <p>To: {recipientLabel}</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body space-y-4">
          {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}
          <div>
            <label className="field__label">Notification type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="field__select">
              {NOTIFICATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field__label">Subject</label>
            <input type="text" placeholder="e.g. Sports Day — Friday 2nd May" value={subject} onChange={e => setSubject(e.target.value)} className="field__input" />
          </div>
          <div>
            <label className="field__label">Message</label>
            <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} className="field__textarea" placeholder="Type your message here…" />
            <div className="text-right text-muted text-xs mt-1">{message.length} characters</div>
          </div>
          <div>
            <label className="field__label mb-2">Send via</label>
            <div className="flex gap-3">
              {[
                { key: "sms", label: "SMS" },
                { key: "email", label: "Email" },
                { key: "both", label: "Both" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setChannel(key)} className={`btn btn--sm flex-1 ${channel === key ? "btn--primary" : "btn--secondary"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={sending} className="btn-cancel">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="btn-save">
            {sending ? <Spinner size={16} /> : <BellRing size={14} />}
            {sending ? "Sending…" : "Send notification"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StudentManagement({ schoolCode, senderName, viewer, schoolBoards = false }) {
  // Campus scope. A head attached to one campus sees that campus's roll and no
  // other; one attached to several gets a picker. Applied to `students` as
  // soon as they load, so every count and every action below — including
  // "notify all parents" — is already narrowed. Notifying the wrong campus's
  // families is the mistake this prevents.
  const { visible: visibleCampuses, multiCampus, campusFilter, setCampusFilter, scope } =
    useCampusScope(schoolCode, viewer);

  const [allStudents, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterForm, setFilterForm] = useState("All");
  const [filterBoarding, setFilterBoarding] = useState("All");
  const [filterFee, setFilterFee] = useState("All");
  const [viewStudent, setViewStudent] = useState(null);
  const [notifyTargets, setNotifyTargets] = useState(null);

  const fetchStudents = useCallback(async () => {
    if (!schoolCode) return;
    setLoading(true);
    setFetchError("");
    try {
      const q = query(collection(db, "students"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.fullName || a.lastName || "").localeCompare(b.fullName || b.lastName || ""));
      setStudents(data);
    } catch (err) {
      setFetchError("Could not load students: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolCode]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // The school's registered classes, so the filter follows whatever the school
  // runs (Standards, Grades, Forms…) rather than a fixed list.
  const [registeredClasses, setRegisteredClasses] = useState([]);
  useEffect(() => {
    if (!schoolCode) return;
    let cancelled = false;
    fetchSchoolClasses(schoolCode)
      .then(list => { if (!cancelled) setRegisteredClasses(list.map(c => c.name).filter(Boolean)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [schoolCode]);

  const students = useMemo(() => scope(allStudents), [scope, allStudents]);

  const getForm = (s) => s.className || s.form || "";

  // Registered classes first (in register order), then any class a student
  // carries that isn't on the register (older records).
  const classOptions = useMemo(() => {
    const seen = new Set(registeredClasses);
    const extra = [...new Set(students.map(getForm).filter(c => c && !seen.has(c)))].sort();
    return [...registeredClasses, ...extra];
  }, [registeredClasses, students]);
  const filtered = students.filter(s => {
    const q = searchTerm.toLowerCase();
    const fullName = (s.fullName || `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim()).toLowerCase();
    const code = (s.studentCode || s.id || "").toLowerCase();
    const matchSearch = !searchTerm || fullName.includes(q) || code.includes(q);
    const matchForm = filterForm === "All" || getForm(s) === filterForm;
    const matchBoard = !schoolBoards || filterBoarding === "All" ||(s.boarding || "No") === filterBoarding;
    const matchFee = filterFee === "All" || (s.feeStatus || "—") === filterFee;
    return matchSearch && matchForm && matchBoard && matchFee;
  });

  const boardingCount = students.filter(s => s.boarding === "Yes").length;
  const feesPaidCount = students.filter(s => s.feeStatus === "Paid").length;
  const feesPendingCount = students.filter(s => s.feeStatus === "Pending").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Student Records</h2>
          <p className="text-muted">{loading ? "Loading…" : `${students.length} students enrolled`} • Term 2, 2026</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchStudents} disabled={loading} className="icon-btn" title="Refresh">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button onClick={() => setNotifyTargets("all")} disabled={students.length === 0 || loading} className="btn btn--accent">
            <BellRing size={14} /> Notify all parents
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="error-message">
          <AlertCircle size={16} /> {fetchError}
          <button onClick={fetchStudents} className="ml-auto underline text-xs font-medium">Retry</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card__value">{students.length}</div><div className="stat-card__label">Total students</div></div>
        {schoolBoards && <div className="stat-card"><div className="stat-card__value">{boardingCount}</div><div className="stat-card__label">Boarding</div></div>}
        <div className="stat-card"><div className="stat-card__value stat-card__value--success">{feesPaidCount}</div><div className="stat-card__label">Fees paid</div></div>
        <div className="stat-card"><div className="stat-card__value stat-card__value--danger">{feesPendingCount}</div><div className="stat-card__label">Fees pending</div></div>
      </div>

      {/* Filters – using filter-bar for compact selects */}
      <div className="card p-4">
        <div className="filter-bar">
          <div className="search-wrapper">
            <Search className="search-icon" size={14} />
            <input type="text" placeholder="Search by name or student code…" className="search-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          {/* Only shown when this person actually has a choice to make — a
              head attached to one campus never sees it. */}
          {multiCampus && (
            <select value={campusFilter} onChange={e => setCampusFilter(e.target.value)} className="field__select">
              <option value="all">All my campuses</option>
              {visibleCampuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={filterForm} onChange={e => setFilterForm(e.target.value)} className="field__select">
            <option value="All">All classes</option>
            {classOptions.map(c => <option key={c}>{c}</option>)}
          </select>
          {schoolBoards && (
            <select value={filterBoarding} onChange={e => setFilterBoarding(e.target.value)} className="field__select">
              <option value="All">All boarding</option>
              <option value="Yes">Boarding</option>
              <option value="No">Day scholar</option>
            </select>
          )}
          <select value={filterFee} onChange={e => setFilterFee(e.target.value)} className="field__select">
            <option value="All">All fee status</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
          </select>
          {!loading && filtered.length > 0 && filtered.length < students.length && (
            <button onClick={() => setNotifyTargets(filtered)} className="btn btn--secondary">
              <Bell size={14} /> Notify {filtered.length} filtered
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="data-table-wrap">
          {loading ? (
            <div className="empty-state"><Spinner size={28} /><p className="empty-state__sub">Loading students…</p></div>
          ) : (
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Code</th><th>Student</th><th>Class</th><th>Parent / Guardian</th><th>Contact</th>{schoolBoards && <th>Boarding</th>}<th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={schoolBoards ? 7 : 6} className="text-center py-12 text-muted">{students.length === 0 ? "No students enrolled yet." : "No students match your filters."}</td></tr>
                ) : (
                  filtered.map(student => {
                    const fullName = student.fullName || `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "—";
                    const code = student.studentCode || student.id || "—";
                    const cls = getForm(student) || "—";
                    const stream = student.stream ? ` — ${student.stream}` : "";
                    const guardian = student.guardianName || student.parent || "—";
                    const phone = student.guardianPhone || student.parentPhone || "—";
                    const email = student.guardianEmail || student.parentEmail || null;
                    return (
                      <tr key={student.id}>
                        <td data-label="Code" className="text-muted font-mono text-xs">{code}</td>
                        <td data-label="Student"><span className="font-medium">{fullName}</span><div className="text-muted text-xs">{student.gender || "—"}</div></td>
                        <td data-label="Class"><span className="tag tag--blue">{cls}{stream}</span></td>
                        <td data-label="Parent / Guardian"><div>{guardian}</div><div className="text-muted text-xs">{student.guardianRelation || ""}</div></td>
                        <td data-label="Contact"><div className="font-mono">{phone}</div>{email && <div className="text-muted text-xs">{email}</div>}</td>
                        {schoolBoards && <td data-label="Boarding" className="text-center"><StatusBadge value={student.boarding || "No"} type="boarding" /></td>}
                        <td data-label="Actions"><div className="flex items-center justify-center gap-1.5"><button onClick={() => setViewStudent(student)} className="icon-btn" title="View profile"><Eye size={14} /></button><button onClick={() => setNotifyTargets([student])} className="icon-btn icon-btn--assign" title="Notify parent"><Bell size={14} /></button></div></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {viewStudent && <ViewModal student={viewStudent} schoolBoards={schoolBoards} onClose={() => setViewStudent(null)} onNotify={targets => { setViewStudent(null); setNotifyTargets(targets); }} />}
      {notifyTargets && <NotificationModal targets={notifyTargets} schoolCode={schoolCode} senderName={senderName} onClose={() => setNotifyTargets(null)} />}
    </div>
  );
}