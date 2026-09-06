// src/pages/burser/modules/Expenses.jsx
// What the school spent, beside what it took in.
//
// The position strip at the top is the point of the module: fees collected
// against money spent, for the term. Until this existed the finance portal
// could show a healthy collection figure while the school was running at a
// loss, because the other half of the arithmetic lived in a paper cash book.
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Receipt, Plus, Pencil, Trash2, RefreshCw, Search, Printer } from "lucide-react";
import {
  fetchExpenses, saveExpense, deleteExpense, byCategory, position,
  EXPENSE_CATEGORIES, PAYMENT_METHODS, categoryLabel,
} from "../../../services/expenses";
import { subscribeSchoolSettings, termsMatch } from "../../../services/academicTerm";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, EmptyState, StatGrid,
  StatCard, ModuleHeader, Notice, LoadingState, FilterBar, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";
import { money } from "../../../components/ui/format";

const blank = (term) => ({
  date: new Date().toISOString().slice(0, 10),
  category: "maintenance", description: "", amount: "", method: "Cash",
  payee: "", reference: "", authorisedBy: "", term,
});

export default function Expenses({ schoolCode, currentUser }) {
  const [rows, setRows] = useState(null);
  const [payments, setPayments] = useState([]);
  const [term, setTerm] = useState("");
  const [form, setForm] = useState(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!schoolCode || !term) return;
    try {
      const [ex, paySnap] = await Promise.all([
        fetchExpenses(schoolCode, term),
        // Not filtered on term in the query: payments carry the fee modules'
        // "Term 1" while this screen knows "Term 1 2026", so an equality
        // filter would match nothing. Narrowed client-side instead.
        getDocs(query(
          collection(db, "payments"),
          where("schoolCode", "==", schoolCode),
        )),
      ]);
      setRows(ex);
      setPayments(paySnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => termsMatch(p.term, term)));
    } catch (err) {
      console.error("[expenses] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load the ledger: " + err.message });
      setRows([]);
    }
  }, [schoolCode, term]);

  useLoader(load);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, (s) => setTerm(s?.currentTerm || ""));
  }, [schoolCode]);


  const pos = useMemo(() => position({ payments, expenses: rows || [] }), [payments, rows]);
  const buckets = useMemo(() => byCategory(rows || []), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || [])
      .filter((r) => category === "all" || r.category === category)
      .filter((r) => !q
        || r.description?.toLowerCase().includes(q)
        || r.payee?.toLowerCase().includes(q));
  }, [rows, category, search]);

  const submit = async () => {
    setBusy(true);
    const res = await saveExpense({
      schoolCode, expense: { ...form, term: form.term || term }, actor: currentUser,
    });
    setBusy(false);
    if (!res.ok) { setNotice({ tone: "danger", text: res.error }); return; }
    setForm(null);
    setNotice({ tone: "success", text: form.id ? "Expense updated." : "Expense recorded." });
    load();
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.description}" (${money(r.amount)})?`)) return;
    await deleteExpense(r.id);
    setNotice({ tone: "success", text: "Expense deleted." });
    load();
  };

  if (!term) {
    return (
      <EmptyState
        icon={<Receipt size={28} />}
        title="No term is set"
        sub="Expenditure is tracked per term. Ask the head teacher to set the current term."
      />
    );
  }
  if (rows === null) return <LoadingState label="Loading the ledger…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Expenses & Petty Cash"
        subtitle={`Money out · ${term}`}
        actions={[
          <IconBtn key="p" icon={<Printer size={15} />} title="Print" onClick={() => window.print()} />,
          <IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />,
          <Btn key="a" variant="accent" icon={<Plus size={15} />} onClick={() => setForm(blank(term))}>
            Record Expense
          </Btn>,
        ]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Fees collected" value={money(pos.income)} tone="success"
          sub="Verified payments only" />
        <StatCard label="Spent" value={money(pos.spent)} tone="warning"
          sub={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`} />
        <StatCard label="Position" value={money(pos.net)}
          tone={pos.net >= 0 ? "success" : "danger"}
          sub={pos.net >= 0 ? "In surplus this term" : "Spending exceeds collection"} />
        <StatCard label="Largest category" value={buckets[0] ? buckets[0].label : "—"}
          sub={buckets[0] ? money(buckets[0].total) : "Nothing recorded"} />
      </StatGrid>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search description or payee…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterBar
          value={category}
          onChange={setCategory}
          options={[
            { id: "all", label: "All", count: rows.length },
            ...buckets.map((b) => ({
              id: b.id, label: b.label,
              count: rows.filter((r) => r.category === b.id).length,
            })),
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Receipt size={28} />}
          title={rows.length === 0 ? "Nothing recorded this term" : "No matching entries"}
          sub={rows.length === 0
            ? "Record what the school spends so the term's position is the whole picture, not just fees in."
            : "Try another category or clear the search."}
          action={rows.length === 0
            ? <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setForm(blank(term))}>
              Record Expense
            </Btn>
            : null}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Category</th><th>Payee</th>
                <th>Method</th><th>Amount</th><th>Authorised</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="text-muted">{r.date}</td>
                  <td><strong>{r.description}</strong></td>
                  <td className="text-muted">{categoryLabel(r.category)}</td>
                  <td className="text-muted">{r.payee || "—"}</td>
                  <td className="text-muted">{r.method}</td>
                  <td><strong>{money(r.amount)}</strong></td>
                  <td className="text-muted">{r.authorisedBy || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <div className="flex gap-2 justify-end">
                      <IconBtn icon={<Pencil size={15} />} title="Edit" onClick={() => setForm({ ...r })} />
                      <IconBtn icon={<Trash2 size={15} />} title="Delete" danger onClick={() => remove(r)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {form && (
        <Modal
          title={form.id ? "Edit expense" : "Record an expense"}
          onClose={() => setForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={submit}>Save</Btn>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Date" required type="date" value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              <Select label="Category" required value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </div>
            <Input label="Description" required value={form.description}
              placeholder="Replacement window panes, Form 2 block"
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount (MK)" required type="number" min="0" value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
              <Select label="Paid by" value={form.method}
                onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Paid to" value={form.payee}
                onChange={(e) => setForm((p) => ({ ...p, payee: e.target.value }))} />
              <Input label="Receipt / reference" value={form.reference}
                onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
            </div>
            <Input label="Authorised by" value={form.authorisedBy}
              hint="Who approved the spending. This is the field an auditor asks for."
              onChange={(e) => setForm((p) => ({ ...p, authorisedBy: e.target.value }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}
