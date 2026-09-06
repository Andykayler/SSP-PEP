// src/pages/headteacher/modules/Inventory.jsx
// School property, and who is holding it.
//
// Availability is worked out from the loans rather than stored on the item, so
// the count on screen cannot drift away from the issues that produced it. The
// number the module exists to produce is the value of what has not come back —
// that is the figure a board reacts to, and the one no exercise book has ever
// been able to give them.
import { useState, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  Package, Plus, Pencil, Trash2, RefreshCw, Search, ArrowUpRight, Undo2,
} from "lucide-react";
import {
  fetchItems, saveItem, deleteItem, fetchIssues, issueItem, returnItem,
  withAvailability, openIssues, overdueIssues, lossValue,
  ITEM_CATEGORIES, CONDITIONS, categoryLabel,
} from "../../../services/inventory";
import {
  Modal, Btn, IconBtn, Input, Textarea, Select, Pill, EmptyState, StatGrid,
  StatCard, ModuleHeader, Notice, LoadingState, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";
import { money } from "../../../components/ui/format";

const BLANK_ITEM = {
  name: "", category: "textbook", subject: "", quantity: "",
  unitValue: "", location: "", notes: "",
};

export default function Inventory({ schoolCode, currentUser }) {
  const [tab, setTab] = useState("items");
  const [items, setItems] = useState(null);
  const [issues, setIssues] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [itemForm, setItemForm] = useState(null);
  const [issueForm, setIssueForm] = useState(null);
  const [returnForm, setReturnForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [it, iss, snap] = await Promise.all([
        fetchItems(schoolCode),
        fetchIssues(schoolCode),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
      ]);
      setItems(it); setIssues(iss);
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("[inventory] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load inventory: " + err.message });
      setItems([]);
    }
  }, [schoolCode]);


  useLoader(load);

  const stocked = useMemo(() => withAvailability(items || [], issues), [items, issues]);
  const open = useMemo(() => openIssues(issues), [issues]);
  const late = useMemo(() => overdueIssues(issues), [issues]);
  const atRisk = useMemo(() => lossValue(items || [], issues), [items, issues]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stocked.filter((i) => !q
      || i.name?.toLowerCase().includes(q)
      || i.subject?.toLowerCase().includes(q));
  }, [stocked, search]);

  const visibleIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return open.filter((i) => !q
      || i.studentName?.toLowerCase().includes(q)
      || i.itemName?.toLowerCase().includes(q));
  }, [open, search]);

  const run = async (fn, successText) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    setNotice(res.ok ? { tone: "success", text: successText } : { tone: "danger", text: res.error });
    if (res.ok) load();
    return res.ok;
  };

  if (items === null) return <LoadingState label="Loading inventory…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Inventory"
        subtitle="Textbooks, equipment and what is out on loan"
        actions={[
          <IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />,
          <Btn key="a" variant="accent" icon={<Plus size={15} />}
            onClick={() => setItemForm({ ...BLANK_ITEM })}>Add Item</Btn>,
        ]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Items tracked" value={items.length}
          sub={`${stocked.reduce((s, i) => s + (i.quantity || 0), 0)} units held`} />
        <StatCard label="Out on loan" value={open.length} tone={open.length ? "warning" : "success"}
          sub="Open issues" />
        <StatCard label="Overdue" value={late.length} tone={late.length ? "danger" : "success"}
          sub="Past their return date" />
        <StatCard label="Value not returned" value={money(atRisk)}
          tone={atRisk > 0 ? "warning" : "success"} sub="At the recorded unit value" />
      </StatGrid>

      <div className="tab-bar">
        <button type="button" className={`tab ${tab === "items" ? "tab--active" : ""}`}
          onClick={() => setTab("items")}>Stock ({items.length})</button>
        <button type="button" className={`tab ${tab === "issues" ? "tab--active" : ""}`}
          onClick={() => setTab("issues")}>On loan ({open.length})</button>
      </div>

      <div className="search-wrapper">
        <Search size={15} className="search-icon" />
        <input className="search-input" placeholder="Search…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {tab === "items" ? (
        visibleItems.length === 0 ? (
          <EmptyState icon={<Package size={28} />}
            title={items.length === 0 ? "Nothing tracked yet" : "No matching items"}
            sub="Start with the textbook sets — that is where a school loses most."
            action={items.length === 0
              ? <Btn variant="accent" icon={<Plus size={15} />}
                onClick={() => setItemForm({ ...BLANK_ITEM })}>Add Item</Btn>
              : null} />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr><th>Item</th><th>Category</th><th>Held</th><th>Out</th><th>Available</th>
                  <th>Unit value</th><th style={{ textAlign: "right" }}>Actions</th></tr>
              </thead>
              <tbody>
                {visibleItems.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      {i.subject && <div className="text-muted" style={{ fontSize: 11 }}>{i.subject}</div>}
                    </td>
                    <td className="text-muted">{categoryLabel(i.category)}</td>
                    <td>{i.quantity}</td>
                    <td className="text-muted">{i.issued}</td>
                    <td>
                      <Pill tone={i.available === 0 ? "danger" : i.available < 5 ? "warning" : "success"}>
                        {i.available}
                      </Pill>
                    </td>
                    <td className="text-muted">{i.unitValue ? money(i.unitValue) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="flex gap-2 justify-end">
                        <Btn size="sm" variant="secondary" icon={<ArrowUpRight size={13} />}
                          disabled={i.available === 0}
                          onClick={() => setIssueForm({
                            item: i, studentId: "", quantity: 1, dueDate: "",
                          })}>
                          Issue
                        </Btn>
                        <IconBtn icon={<Pencil size={15} />} title="Edit"
                          onClick={() => setItemForm({ ...i })} />
                        <IconBtn icon={<Trash2 size={15} />} title="Remove" danger
                          onClick={() => {
                            if (i.issued > 0) {
                              setNotice({ tone: "warning", text: `${i.issued} still out on loan — take those back first.` });
                              return;
                            }
                            if (window.confirm(`Remove ${i.name}?`)) run(() => deleteItem(i.id), "Item removed.");
                          }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )
      ) : visibleIssues.length === 0 ? (
        <EmptyState icon={<Package size={28} />} title="Nothing is out on loan" />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr><th>Student</th><th>Class</th><th>Item</th><th>Out</th><th>Due</th>
                <th>Status</th><th style={{ textAlign: "right" }} /></tr>
            </thead>
            <tbody>
              {visibleIssues.map((i) => {
                const left = i.quantity - (i.returnedQuantity || 0);
                const isLate = i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={i.id}>
                    <td><strong>{i.studentName}</strong></td>
                    <td className="text-muted">{i.className}</td>
                    <td>{i.itemName}</td>
                    <td>
                      {left}
                      {i.returnedQuantity > 0 && (
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {i.returnedQuantity} of {i.quantity} back
                        </div>
                      )}
                    </td>
                    <td className="text-muted">{i.dueDate || "—"}</td>
                    <td><Pill tone={isLate ? "danger" : "warning"}>{isLate ? "Overdue" : "On loan"}</Pill></td>
                    <td style={{ textAlign: "right" }}>
                      <Btn size="sm" variant="success" icon={<Undo2 size={13} />}
                        onClick={() => setReturnForm({ issue: i, quantity: left, condition: "Good" })}>
                        Return
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {/* ── Forms ──────────────────────────────────────────────────────────── */}
      {itemForm && (
        <Modal title={itemForm.id ? "Edit item" : "Add an item"} onClose={() => setItemForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setItemForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                if (await run(() => saveItem({ schoolCode, item: itemForm, actor: currentUser }), "Item saved.")) {
                  setItemForm(null);
                }
              }}>Save</Btn>
            </>
          )}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" required value={itemForm.name}
                placeholder="Strategies for Biology, Form 3"
                onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} />
              <Select label="Category" value={itemForm.category}
                onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))}>
                {ITEM_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity held" required type="number" min="1" value={itemForm.quantity}
                onChange={(e) => setItemForm((p) => ({ ...p, quantity: e.target.value }))} />
              <Input label="Unit value (MK)" type="number" min="0" value={itemForm.unitValue}
                hint="Used to value what does not come back."
                onChange={(e) => setItemForm((p) => ({ ...p, unitValue: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Subject" value={itemForm.subject}
                onChange={(e) => setItemForm((p) => ({ ...p, subject: e.target.value }))} />
              <Input label="Kept in" value={itemForm.location} placeholder="Book store"
                onChange={(e) => setItemForm((p) => ({ ...p, location: e.target.value }))} />
            </div>
            <Textarea label="Notes" value={itemForm.notes}
              onChange={(e) => setItemForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </Modal>
      )}

      {issueForm && (
        <Modal title={`Issue ${issueForm.item.name}`}
          subtitle={`${issueForm.item.available} available`}
          onClose={() => setIssueForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setIssueForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                const student = students.find((s) => s.id === issueForm.studentId);
                if (await run(() => issueItem({
                  schoolCode, item: issueForm.item, student,
                  quantity: issueForm.quantity, dueDate: issueForm.dueDate,
                  available: issueForm.item.available, actor: currentUser,
                }), "Issued.")) setIssueForm(null);
              }}>Issue</Btn>
            </>
          )}>
          <div className="space-y-4">
            <Select label="Student" required value={issueForm.studentId}
              onChange={(e) => setIssueForm((p) => ({ ...p, studentId: e.target.value }))}>
              <option value="">Choose a student…</option>
              {students
                .slice()
                .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}{s.className ? ` — ${s.className}` : ""}
                  </option>
                ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="How many" required type="number" min="1" max={issueForm.item.available}
                value={issueForm.quantity}
                onChange={(e) => setIssueForm((p) => ({ ...p, quantity: e.target.value }))} />
              <Input label="Due back" type="date" value={issueForm.dueDate}
                hint="Usually the last day of the year."
                onChange={(e) => setIssueForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {returnForm && (
        <Modal title={`Return ${returnForm.issue.itemName}`}
          subtitle={`${returnForm.issue.studentName} · ${returnForm.issue.quantity - (returnForm.issue.returnedQuantity || 0)} outstanding`}
          onClose={() => setReturnForm(null)}
          footer={(
            <>
              <Btn variant="secondary" onClick={() => setReturnForm(null)}>Cancel</Btn>
              <Btn variant="accent" loading={busy} onClick={async () => {
                if (await run(() => returnItem({
                  issue: returnForm.issue, quantity: returnForm.quantity,
                  condition: returnForm.condition, actor: currentUser,
                }), "Return recorded.")) setReturnForm(null);
              }}>Record return</Btn>
            </>
          )}>
          <div className="space-y-4">
            <Input label="How many came back" required type="number" min="1"
              max={returnForm.issue.quantity}
              value={returnForm.quantity}
              hint="A partial return leaves the rest outstanding against the student."
              onChange={(e) => setReturnForm((p) => ({ ...p, quantity: e.target.value }))} />
            <Select label="Condition" value={returnForm.condition}
              onChange={(e) => setReturnForm((p) => ({ ...p, condition: e.target.value }))}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </Modal>
      )}
    </div>
  );
}
