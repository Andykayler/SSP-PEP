// pages/bursar/modules/Payments.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, orderBy,
} from "firebase/firestore";
import { fetchSponsorships } from "../../../services/sponsorships";
import { notifyPaymentRecorded } from "../../../services/notificationHooks";
import { notifyGuardians } from "../../../services/notifications";
import { tpl } from "../../../services/messageTemplates";
import {
  Search, X, Plus, Check, Receipt, User, RefreshCw,
  AlertTriangle, Smartphone, MessageCircle,
} from "lucide-react";
import PayChanguCheckout from "../../../components/payments/PayChanguCheckout";
import "./staff-management.css";

// ─── Shared Modal ───────────────────────────────────────────────────────────
const Modal = ({ title, subtitle, onClose, children, wide = false }) => (
  <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`modal-container ${wide ? "modal-container--wide" : ""}`}>
      <div className="modal-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button onClick={onClose} className="modal-close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

// ─── Button ─────────────────────────────────────────────────────────────────
const Btn = ({ children, variant = "accent", size = "md", loading, className = "", ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className={`btn btn--${variant} ${size === "sm" ? "btn--sm" : ""} ${className}`}
  >
    {loading ? <RefreshCw size={14} className="spin" /> : children}
  </button>
);

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().split("T")[0];

/**
 * Money the school actually has. A payment the parent app recorded arrives as
 * status "unverified": someone typed in that they paid, and nothing has
 * confirmed it. Counting it would show a balance cleared by a claim, which is
 * how a family gets told they owe nothing when the bursar has seen no money.
 * Payments recorded before statuses existed have none, and count.
 */
const isCounted = (p) => p.status !== "unverified" && p.status !== "rejected";

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function genReceiptNo() {
  return `RCP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const PAYMENT_METHODS = ["Cash", "Airtel Money", "TNM Mpamba", "National Bank Transfer", "Standard Bank Transfer", "NBS Transfer", "Cheque", "Other"];
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];
const TERMS = ["Term 1", "Term 2", "Term 3", "Full Year"];
const EMPTY_FORM = { amount: "", method: "Cash", referenceNo: "", term: "Term 1", notes: "", date: today(), sponsorId: "" };

const METHOD_BADGE = {
  "Cash": "tag tag--green",
  "Airtel Money": "tag tag--red",
  "TNM Mpamba": "tag",
  "National Bank Transfer": "tag tag--blue",
  "Standard Bank Transfer": "tag tag--blue",
  "NBS Transfer": "tag tag--blue",
  "Cheque": "tag tag--neutral",
};

// ─── Student Search ─────────────────────────────────────────────────────────
function StudentSearch({ students, studentFinancials, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return students.filter(s =>
      s.fullName?.toLowerCase().includes(q) ||
      s.studentCode?.toLowerCase().includes(q) ||
      s.className?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, students]);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(student) {
    const fin = studentFinancials(student.id);
    onSelect({ ...student, ...fin });
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="search-wrapper">
        <Search className="search-icon" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Type student name or code…"
          className="search-input"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((s, i) => {
            const fin = studentFinancials(s.id);
            return (
              <li
                key={s.id}
                onMouseDown={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={`search-results__item ${i === active ? "search-results__item--active" : ""}`}
              >
                <div className="assignment-avatar">
                  {initials(s.fullName)}
                </div>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="font-medium truncate">{s.fullName}</div>
                  <div className="text-mono text-muted">{s.studentCode} • {s.className}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${fin.balance > 0 ? "text-danger" : "text-success"}`}>
                    {fin.balance > 0 ? `Owes ${fmt(fin.balance)}` : "Settled"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="search-results search-results__empty">
          No students found for "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = "blue" }) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className={`stat-card__value mt-1 ${accent === "emerald" ? "text-success" : accent === "gold" ? "text-warning" : ""}`}>
        {value}
      </div>
      {sub && <div className="stat-card__sub mt-1">{sub}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── Ask one guardian to pay, on WhatsApp ────────────────────────────────────
// Sends the balance and how to pay. The guardian answers "Make Payment" in the
// same chat and the WhatsApp bot (api/whatsapp/webhook.js) pushes an Airtel
// Money / TNM Mpamba prompt to their phone, so the request and the payment are
// one conversation.
function AskOnWhatsApp({ students, studentFinancials, schoolCode, bursarName, onClose, onSent }) {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const t = term.trim().toLowerCase();
  const matches = t ? students.filter((s) => `${s.fullName} ${s.studentCode} ${s.className}`.toLowerCase().includes(t)).slice(0, 6) : [];
  const balance = picked ? studentFinancials(picked.id).balance : 0;

  async function send() {
    setBusy(true);
    const m = tpl.payPrompt(picked, { balance });
    await notifyGuardians({
      students: [picked], schoolCode, ...{ title: m.title, body: m.body, titleNy: m.titleNy, bodyNy: m.bodyNy },
      category: "fees", priority: "high", actorName: bursarName || "Bursar", actorRole: "bursar", entityType: "fee_request",
    });
    setBusy(false);
    onSent(picked.fullName);
  }

  return (
    <Modal title="Ask for payment on WhatsApp" subtitle="Sends the balance and how to pay" onClose={onClose}>
      <div className="field">
        <label className="field__label">Student</label>
        <input className="field__input" autoFocus placeholder="Type a name, code or class…" value={term} onChange={(e) => { setTerm(e.target.value); setPicked(null); }} />
      </div>
      {!picked && matches.map((s) => (
        <button key={s.id} type="button" className="btn btn--secondary btn--sm" style={{ display: "flex", width: "100%", justifyContent: "space-between", marginBottom: 4 }} onClick={() => setPicked(s)}>
          <span>{s.fullName} · {s.className}</span><span className="text-muted">{fmt(studentFinancials(s.id).balance)} owed</span>
        </button>
      ))}
      {picked && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 6px" }}><strong>{picked.fullName}</strong> owes <strong>{fmt(balance)}</strong>.</p>
          {!picked.guardianPhone && <p className="error-message">No guardian phone number on record.</p>}
          {balance <= 0 && <p className="text-muted" style={{ fontSize: 13 }}>Nothing is owed, so there is nothing to ask for.</p>}
          <Btn variant="accent" loading={busy} disabled={!picked.guardianPhone || balance <= 0} onClick={send}>
            <MessageCircle size={16} /> Send request
          </Btn>
        </div>
      )}
    </Modal>
  );
}

export default function Payments({ schoolCode, bursarName }) {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [feeAssignments, setFeeAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  // Sponsorships for this school, so a payment can be attributed to the
  // organisation that actually sent it rather than to the family.
  const [sponsorships, setSponsorships] = useState([]);

  const [lastReceipt, setLastReceipt] = useState(null);
  const [toast, setToast] = useState(null);

  // Collecting by mobile money rather than by hand. The distinction that
  // matters is not convenience: a payment taken this way is confirmed by the
  // gateway and written server-side, so the amount is never something a
  // browser said. See api/_lib/paychangu.js.
  const [collecting, setCollecting] = useState(null);
  const [deciding, setDeciding] = useState("");
  const [askOpen, setAskOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pySnap, stSnap, clSnap, faSnap] = await Promise.all([
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "fee_assignments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear))),
      ]);
      setPayments(pySnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudents(stSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setFeeAssignments(faSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to load data.");
    }
    setLoading(false);
  }, [schoolCode, academicYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!schoolCode) return;
    let alive = true;
    fetchSponsorships(schoolCode).then((rows) => { if (alive) setSponsorships(rows); });
    return () => { alive = false; };
  }, [schoolCode]);

  const studentFinancials = useCallback((studentId) => {
    const totalCharged = feeAssignments.filter((fa) => fa.studentId === studentId).reduce((s, fa) => s + (fa.amount || 0), 0);
    const totalPaid = payments.filter((p) => p.studentId === studentId && isCounted(p)).reduce((s, p) => s + (p.amount || 0), 0);
    const balance = totalCharged - totalPaid;
    return { totalCharged, totalPaid, balance };
  }, [feeAssignments, payments]);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }

  function openModal(student = null) {
    setSelectedStudent(student ? { ...student, ...studentFinancials(student.id) } : null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalError("");
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = "Enter a valid amount.";
    if (!form.method) e.method = "Select a payment method.";
    return e;
  }

  async function handleRecord(e) {
    e.preventDefault();
    if (!selectedStudent) {
      setModalError("Select a student first.");
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setActionLoading(true);
    setModalError("");
    const receiptNo = genReceiptNo();
    const s = selectedStudent;

    try {
      await addDoc(collection(db, "payments"), {
        studentId: s.id,
        studentName: s.fullName,
        studentCode: s.studentCode,
        classId: s.classId,
        className: s.className,
        amount: Number(form.amount),
        method: form.method,
        referenceNo: form.referenceNo.trim() || "",
        term: form.term,
        notes: form.notes.trim() || "",
        paymentDate: form.date,
        receiptNo,
        recordedBy: bursarName || "Bursar",
        academicYear,
        schoolCode,
        // Counterpart to the parent app's 'parent_app'/'unverified' marker —
        // a payment entered here has been seen by the bursar, so the two kinds
        // are always distinguishable in the ledger.
        source: "bursar",
        status: "verified",
        // Blank for a payment from the family. When set, the sponsorship
        // module counts this against what that sponsor undertook to cover —
        // without it a sponsor's money looks the same as a parent's and the
        // "received" figure never moves.
        sponsorId: form.sponsorId || "",
        sponsorName: sponsorships.find((x) => x.sponsorId === form.sponsorId)?.sponsorName
          || "",
        createdAt: serverTimestamp(),
      });

      const receipt = {
        receiptNo,
        studentName: s.fullName,
        studentCode: s.studentCode,
        className: s.className,
        amount: Number(form.amount),
        method: form.method,
        referenceNo: form.referenceNo.trim(),
        term: form.term,
        paymentDate: form.date,
        academicYear,
        bursarName: bursarName || "Bursar",
        prevBalance: s.balance,
        newBalance: Math.max(0, s.balance - Number(form.amount)),
      };

      // The fee rows carry a computed balance; the guardian phone lives on the
      // raw student doc, so the notification is built from that one.
      const studentDoc = students.find((row) => row.id === s.id);
      if (studentDoc) {
        await notifyPaymentRecorded({
          schoolCode,
          student: studentDoc,
          amount: Number(form.amount),
          method: form.method,
          receiptNumber: receiptNo,
          balance: receipt.newBalance,
          actor: { name: bursarName || "Bursar", role: "bursar" },
        });
      }

      setLastReceipt(receipt);
      setShowModal(false);
      showToast("success", `Receipt ${receiptNo} issued — ${fmt(Number(form.amount))}`);
      await fetchAll();
    } catch (err) {
      setModalError("Failed to record payment.");
    }
    setActionLoading(false);
  }

  const counted = useMemo(() => payments.filter(isCounted), [payments]);

  const stats = useMemo(() => {
    const todayStr = today();
    const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    return {
      todayTotal: counted.filter((p) => p.paymentDate === todayStr).reduce((s, p) => s + p.amount, 0),
      monthTotal: counted.filter((p) => (p.paymentDate || "").startsWith(nowMonth)).reduce((s, p) => s + p.amount, 0),
      yearTotal: counted.reduce((s, p) => s + p.amount, 0),
      count: counted.length,
    };
  }, [counted]);

  // Claims from the parent app, waiting for the bursar to confirm the money arrived.
  const claims = useMemo(() => payments.filter((p) => p.status === "unverified"), [payments]);

  async function decideClaim(p, confirmed) {
    let reason = "";
    if (!confirmed) {
      reason = window.prompt(`Why is this payment being rejected? (${p.studentName}, ${fmt(p.amount)})`, "") || "";
      if (reason === "" && !window.confirm("Reject without a reason?")) return;
    }
    setDeciding(p.id);
    try {
      await updateDoc(doc(db, "payments", p.id), {
        status: confirmed ? "verified" : "rejected",
        verifiedBy: bursarName || "Bursar",
        verifiedAt: serverTimestamp(),
        ...(confirmed ? {} : { rejectReason: reason }),
      });
      setPayments((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: confirmed ? "verified" : "rejected" } : x)));
      showToast("success", confirmed ? "Payment confirmed. It now counts toward the balance." : "Claim rejected.");
    } catch (e) {
      console.error(e);
      showToast("error", e.code === "permission-denied" ? "You don't have permission to do that." : "Could not save. Try again.");
    }
    setDeciding("");
  }

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        p.studentName?.toLowerCase().includes(q) ||
        p.studentCode?.toLowerCase().includes(q) ||
        p.receiptNo?.toLowerCase().includes(q);
      const matchMethod = methodFilter === "all" || p.method === methodFilter;
      const matchClass = classFilter === "all" || p.classId === classFilter;
      const matchTerm = termFilter === "all" || p.term === termFilter;
      return matchSearch && matchMethod && matchClass && matchTerm;
    });
  }, [payments, search, methodFilter, classFilter, termFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex-between flex-wrap">
        <div>
          <h2>Payments</h2>
          <p className="text-muted">Record and track all fee payments</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="form-input form-input--compact">
            {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn variant="secondary" onClick={fetchAll} loading={loading}>
            <RefreshCw size={16} />
          </Btn>
          <Btn variant="primary" onClick={() => setCollecting({ student: null })}>
            <Smartphone size={16} /> Collect Online
          </Btn>
          <Btn variant="secondary" onClick={() => setAskOpen(true)}>
            <MessageCircle size={16} /> Ask on WhatsApp
          </Btn>
          <Btn variant="accent" onClick={() => openModal()}>
            <Plus size={16} /> Record Payment
          </Btn>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard label="Collected Today" value={fmt(stats.todayTotal)} accent="blue" />
        <StatCard label="This Month" value={fmt(stats.monthTotal)} accent="emerald" />
        <StatCard label={`Total ${academicYear}`} value={fmt(stats.yearTotal)} accent="gold" sub={`${stats.count} transactions`} />
        <StatCard label="Avg. per Payment" value={stats.count ? fmt(Math.round(stats.yearTotal / stats.count)) : "MWK 0"} />
      </div>

      {/* Last Receipt Banner */}
      {lastReceipt && (
        <div className="card flex flex-col sm:flex-row justify-between gap-4 p-5 border-success/30">
          <div className="flex items-center gap-4">
            <div className="icon-circle icon-circle--success">
              <Check size={22} />
            </div>
            <div>
              <div className="font-semibold">Payment Recorded Successfully</div>
              <div className="text-muted">
                {lastReceipt.receiptNo} • {lastReceipt.studentName} • {fmt(lastReceipt.amount)}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn variant="success" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("printReceipt", { detail: lastReceipt }))}>
              <Receipt size={16} /> Print Receipt
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => setLastReceipt(null)}>Dismiss</Btn>
          </div>
        </div>
      )}

      {/* Claims from the parent app, until confirmed */}
      {claims.length > 0 && (
        <div className="alert alert--warning" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div>
            <strong>{claims.length} payment claim{claims.length === 1 ? "" : "s"} from the parent app to confirm</strong>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>
              A parent typed these in. They don't reduce anyone's balance until you've checked the money arrived.
            </div>
          </div>
          {claims.map((p) => (
            <div key={p.id} className="flex-between flex-wrap" style={{ gap: 8, padding: "8px 0", borderTop: "1px solid rgba(232,168,0,0.25)" }}>
              <div>
                <strong>{p.studentName}</strong> · {fmt(p.amount)} · {p.method || "Parent app"}
                <div className="text-muted" style={{ fontSize: 12 }}>{p.paymentDate}{p.referenceNo ? ` · Ref ${p.referenceNo}` : ""}</div>
              </div>
              <div className="flex gap-2">
                <Btn variant="success" size="sm" loading={deciding === p.id} onClick={() => decideClaim(p, true)}><Check size={14} /> Confirm received</Btn>
                <Btn variant="danger" size="sm" disabled={deciding === p.id} onClick={() => decideClaim(p, false)}><X size={14} /> Reject</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-wrapper flex-1">
          <Search className="search-icon" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, receipt..."
            className="search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="icon-btn"
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="form-input form-input--compact">
          <option value="all">All Classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className="form-input form-input--compact">
          <option value="all">All Terms</option>
          {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="form-input form-input--compact">
          <option value="all">All Methods</option>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="flex flex-col items-center justify-center text-muted" style={{ padding: "80px 0" }}>
            <div className="spinner" style={{ width: "42px", height: "42px" }} />
            <p className="mt-4">Loading payments...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><Receipt size={28} /></div>
            <div className="empty-state__title">No payments found</div>
            <p className="empty-state__sub">Record your first payment to begin tracking</p>
            <Btn variant="accent" onClick={() => openModal()}>Record First Payment</Btn>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Receipt</th>
                  <th>Method</th>
                  <th>Term</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const student = students.find((s) => s.id === p.studentId);
                  return (
                    <tr key={p.id}>
                      <td data-label="Student">
                        <div className="flex items-center gap-2">
                          <div className="assignment-avatar">
                            {initials(p.studentName)}
                          </div>
                          <div>
                            <div className="data-table__primary">{p.studentName}</div>
                            <div className="data-table__meta">{p.studentCode}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Receipt" className="text-mono">
                        {p.receiptNo}
                        {p.status === "unverified" && <div><span className="tag tag--neutral">Unverified claim</span></div>}
                        {p.status === "rejected" && <div><span className="tag tag--neutral" title={p.rejectReason}>Rejected</span></div>}
                      </td>
                      <td data-label="Method">
                        <span className={METHOD_BADGE[p.method] || "tag"}>{p.method}</span>
                      </td>
                      <td data-label="Term" className="text-muted">{p.term}</td>
                      <td data-label="Date" className="text-muted">{p.paymentDate}</td>
                      <td data-label="Amount" className="text-right font-semibold text-success">{fmt(p.amount)}</td>
                      <td className="text-center">
                        {student && (
                          <button
                            onClick={() => openModal(student)}
                            className="icon-btn"
                            title="Record another payment"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex-between" style={{ padding: "14px 20px", borderTop: "1px solid var(--border-color)" }}>
            <span className="text-muted">{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold">Total: {fmt(filtered.filter(isCounted).reduce((s, p) => s + p.amount, 0))}</span>
          </div>
        )}
      </div>

      {askOpen && (
        <AskOnWhatsApp
          students={students}
          studentFinancials={studentFinancials}
          schoolCode={schoolCode}
          bursarName={bursarName}
          onClose={() => setAskOpen(false)}
          onSent={(name) => { setAskOpen(false); showToast("success", `Payment request sent to ${name}'s guardian on WhatsApp.`); }}
        />
      )}

      {/* Record Modal */}
      {showModal && (
        <Modal
          title="Record New Payment"
          subtitle="Select student and enter payment details"
          onClose={() => setShowModal(false)}
          wide
        >
          <form onSubmit={handleRecord} className="space-y-6">
            {modalError && (
              <div className="error-message">
                <AlertTriangle size={18} /> {modalError}
              </div>
            )}

            {/* Student Selector */}
            <div className="field">
              <label className="field__label">Student</label>
              {selectedStudent ? (
                <div className="flex-between filter-bar">
                  <div className="flex items-center gap-4">
                    <div className="assignment-avatar">
                      {initials(selectedStudent.fullName)}
                    </div>
                    <div>
                      <div className="font-semibold">{selectedStudent.fullName}</div>
                      <div className="text-muted">{selectedStudent.studentCode} • {selectedStudent.className}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted">Current Balance</div>
                    <div className={`font-bold ${selectedStudent.balance > 0 ? "text-danger" : "text-success"}`}>
                      {fmt(selectedStudent.balance)}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedStudent(null)} className="icon-btn">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <StudentSearch
                  students={students}
                  studentFinancials={studentFinancials}
                  onSelect={setSelectedStudent}
                />
              )}
            </div>

            {selectedStudent && (
              <>
                <div className="grid grid-cols-2">
                  <div className="field col-span-2">
                    <label className="field__label">Amount (MWK) <span className="text-danger">*</span></label>
                    <div className="input-prefix">
                      <span className="input-prefix__label">MWK</span>
                      <input
                        type="number"
                        min="1"
                        value={form.amount}
                        onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                        className="field__input"
                        placeholder="0"
                      />
                    </div>
                    {formErrors.amount && <p className="text-danger mt-1">{formErrors.amount}</p>}
                  </div>

                  <div className="field">
                    <label className="field__label">Payment Method <span className="text-danger">*</span></label>
                    <select value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))} className="field__select">
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field__label">Term</label>
                    <select value={form.term} onChange={(e) => setForm((p) => ({ ...p, term: e.target.value }))} className="field__select">
                      {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {sponsorships.some((x) => x.studentId === selectedStudent?.id) && (
                    <div className="field">
                      <label className="field__label">Paid by</label>
                      <select
                        value={form.sponsorId}
                        onChange={(e) => setForm((p) => ({ ...p, sponsorId: e.target.value }))}
                        className="field__select"
                      >
                        <option value="">The family</option>
                        {sponsorships
                          .filter((x) => x.studentId === selectedStudent?.id)
                          .map((x) => (
                            <option key={x.id} value={x.sponsorId}>{x.sponsorName}</option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="field">
                    <label className="field__label">Payment Date</label>
                    <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="field__input" />
                  </div>

                  <div className="field">
                    <label className="field__label">Reference / Transaction No.</label>
                    <input value={form.referenceNo} onChange={(e) => setForm((p) => ({ ...p, referenceNo: e.target.value }))} className="field__input" placeholder="Optional" />
                  </div>

                  <div className="field col-span-2">
                    <label className="field__label">Notes</label>
                    <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="field__textarea" placeholder="Additional notes..." />
                  </div>
                </div>

                {form.amount && Number(form.amount) > 0 && (
                  <div className="flex-between filter-bar">
                    <span>Balance after this payment</span>
                    <span className="font-bold">
                      {fmt(Math.max(0, selectedStudent.balance - Number(form.amount)))}
                    </span>
                  </div>
                )}

                <div className="flex gap-4 mt-4">
                  <Btn type="button" variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancel</Btn>
                  <Btn type="submit" variant="accent" loading={actionLoading} className="flex-1">
                    <Receipt size={16} /> Record Payment
                  </Btn>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {/* ── Collect online: pick the student, then hand over to PayChangu ──
          Split in two because the two halves have different failure modes. If
          the wrong child is chosen the money still arrives, credited to the
          wrong account, and unpicking that is a manual correction — so the
          choice is made deliberately, on its own screen, with the balance
          shown, before any amount is entered. */}
      {collecting && !collecting.student && (
        <Modal
          title="Collect a payment online"
          subtitle="Airtel Money, TNM Mpamba or card. The receipt is written only once PayChangu confirms the money."
          onClose={() => setCollecting(null)}
        >
          <div className="space-y-4">
            <StudentSearch
              students={students}
              studentFinancials={studentFinancials}
              onSelect={(s) => setCollecting({ student: s })}
            />
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              Search by name, student code or class. Their outstanding balance is used as the
              suggested amount — part-payment is fine.
            </p>
          </div>
        </Modal>
      )}

      {collecting?.student && (
        <PayChanguCheckout
          purpose="school_fee"
          title={`Collect from ${collecting.student.fullName}`}
          subtitle={`${collecting.student.studentCode} · ${collecting.student.className || "No class"}`}
          context={{
            studentId: collecting.student.id,
            term: form.term || "Term 1",
            academicYear,
          }}
          defaultAmount={Math.max(0, collecting.student.balance || 0)}
          payerName={collecting.student.guardianName || ""}
          payerPhone={collecting.student.guardianPhone || ""}
          payerEmail={collecting.student.guardianEmail || ""}
          onClose={() => setCollecting(null)}
          onSettled={() => {
            showToast("success", "Payment confirmed by PayChangu and added to the ledger.");
            fetchAll();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type === "success" ? "toast--success" : "toast--error"}`}>
          {toast.type === "success" ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="toast__close"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
