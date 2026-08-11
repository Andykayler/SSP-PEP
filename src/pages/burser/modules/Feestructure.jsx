// pages/bursar/modules/FeeStructure.jsx
import { useState, useEffect } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, orderBy,
} from "firebase/firestore";
import {
  Plus, Edit2, Trash2, X, AlertTriangle, Check,
  Receipt, Loader2,
} from "lucide-react";
import "./staff-management.css"; 

// ─── Shared UI Components ───────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => (
  <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal-container" style={{ maxWidth: wide ? "640px" : "440px" }}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button onClick={onClose} className="modal-close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

const Input = ({ label, required, error, prefix, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label className="text-xs font-semibold text-muted uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    )}
    <div className="relative">
      {prefix && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
          {prefix}
        </span>
      )}
      <input
        {...props}
        className={`form-input ${prefix ? "pl-10" : ""} ${error ? "form-input--error" : ""}`}
      />
    </div>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const Select = ({ label, required, error, children, ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label className="text-xs font-semibold text-muted uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    )}
    <select {...props} className={`form-input ${error ? "form-input--error" : ""}`}>
      {children}
    </select>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const Btn = ({ children, variant = "accent", size = "md", loading, className = "", ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className={`btn btn--${variant} btn--${size} ${className}`}
  >
    {loading ? <Loader2 size={14} className="animate-spin" /> : children}
  </button>
);

const fmt = (n) => `MWK ${Number(n || 0).toLocaleString()}`;

const FEE_CATEGORIES = ["Tuition", "Development Levy", "Exam Fee", "Sports Fee", "Library Fee", "Boarding", "Uniform", "Books & Stationery", "Other"];
const TERMS = ["Term 1", "Term 2", "Term 3", "Full Year"];
const ACADEMIC_YEARS = ["2024/2025", "2025/2026", "2026/2027"];

// ─── Skeleton loading (mirrors real layout — no pop-in, no reflow) ─────────
function SkeletonBlock({ w = "100%", h = 14, radius = 8, style = {} }) {
  return <div className="skeleton-block" style={{ width: w, height: h, borderRadius: radius, ...style }} />;
}

function SkeletonStatCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <SkeletonBlock w="60%" h={10} style={{ marginBottom: 10 }} />
          <SkeletonBlock w="45%" h={20} style={{ marginBottom: 8 }} />
          <SkeletonBlock w="35%" h={10} />
        </div>
      ))}
    </div>
  );
}

