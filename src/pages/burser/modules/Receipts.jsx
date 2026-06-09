// pages/bursar/modules/Receipts.jsx
import { useState, useEffect, useRef } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

const IC = {
  search:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"/></svg>,
  close:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  print:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>,
  eye:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  check:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
};

const Spinner = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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

const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

// ─── Printable Receipt Component ──────────────────────────────────────────────
function PrintableReceipt({ payment, schoolName, onClose }) {
  const receiptRef = useRef(null);

  function handlePrint() {
    const content = receiptRef.current.innerHTML;
    const printWindow = window.open("", "_blank", "width=400,height=600");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${payment.receiptNo}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; }
            .receipt { width: 320px; margin: 0 auto; padding: 16px; }
            .header { text-align: center; margin-bottom: 12px; border-bottom: 2px dashed #000; padding-bottom: 12px; }
            .school-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
            .receipt-title { font-size: 13px; font-weight: bold; margin-top: 4px; letter-spacing: 0.1em; }
            .receipt-no { font-size: 10px; margin-top: 2px; }
            .section { margin: 10px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 11px; }
            .row .label { color: #555; }
            .row .value { font-weight: bold; text-align: right; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .amount-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin: 8px 0; border-top: 2px solid #000; padding-top: 8px; }
            .footer { text-align: center; margin-top: 16px; padding-top: 12px; border-top: 2px dashed #000; font-size: 10px; color: #555; }
            .stamp { text-align: center; margin: 12px 0; font-size: 16px; font-weight: bold; letter-spacing: 0.15em; border: 3px solid #000; padding: 6px; display: inline-block; transform: rotate(-5deg); color: #006600; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              <div class="school-name">${schoolName}</div>
              <div class="receipt-title">OFFICIAL PAYMENT RECEIPT</div>
              <div class="receipt-no">${payment.receiptNo}</div>
            </div>
            <div class="section">
              <div class="row"><span class="label">Date</span><span class="value">${payment.paymentDate}</span></div>
              <div class="row"><span class="label">Academic Year</span><span class="value">${payment.academicYear}</span></div>
              <div class="row"><span class="label">Term</span><span class="value">${payment.term}</span></div>
            </div>
            <div class="divider"></div>
            <div class="section">
              <div class="row"><span class="label">Student Name</span><span class="value">${payment.studentName}</span></div>
              <div class="row"><span class="label">Student Code</span><span class="value">${payment.studentCode}</span></div>
              <div class="row"><span class="label">Class</span><span class="value">${payment.className}</span></div>
            </div>
            <div class="divider"></div>
            <div class="section">
              <div class="row"><span class="label">Payment Method</span><span class="value">${payment.method}</span></div>
              ${payment.referenceNo ? `<div class="row"><span class="label">Reference No.</span><span class="value">${payment.referenceNo}</span></div>` : ""}
              ${payment.notes ? `<div class="row"><span class="label">Notes</span><span class="value">${payment.notes}</span></div>` : ""}
            </div>
            <div class="amount-row">
              <span>AMOUNT PAID</span>
              <span>${fmt(payment.amount)}</span>
            </div>
            <div style="text-align:center; margin: 12px 0;">
              <span class="stamp">PAID</span>
            </div>
            <div class="footer">
              <div>Recorded by: ${payment.recordedBy}</div>
              <div style="margin-top: 4px;">This is an official receipt. Please retain for your records.</div>
              <div style="margin-top: 4px;">SSP-PEP · Ministry of Education, Malawi</div>
            </div>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(15,32,68,0.45)", backdropFilter: "blur(3px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden my-auto">
        <div className="bg-[#0F2044] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-semibold text-base">Receipt Preview</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white">{IC.close}</button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {/* Preview */}
          <div ref={receiptRef} className="border-2 border-dashed border-gray-300 rounded-xl p-5 font-mono text-xs bg-gray-50">
            <div className="text-center mb-3 pb-3 border-b-2 border-dashed border-gray-400">
              <p className="font-bold text-base uppercase">{schoolName}</p>
              <p className="font-bold text-sm tracking-widest mt-1">OFFICIAL PAYMENT RECEIPT</p>
              <p className="text-gray-500 mt-0.5">{payment.receiptNo}</p>
            </div>
            <div className="space-y-1 mb-3">
              {[["Date", payment.paymentDate], ["Academic Year", payment.academicYear], ["Term", payment.term]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-bold">{v}</span></div>
              ))}
            </div>
            <div className="border-t border-dashed border-gray-300 pt-2 mb-3 space-y-1">
              {[["Student", payment.studentName], ["Code", payment.studentCode], ["Class", payment.className]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-bold">{v}</span></div>
              ))}
            </div>
            <div className="border-t border-dashed border-gray-300 pt-2 mb-3 space-y-1">
              {[["Method", payment.method], payment.referenceNo && ["Ref No.", payment.referenceNo]].filter(Boolean).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-bold">{v}</span></div>
              ))}
            </div>
            <div className="border-t-2 border-gray-800 pt-2 flex justify-between font-bold text-sm">
              <span>AMOUNT PAID</span><span>{fmt(payment.amount)}</span>
            </div>
            <div className="text-center my-3">
              <span className="inline-block border-4 border-green-700 text-green-700 font-black text-lg px-4 py-1 tracking-widest" style={{ transform: "rotate(-5deg)", display: "inline-block" }}>PAID</span>
            </div>
            <div className="border-t-2 border-dashed border-gray-400 pt-2 text-center text-gray-500 space-y-0.5">
              <p>Recorded by: {payment.recordedBy}</p>
              <p>Official receipt — retain for your records</p>
              <p>SSP-PEP · Ministry of Education, Malawi</p>
            </div>
          </div>

          <div className="flex gap-3 mt-5 justify-end">
            <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
            <Btn variant="teal" size="sm" onClick={handlePrint}>{IC.print} Print Receipt</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Receipts Module ─────────────────────────────────────────────────────
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
    // Listen for printReceipt event from Payments module
    const handler = (e) => setPreviewPayment(e.detail);
    window.addEventListener("printReceipt", handler);
    return () => window.removeEventListener("printReceipt", handler);
  }, [academicYear]);

  async function fetchData() {
    setLoading(true);
    try {
      const [pySnap, clSnap] = await Promise.all([
        getDocs(query(collection(db, "payments"), where("schoolCode", "==", schoolCode), where("academicYear", "==", academicYear), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
      ]);
      setPayments(pySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const filtered = payments.filter(p => {
    const ms = !search || p.receiptNo?.toLowerCase().includes(search.toLowerCase()) || p.studentName?.toLowerCase().includes(search.toLowerCase()) || p.studentCode?.toLowerCase().includes(search.toLowerCase());
    const mc = classFilter === "all" || p.classId === classFilter;
    return ms && mc;
  });

  const methodBadge = {
    "Cash": "bg-emerald-100 text-emerald-700",
    "Airtel Money": "bg-red-100 text-red-700",
    "TNM Mpamba": "bg-yellow-100 text-yellow-800",
    "National Bank Transfer": "bg-blue-100 text-blue-700",
    "Standard Bank Transfer": "bg-indigo-100 text-indigo-700",
    "NBS Transfer": "bg-purple-100 text-purple-700",
    "Cheque": "bg-gray-100 text-gray-700",
  };

  function initials(name = "") {
    return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F2044]">Receipts</h2>
          <p className="text-sm text-[#0F2044]/50 mt-0.5">View and reprint payment receipts</p>
        </div>
        <div className="flex gap-3">
          <select value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none appearance-none">
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0F2044]/30">{IC.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by receipt no., student name or code…" className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none focus:border-[#0F2044]/30 transition-all" />
        </div>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-[#0F2044]/10 bg-white outline-none appearance-none">
          <option value="all">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#0F2044]/8 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-[#0F2044]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#0F2044]/30">{IC.print}</div>
            <p className="font-semibold text-[#0F2044] mb-1">No receipts found</p>
            <p className="text-sm text-[#0F2044]/50">Receipts are generated when payments are recorded</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0F2044]/5">
                <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Receipt No.</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Student</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden sm:table-cell">Method</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40 hidden md:table-cell">Date</th>
                <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Amount</th>
                <th className="px-5 py-3.5 text-right text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F2044]/5">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs font-bold text-[#0F2044] bg-[#F7F5F0] px-2.5 py-1 rounded-lg">{p.receiptNo}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#0F2044] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">{initials(p.studentName)}</div>
                      <div>
                        <p className="text-sm font-semibold text-[#0F2044]">{p.studentName}</p>
                        <p className="text-xs text-[#0F2044]/40">{p.className}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${methodBadge[p.method] || "bg-gray-100 text-gray-700"}`}>{p.method}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#0F2044]/60 hidden md:table-cell">{p.paymentDate}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-emerald-700">{fmt(p.amount)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => setPreviewPayment(p)} className="p-2 rounded-lg hover:bg-[#0F2044]/5 text-[#0F2044]/50 hover:text-[#0F2044] transition-colors" title="View & Print">
                      {IC.print}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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