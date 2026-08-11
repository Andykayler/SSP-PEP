// pages/bursar/modules/Receipts.jsx
import { useState, useEffect, useRef } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Search, X, Printer, Receipt as ReceiptIcon } from "lucide-react";
import "./staff-management.css"; 

// ─── Avatar Helper ──────────────────────────────────────────────────────────
function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const AVATAR_TONES = [
  "bg-blue-500/20 text-blue-300",
  "bg-violet-500/20 text-violet-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-orange-500/20 text-orange-300",
  "bg-rose-500/20 text-rose-300",
  "bg-cyan-500/20 text-cyan-300",
];
function avatarColor(name = "") {
  return AVATAR_TONES[name.charCodeAt(0) % AVATAR_TONES.length] || AVATAR_TONES[0];
}

// ─── Printable Receipt ──────────────────────────────────────────────────────
function PrintableReceipt({ payment, schoolName, onClose }) {
  const receiptRef = useRef(null);

  function handlePrint() {
    const printWindow = window.open("", "_blank", "width=380,height=620");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${payment.receiptNo}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; line-height: 1.4; color: #111; background: #fff; padding: 20px; }
            .receipt { max-width: 320px; margin: 0 auto; border: 2px solid #ddd; padding: 24px 20px; background: white; }
            .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 16px; margin-bottom: 16px; }
            .school { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            .title { font-size: 13px; font-weight: 600; margin-top: 4px; color: #222; }
            .no { font-family: 'DM Mono', monospace; font-size: 11px; color: #666; margin-top: 4px; }
            .info { margin: 14px 0; }
            .row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 12.5px; }
            .label { color: #555; }
            .amt { font-size: 15px; font-weight: 700; border-top: 2px solid #111; padding-top: 10px; margin-top: 12px; }
            .stamp { display: inline-block; border: 3px solid #166534; color: #166534; padding: 4px 18px; font-weight: 900; font-size: 15px; transform: rotate(-6deg); margin: 18px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 10.5px; color: #666; border-top: 1px dashed #ccc; padding-top: 12px; }
          </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 800)">
          <div class="receipt">
            <div class="header">
              <div class="school">${schoolName}</div>
              <div class="title">OFFICIAL PAYMENT RECEIPT</div>
              <div class="no">${payment.receiptNo}</div>
            </div>

            <div class="info">
              <div class="row"><span class="label">Date</span><span>${payment.paymentDate}</span></div>
              <div class="row"><span class="label">Academic Year</span><span>${payment.academicYear}</span></div>
              <div class="row"><span class="label">Term</span><span>${payment.term}</span></div>
            </div>

            <div class="info" style="border-top:1px dashed #ccc; padding-top:12px;">
              <div class="row"><span class="label">Student</span><span>${payment.studentName}</span></div>
              <div class="row"><span class="label">Code</span><span>${payment.studentCode}</span></div>
              <div class="row"><span class="label">Class</span><span>${payment.className}</span></div>
            </div>

            <div class="info" style="border-top:1px dashed #ccc; padding-top:12px;">
              <div class="row"><span class="label">Method</span><span>${payment.method}</span></div>
              ${payment.referenceNo ? `<div class="row"><span class="label">Ref No.</span><span>${payment.referenceNo}</span></div>` : ''}
              ${payment.notes ? `<div class="row"><span class="label">Notes</span><span>${payment.notes}</span></div>` : ''}
            </div>

            <div class="amt flex justify-between">
              <span>AMOUNT PAID</span>
              <span>${`MWK ${Number(payment.amount).toLocaleString()}`}</span>
            </div>

            <div class="text-center">
              <div class="stamp">PAID</div>
            </div>

            <div class="footer">
              Recorded by: ${payment.recordedBy}<br>
              Please keep this receipt for your records.<br>
              SSP-PEP • Ministry of Education, Malawi
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: "420px" }}>
        <div className="modal-header">
          <h3>Receipt Preview</h3>
          <button onClick={onClose} className="modal-close"><X size={18} /></button>
        </div>
        <div className="modal-body p-0">
          <div ref={receiptRef} className="p-8 bg-white border border-border rounded-t-3xl font-mono text-sm">
            <div className="text-center mb-6 border-b border-dashed pb-6">
              <div className="font-bold text-lg tracking-wider uppercase">{schoolName}</div>
              <div className="font-semibold mt-1">OFFICIAL PAYMENT RECEIPT</div>
              <div className="text-xs text-muted mt-1 font-mono">{payment.receiptNo}</div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">Date</span><span>{payment.paymentDate}</span></div>
              <div className="flex justify-between"><span className="text-muted">Academic Year</span><span>{payment.academicYear}</span></div>
              <div className="flex justify-between"><span className="text-muted">Term</span><span>{payment.term}</span></div>
            </div>

            <div className="my-6 border-t border-dashed pt-6 space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">Student</span><span className="font-medium">{payment.studentName}</span></div>
              <div className="flex justify-between"><span className="text-muted">Code</span><span>{payment.studentCode}</span></div>
              <div className="flex justify-between"><span className="text-muted">Class</span><span>{payment.className}</span></div>
            </div>

            <div className="border-t border-dashed pt-6 space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">Method</span><span>{payment.method}</span></div>
              {payment.referenceNo && <div className="flex justify-between"><span className="text-muted">Ref No.</span><span>{payment.referenceNo}</span></div>}
            </div>

            <div className="mt-8 pt-6 border-t-2 border-black flex justify-between items-end font-bold text-lg">
              <span>AMOUNT PAID</span>
              <span>{`MWK ${Number(payment.amount).toLocaleString()}`}</span>
            </div>

            <div className="flex justify-center my-8">
              <div className="border-4 border-success text-success font-black text-xl px-8 py-1 tracking-[3px] rotate-[-6deg]">PAID</div>
            </div>

            <div className="text-center text-xs text-muted border-t pt-6">
              Recorded by: {payment.recordedBy}<br />
              SSP-PEP • Ministry of Education, Malawi
            </div>
          </div>

          <div className="p-6 flex gap-3 border-t">
            <button onClick={onClose} className="btn btn--secondary flex-1">Close</button>
            <button onClick={handlePrint} className="btn btn--accent flex-1">
              <Printer size={16} /> Print Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Receipts({ schoolCode, schoolName }) {
  const [payments, setPayments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [previewPayment, setPreviewPayment] = useState(null);

  useEffect(() => {
    fetchData();
    const handler = (e) => setPreviewPayment(e.detail);
    window.addEventListener("printReceipt", handler);
    return () => window.removeEventListener("printReceipt", handler);
  }, [academicYear]);

  async function fetchData() {
    setLoading(true);
    try {
      const [pySnap, clSnap] = await Promise.all([
        getDocs(query(
          collection(db, "payments"),
          where("schoolCode", "==", schoolCode),
          where("academicYear", "==", academicYear),
          orderBy("createdAt", "desc")
        )),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
      ]);
      setPayments(pySnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !search || 
      p.receiptNo?.toLowerCase().includes(q) || 
      p.studentName?.toLowerCase().includes(q) || 
      p.studentCode?.toLowerCase().includes(q);
    const matchClass = classFilter === "all" || p.classId === classFilter;
    return matchSearch && matchClass;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Receipts</h2>
          <p className="text-muted">View, search and reprint official receipts</p>
        </div>
        <select 
          value={academicYear} 
          onChange={(e) => setAcademicYear(e.target.value)} 
          className="form-input form-input--compact"
        >
          {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-wrapper flex-1">
          <Search className="search-icon" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt, student..."
            className="search-input"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">
              <X size={16} />
            </button>
          )}
        </div>

        <select 
          value={classFilter} 
          onChange={(e) => setClassFilter(e.target.value)} 
          className="form-input form-input--compact"
        >
          <option value="all">All Classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted">
            <div className="spinner" style={{ width: "38px", height: "38px" }} />
            <p className="mt-6">Loading receipts...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state py-24">
            <ReceiptIcon size={52} className="text-muted mb-4" />
            <div className="empty-state__title">No receipts found</div>
            <p className="empty-state__sub">Receipts appear after recording payments</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Student</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-primary-dim">
                    <td data-label="Receipt">
                      <span className="font-mono text-sm font-medium">{p.receiptNo}</span>
                    </td>
                    <td data-label="Student">
                      <div className="flex items-center gap-3">
                        <div className={`assignment-avatar text-xs ${avatarColor(p.studentName)}`}>
                          {initials(p.studentName)}
                        </div>
                        <div>
                          <div className="font-medium">{p.studentName}</div>
                          <div className="text-xs text-muted">{p.className}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Method">
                      <span className="tag">{p.method}</span>
                    </td>
                    <td data-label="Date" className="text-muted">{p.paymentDate}</td>
                    <td data-label="Amount" className="text-right font-semibold text-success">{fmt(p.amount)}</td>
                    <td className="text-right">
                      <button 
                        onClick={() => setPreviewPayment(p)} 
                        className="icon-btn"
                        title="View & Print"
                      >
                        <Printer size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewPayment && (
        <PrintableReceipt
          payment={previewPayment}
          schoolName={schoolName}
          onClose={() => setPreviewPayment(null)}
        />
      )}
    </div>
  );
}