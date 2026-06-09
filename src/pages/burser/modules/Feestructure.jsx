// pages/bursar/modules/FeeStructure.jsx
import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy,
} from "firebase/firestore";

// ─── Icons ────────────────────────────────────────────────────────────────
const IC = {
  plus:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  edit:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>,
  trash:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>,
  close:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>,
  check:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
  fees:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z"/></svg>,
};

// ─── Shared UI Components ───────────────────────────────────────────────────
const Spinner = () => (
  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
    style={{ backgroundColor: "rgba(15,32,68,0.45)", backdropFilter: "blur(3px)" }}>
    <div className={`bg-app-surface rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} overflow-hidden my-auto`}>
      <div className="bg-app-primary px-6 py-4 flex items-center justify-between">
        <h3 className="text-white font-semibold text-base">{title}</h3>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">{IC.close}</button>
      </div>
      <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Input = ({ label, required, error, prefix, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-app-text/60 uppercase tracking-wider">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
    <div className="relative">
      {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-app-text/40">{prefix}</span>}
      <input {...props} className={`w-full ${prefix ? "pl-10" : "px-3.5"} pr-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all ${error ? "border-red-300 bg-red-50" : "border-app-border bg-app-bg/60 focus:border-[#0F2044]/40 focus:bg-app-surface"}`} />
    </div>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const Select = ({ label, required, error, children, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold text-app-text/60 uppercase tracking-wider">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
    <select {...props} className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all appearance-none ${error ? "border-red-300 bg-red-50" : "border-app-border bg-app-bg/60 focus:border-[#0F2044]/40 focus:bg-app-surface"}`}>
      {children}
    </select>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const Btn = ({ children, variant = "primary", size = "md", loading, className = "", ...props }) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-sm" };
  const variants = {
    primary: "bg-app-primary text-white hover:bg-app-primary/90",
    gold:    "bg-app-warning text-app-text hover:brightness-105",
    ghost:   "border border-app-border text-app-text/70 hover:bg-app-primary/5",
    danger:  "bg-red-600 text-white hover:bg-red-700",
  };
  return <button {...props} disabled={loading || props.disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>{loading ? <Spinner /> : children}</button>;
};

const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;

const FEE_CATEGORIES = ["Tuition", "Development Levy", "Exam Fee", "Sports Fee", "Library Fee", "Boarding", "Uniform", "Books & Stationery", "Other"];
const TERMS = ["Term 1", "Term 2", "Term 3", "Full Year"];
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

export default function FeeStructure({ schoolCode, schoolName }) {
  const [structures, setStructures] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterYear, setFilterYear] = useState("2025/2026");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");

  const EMPTY = { 
    name: "", 
    classId: "", 
    className: "", 
    category: "", 
    amount: "", 
    term: "Full Year", 
    academicYear: "2025/2026", 
    description: "", 
    mandatory: true 
  };

  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchAll();
  }, [filterYear]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [fsSnap, clSnap] = await Promise.all([
        getDocs(query(
          collection(db, "fee_structures"), 
          where("schoolCode", "==", schoolCode), 
          where("academicYear", "==", filterYear), 
          orderBy("createdAt", "desc")
        )),
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode)))
      ]);

      setStructures(fsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
    } catch (e) {
      console.error(e);
      setError("Failed to load data");
    }
    setLoading(false);
  }

  function validate(f) {
    const e = {};
    if (!f.name?.trim()) e.name = "Fee name required.";
    if (!f.classId) e.classId = "Select a class.";
    if (!f.category) e.category = "Select a category.";
    if (!f.amount || isNaN(f.amount) || Number(f.amount) <= 0) e.amount = "Enter a valid amount.";
    return e;
  }

  async function handleAdd(ev) {
    ev.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const cls = classes.find(c => c.id === form.classId);
      await addDoc(collection(db, "fee_structures"), {
        ...form,
        amount: Number(form.amount),
        className: cls?.name || "",
        schoolCode,
        schoolName,
        createdAt: serverTimestamp(),
      });

      setSuccess("Fee structure added successfully.");
      setShowAdd(false);
      setForm(EMPTY);
      fetchAll();
    } catch (err) {
      setError("Failed to add fee: " + err.message);
    }
    setActionLoading(false);
  }

  async function handleEdit(ev) {
    ev.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setFormErrors(errs);
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const cls = classes.find(c => c.id === form.classId);
      await updateDoc(doc(db, "fee_structures", showEdit.id), {
        ...form,
        amount: Number(form.amount),
        className: cls?.name || "",
        updatedAt: serverTimestamp(),
      });
      setSuccess("Fee structure updated successfully.");
      setShowEdit(null);
      fetchAll();
    } catch (err) {
      setError("Failed to update fee: " + err.message);
    }
    setActionLoading(false);
  }

  async function handleDelete() {
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, "fee_structures", showDelete.id));
      setSuccess("Fee structure deleted.");
      setShowDelete(null);
      fetchAll();
    } catch (err) {
      setError("Delete failed.");
    }
    setActionLoading(false);
  }

  function openEdit(s) {
    setForm({
      name: s.name,
      classId: s.classId,
      className: s.className,
      category: s.category,
      amount: String(s.amount),
      term: s.term,
      academicYear: s.academicYear,
      description: s.description || "",
      mandatory: s.mandatory !== false
    });
    setFormErrors({});
    setError("");
    setShowEdit(s);
  }

  // Filter structures
  const filteredStructures = selectedClassFilter === "all" 
    ? structures 
    : structures.filter(s => s.classId === selectedClassFilter);

  const grouped = filteredStructures.reduce((acc, s) => {
    const key = s.className || "Uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const totalByClass = Object.entries(grouped).map(([cls, fees]) => ({
    cls,
    total: fees.reduce((sum, f) => sum + (f.amount || 0), 0),
    count: fees.length
  }));

  const FormBody = ({ onSubmit, isEdit }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input label="Fee Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Term 1 Tuition Fee" error={formErrors.name} />
        </div>

        <Select label="Class" required value={form.classId} onChange={e => setForm(p => ({ ...p, classId: e.target.value }))} error={formErrors.classId}>
          <option value="">Select class...</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>

        <Select label="Category" required value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} error={formErrors.category}>
          <option value="">Select category...</option>
          {FEE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>

        <Input label="Amount (MWK)" required type="number" min="0" prefix="MWK" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" error={formErrors.amount} />

        <Select label="Term / Period" value={form.term} onChange={e => setForm(p => ({ ...p, term: e.target.value }))}>
          {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>

        <Select label="Academic Year" value={form.academicYear} onChange={e => setForm(p => ({ ...p, academicYear: e.target.value }))}>
          {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>

        <div className="col-span-2 flex items-center gap-3 px-3.5 py-2.5 bg-app-bg/60 border border-app-border rounded-xl">
          <input type="checkbox" id="mandatory" checked={form.mandatory} onChange={e => setForm(p => ({ ...p, mandatory: e.target.checked }))} className="w-4 h-4 accent-[#0F2044]" />
          <label htmlFor="mandatory" className="text-sm text-app-text/70 cursor-pointer">Mandatory fee (required for all students in this class)</label>
        </div>

        <div className="col-span-2">
          <Input label="Description (optional)" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Additional details…" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Btn type="button" variant="ghost" onClick={() => { setShowAdd(false); setShowEdit(null); }}>Cancel</Btn>
        <Btn type="submit" variant="gold" loading={actionLoading}>
          {IC.check} {isEdit ? "Update Fee" : "Create Fee"}
        </Btn>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-app-text">Fee Structures</h2>
          <p className="text-sm text-app-text/50 mt-0.5">Define fee templates based on classes created in School Settings</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none focus:border-[#0F2044]/30 appearance-none">
            {ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select value={selectedClassFilter} onChange={e => setSelectedClassFilter(e.target.value)} className="px-3.5 py-2.5 text-sm rounded-xl border border-app-border bg-app-surface outline-none focus:border-[#0F2044]/30 appearance-none">
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <Btn onClick={() => { 
            setForm({ ...EMPTY, academicYear: filterYear }); 
            setFormErrors({}); 
            setShowAdd(true); 
          }} variant="gold">
            {IC.plus} Add Fee
          </Btn>
        </div>
      </div>

      {success && <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">{IC.check} {success}</div>}
      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}

      {/* Summary Cards */}
      {totalByClass.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {totalByClass.map(({ cls, total, count }) => (
            <div key={cls} className="bg-app-surface rounded-2xl border border-app-border p-4">
              <p className="text-xs font-bold text-app-text/40 uppercase tracking-wider mb-1">{cls}</p>
              <p className="text-lg font-bold text-app-text">{fmt(total)}</p>
              <p className="text-xs text-app-text/40">{count} fee{count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="bg-app-surface rounded-2xl border border-app-border p-12 flex justify-center"><Spinner /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-app-surface rounded-2xl border border-app-border p-12 text-center">
          <div className="w-14 h-14 bg-app-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4 text-app-text/30">{IC.fees}</div>
          <p className="font-semibold text-app-text mb-1">No fee structures found</p>
          <p className="text-sm text-app-text/50 mb-4">Create fee templates for your classes</p>
          <Btn onClick={() => setShowAdd(true)} variant="gold">{IC.plus} Add First Fee</Btn>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([className, fees]) => (
            <div key={className} className="bg-app-surface rounded-2xl border border-app-border overflow-hidden">
              <div className="px-5 py-4 bg-app-bg border-b flex items-center justify-between">
                <div className="font-semibold text-app-text">{className}</div>
                <div className="text-sm text-app-text/50">
                  {fees.length} fees • Total: <span className="font-semibold text-app-text">{fmt(fees.reduce((sum, f) => sum + (f.amount || 0), 0))}</span>
                </div>
              </div>

              <div className="data-table-wrap">
<table className="data-table data-table--stack">
                <thead>
                  <tr className="border-b border-[#0F2044]/5">
                    <th>Fee Name</th>
                    <th>Category</th>
                    <th>Term</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0F2044]/5">
                  {fees.map(fee => (
                    <tr key={fee.id} className="hover:bg-app-bg/60 transition-colors">
                      <td className="px-5 py-4" data-label="Fee Name">
                        <div className="font-medium text-app-text">{fee.name}</div>
                        {fee.description && <div className="text-xs text-app-text/50 mt-0.5">{fee.description}</div>}
                        {fee.mandatory && <span className="inline-block mt-1 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Mandatory</span>}
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell" data-label="Category">
                        <span className="text-xs px-2.5 py-1 bg-app-primary/5 rounded-lg">{fee.category}</span>
                      </td>
                      <td className="px-5 py-4 text-xs text-app-text/60 hidden md:table-cell" data-label="Term">{fee.term}</td>
                      <td className="px-5 py-4 text-right font-semibold text-app-text" data-label="Amount">{fmt(fee.amount)}</td>
                      <td className="px-5 py-4 text-right" data-label="Actions">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(fee)} className="p-2 hover:bg-app-primary/5 rounded-lg transition-colors" title="Edit">{IC.edit}</button>
                          <button onClick={() => setShowDelete(fee)} className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors" title="Delete">{IC.trash}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
</div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <Modal title="Add Fee Structure" onClose={() => setShowAdd(false)} wide>
          <FormBody onSubmit={handleAdd} isEdit={false} />
        </Modal>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <Modal title="Edit Fee Structure" onClose={() => setShowEdit(null)} wide>
          <FormBody onSubmit={handleEdit} isEdit={true} />
        </Modal>
      )}

      {/* Delete Confirmation */}
      {showDelete && (
        <Modal title="Delete Fee Structure" onClose={() => setShowDelete(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              {IC.warning}
              <div>
                <p className="text-sm font-semibold text-red-800">Delete this fee structure?</p>
                <p className="text-xs text-red-600 mt-1">
                  <strong>{showDelete.name}</strong> will be permanently removed.<br />
                  Existing student assignments will not be affected.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Btn variant="ghost" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDelete}>Delete Fee</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}