function SkeletonGroupTable({ rows = 3 }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 bg-app-bg border-b border-app-border flex items-center justify-between">
        <SkeletonBlock w={120} h={14} />
        <SkeletonBlock w={160} h={12} />
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fee Name</th>
              <th>Category</th>
              <th>Term</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-4">
                  <SkeletonBlock w="70%" h={13} style={{ marginBottom: 6 }} />
                  <SkeletonBlock w="40%" h={10} />
                </td>
                <td className="px-5 py-4 hidden sm:table-cell"><SkeletonBlock w={70} h={20} radius={8} /></td>
                <td className="px-5 py-4 hidden md:table-cell"><SkeletonBlock w={60} h={12} /></td>
                <td className="px-5 py-4"><SkeletonBlock w={80} h={14} style={{ marginLeft: "auto" }} /></td>
                <td className="px-5 py-4"><SkeletonBlock w={56} h={28} radius={8} style={{ marginLeft: "auto" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
    mandatory: true,
  };

  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear]);

  // auto-dismiss success toast
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(t);
  }, [success]);

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
        getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
      ]);

      setStructures(fsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    } catch (e) {
      console.error(e);
      setError("Failed to load data.");
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
      const cls = classes.find((c) => c.id === form.classId);
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
      const cls = classes.find((c) => c.id === form.classId);
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
      mandatory: s.mandatory !== false,
    });
    setFormErrors({});
    setError("");
    setShowEdit(s);
  }

  const filteredStructures =
    selectedClassFilter === "all" ? structures : structures.filter((s) => s.classId === selectedClassFilter);

  const grouped = filteredStructures.reduce((acc, s) => {
    const key = s.className || "Uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const totalByClass = Object.entries(grouped).map(([cls, fees]) => ({
    cls,
    total: fees.reduce((sum, f) => sum + (f.amount || 0), 0),
    count: fees.length,
  }));

  const FormBody = ({ onSubmit, isEdit }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="alert alert--error">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input label="Fee Name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Term 1 Tuition Fee" error={formErrors.name} />
        </div>

        <Select label="Class" required value={form.classId} onChange={(e) => setForm((p) => ({ ...p, classId: e.target.value }))} error={formErrors.classId}>
          <option value="">Select class...</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>

        <Select label="Category" required value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} error={formErrors.category}>
          <option value="">Select category...</option>
          {FEE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>

        <Input label="Amount (MWK)" required type="number" min="0" prefix="MWK" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" error={formErrors.amount} />

        <Select label="Term / Period" value={form.term} onChange={(e) => setForm((p) => ({ ...p, term: e.target.value }))}>
          {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>

        <Select label="Academic Year" value={form.academicYear} onChange={(e) => setForm((p) => ({ ...p, academicYear: e.target.value }))}>
          {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>

        <div className="col-span-2 flex items-center gap-3 px-3.5 py-2.5 bg-app-bg border border-app-border rounded-xl">
          <input type="checkbox" id="mandatory" checked={form.mandatory} onChange={(e) => setForm((p) => ({ ...p, mandatory: e.target.checked }))} className="w-4 h-4" />
          <label htmlFor="mandatory" className="text-sm text-muted cursor-pointer">Mandatory fee (required for all students in this class)</label>
        </div>

        <div className="col-span-2">
          <Input label="Description (optional)" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Additional details…" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Btn type="button" variant="secondary" onClick={() => { setShowAdd(false); setShowEdit(null); }}>Cancel</Btn>
        <Btn type="submit" variant="accent" loading={actionLoading}>
          <Check size={14} /> {isEdit ? "Update Fee" : "Create Fee"}
        </Btn>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif" }}>Fee Structures</h2>
          <p className="text-muted">Define fee templates based on classes created in School Settings</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="form-input form-input--compact">
            {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <select value={selectedClassFilter} onChange={(e) => setSelectedClassFilter(e.target.value)} className="form-input form-input--compact">
            <option value="all">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <Btn onClick={() => { setForm({ ...EMPTY, academicYear: filterYear }); setFormErrors({}); setShowAdd(true); }} variant="accent">
            <Plus size={15} /> Add Fee
          </Btn>
        </div>
      </div>

      {success && <div className="alert alert--success"><Check size={14} /> {success}</div>}
      {error && !loading && <div className="alert alert--error">{error}</div>}

      {loading ? (
        <>
          <SkeletonStatCards count={4} />
          <div className="space-y-6">
            <SkeletonGroupTable rows={3} />
            <SkeletonGroupTable rows={2} />
          </div>
        </>
      ) : (
        <>
          {/* Summary Cards */}
          {totalByClass.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {totalByClass.map(({ cls, total, count }) => (
                <div key={cls} className="card p-4">
                  <p className="stat-card__label">{cls}</p>
                  <p className="stat-card__value">{fmt(total)}</p>
                  <p className="text-xs text-muted">{count} fee{count !== 1 ? "s" : ""}</p>
                </div>
              ))}
            </div>
          )}

          {Object.keys(grouped).length === 0 ? (
            <div className="empty-state">
              <Receipt size={32} className="text-muted" />
              <p className="empty-state__title">No fee structures found</p>
              <p className="empty-state__sub">Create fee templates for your classes</p>
              <button className="btn btn--accent btn--md" onClick={() => setShowAdd(true)}>
                <Plus size={15} /> Add First Fee
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([className, fees]) => (
                <div key={className} className="card overflow-hidden">
                  <div className="px-5 py-4 bg-app-bg border-b border-app-border flex items-center justify-between">
                    <div className="font-semibold text-app-text">{className}</div>
                    <div className="text-sm text-muted">
                      {fees.length} fees • Total: <span className="font-semibold text-app-text">{fmt(fees.reduce((sum, f) => sum + (f.amount || 0), 0))}</span>
                    </div>
                  </div>

                  <div className="data-table-wrap">
                    <table className="data-table data-table--stack">
                      <thead>
                        <tr>
                          <th>Fee Name</th>
                          <th>Category</th>
                          <th>Term</th>
                          <th>Amount</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fees.map((fee) => (
                          <tr key={fee.id}>
                            <td className="px-5 py-4" data-label="Fee Name">
                              <div className="font-medium text-app-text">{fee.name}</div>
                              {fee.description && <div className="text-xs text-muted mt-0.5">{fee.description}</div>}
                              {fee.mandatory && <span className="tag tag--success mt-1">Mandatory</span>}
                            </td>
                            <td className="px-5 py-4 hidden sm:table-cell" data-label="Category">
                              <span className="tag">{fee.category}</span>
                            </td>
                            <td className="px-5 py-4 text-xs text-muted hidden md:table-cell" data-label="Term">{fee.term}</td>
                            <td className="px-5 py-4 text-right font-semibold text-app-text" data-label="Amount">{fmt(fee.amount)}</td>
                            <td className="px-5 py-4 text-right" data-label="Actions">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => openEdit(fee)} className="icon-btn" title="Edit"><Edit2 size={14} /></button>
                                <button onClick={() => setShowDelete(fee)} className="icon-btn icon-btn--danger" title="Delete"><Trash2 size={14} /></button>
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
        </>
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
              <AlertTriangle size={18} className="text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Delete this fee structure?</p>
                <p className="text-xs text-red-600 mt-1">
                  <strong>{showDelete.name}</strong> will be permanently removed.<br />
                  Existing student assignments will not be affected.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Btn variant="secondary" onClick={() => setShowDelete(null)}>Cancel</Btn>
              <Btn variant="danger" loading={actionLoading} onClick={handleDelete}>Delete Fee</Btn>
            </div>
          </div>
        </Modal>
      )}

      <p className="text-center text-xs text-muted pt-1">
        Class structure is managed in School Settings. Fees created here apply to all students in the selected class.
      </p>
    </div>
  );
}