// src/pages/library/modules/LibraryModule.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The school library: catalogue, lending, returns and overdue books.
//
// Used by the librarian's own dashboard and by the head teacher and
// administrator, who can also set the fine per day. The number this module
// exists to produce is what is overdue and who has it, because that is the
// question a librarian is asked and the one a paper register answers slowest.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { BookOpen, Plus, Pencil, Trash2, Undo2, RefreshCw, BellRing, CalendarPlus, Search } from "lucide-react";
import {
  fetchBooks, fetchLoans, saveBook, deleteBook, issueBook, returnBook, renewLoan,
  withAvailability, overdueLoans, daysOverdue, fineFor, isOpen,
  BOOK_CATEGORIES, DEFAULT_LOAN_DAYS, dueFromToday,
} from "../../../services/library";
import { notifyLibraryOverdue } from "../../../services/notificationHooks";
import {
  Modal, Btn, IconBtn, Input, Select, Pill, EmptyState, StatGrid, StatCard,
  ModuleHeader, Notice, LoadingState, TableWrap, FilterBar,
} from "../../../components/ui/ModuleKit";
import { money } from "../../../components/ui/format";
import "../../headteacher/modules/staff-management.css";

const BLANK_BOOK = { title: "", author: "", isbn: "", category: "Textbook", subject: "", shelf: "", copies: "1" };

export default function LibraryModule({ schoolCode, currentUser, canConfigure = false }) {
  const [tab, setTab] = useState("catalogue");
  const [books, setBooks] = useState(null);
  const [loans, setLoans] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [finePerDay, setFinePerDay] = useState(0);
  const [search, setSearch] = useState("");
  const [bookForm, setBookForm] = useState(null);
  const [issueFor, setIssueFor] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!schoolCode) return;
    try {
      const [b, l, sSnap, uSnap, settings] = await Promise.all([
        fetchBooks(schoolCode),
        fetchLoans(schoolCode),
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
        getDoc(doc(db, "school_settings", schoolCode)),
      ]);
      setBooks(b);
      setLoans(l);
      setStudents(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== "withdrawn"));
      setStaff(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setFinePerDay(Number(settings.data()?.libraryFinePerDay) || 0);
    } catch (err) {
      console.error("[library] load failed:", err);
      setNotice({ tone: "danger", text: `Could not load the library: ${err.message}` });
      setBooks([]);
    }
  }, [schoolCode]);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() => withAvailability(books || [], loans), [books, loans]);
  const open = useMemo(() => loans.filter(isOpen), [loans]);
  const overdue = useMemo(() => overdueLoans(loans), [loans]);
  const q = search.trim().toLowerCase();

  const say = (tone, text) => setNotice({ tone, text });

  const act = async (fn, okText) => {
    setBusy(true);
    try { await fn(); if (okText) say("success", okText); await load(); }
    catch (err) { say("danger", err.message || "That didn't work."); }
    finally { setBusy(false); }
  };

  const remind = async (loan) => {
    const student = students.find((s) => s.id === loan.borrowerId);
    if (!student?.guardianPhone) return say("warning", `No guardian phone number for ${loan.borrowerName}.`);
    await act(
      () => notifyLibraryOverdue({
        schoolCode, student, title: loan.bookTitle, days: daysOverdue(loan), actor: currentUser,
      }),
      `Reminder sent to ${loan.borrowerName}'s guardian.`,
    );
  };

  const remindAll = async () => {
    const targets = overdue.filter((l) => l.borrowerType === "student");
    if (targets.length === 0) return say("warning", "No overdue books held by learners.");
    setBusy(true);
    let sent = 0;
    for (const loan of targets) {
      const student = students.find((s) => s.id === loan.borrowerId);
      if (student?.guardianPhone) {
        await notifyLibraryOverdue({ schoolCode, student, title: loan.bookTitle, days: daysOverdue(loan), actor: currentUser });
        sent += 1;
      }
    }
    setBusy(false);
    say("success", `Reminded ${sent} guardian${sent === 1 ? "" : "s"}.`);
  };

  const saveFine = async (value) => {
    setFinePerDay(value);
    try {
      await setDoc(doc(db, "school_settings", schoolCode), { libraryFinePerDay: value, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) { say("danger", err.message); }
  };

  if (books === null) return <LoadingState label="Opening the library…" />;

  const shownBooks = enriched.filter((b) => !q || [b.title, b.author, b.isbn, b.subject, b.shelf].some((v) => String(v || "").toLowerCase().includes(q)));
  const shownLoans = (tab === "overdue" ? overdue : open).filter((l) => !q || [l.bookTitle, l.borrowerName, l.className].some((v) => String(v || "").toLowerCase().includes(q)));

  return (
    <div>
      <ModuleHeader
        title="Library"
        subtitle="Catalogue, lending and overdue books"
        actions={
          <>
            <Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Btn>
            <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setBookForm({ ...BLANK_BOOK })}>Add book</Btn>
          </>
        }
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Titles" value={enriched.length} />
        <StatCard label="Copies" value={enriched.reduce((n, b) => n + (Number(b.copies) || 0), 0)} />
        <StatCard label="On loan" value={open.length} />
        <StatCard label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : undefined} />
      </StatGrid>

      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
        <FilterBar
          value={tab}
          onChange={setTab}
          options={[
            { id: "catalogue", label: "Catalogue", count: enriched.length },
            { id: "loans", label: "On loan", count: open.length },
            { id: "overdue", label: "Overdue", count: overdue.length },
          ]}
        />
        <div className="search-wrapper" style={{ maxWidth: 280 }}>
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search title, author, borrower…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canConfigure && (
          <label className="text-muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            Fine per overdue day (MK)
            <input
              className="search-input" type="number" min="0" style={{ width: 90 }}
              value={finePerDay}
              onChange={(e) => setFinePerDay(e.target.value)}
              onBlur={(e) => saveFine(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        )}
      </div>

      {tab === "catalogue" && (
        shownBooks.length === 0 ? (
          <EmptyState icon={<BookOpen size={28} />} title={enriched.length ? "No books match" : "The library is empty"}
            sub={enriched.length ? "Try a different search." : "Add your first book to start lending."}
            action={!enriched.length && <Btn variant="accent" icon={<Plus size={15} />} onClick={() => setBookForm({ ...BLANK_BOOK })}>Add book</Btn>} />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Title</th><th>Category</th><th>Shelf</th><th>Copies</th><th>Available</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {shownBooks.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.title}</strong><div className="text-muted" style={{ fontSize: 12 }}>{[b.author, b.isbn].filter(Boolean).join(" · ")}</div></td>
                    <td style={{ fontSize: 13 }}>{b.category}{b.subject ? ` · ${b.subject}` : ""}</td>
                    <td style={{ fontSize: 13 }}>{b.shelf || "—"}</td>
                    <td>{b.copies}</td>
                    <td><Pill tone={b.available === 0 ? "danger" : b.available <= 1 ? "warning" : "success"}>{b.available} of {b.copies}</Pill></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Btn size="sm" variant="accent" disabled={b.available < 1} onClick={() => setIssueFor(b)}>Lend</Btn>{" "}
                      <IconBtn icon={<Pencil size={15} />} title="Edit" onClick={() => setBookForm({ ...b, copies: String(b.copies) })} />
                      <IconBtn icon={<Trash2 size={15} />} title="Delete" danger
                        onClick={() => { if (b.out) return say("warning", "This book is on loan. Return it first."); if (window.confirm(`Delete "${b.title}"?`)) act(() => deleteBook(b.id), "Book deleted."); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )
      )}

      {tab !== "catalogue" && (
        <>
          {tab === "overdue" && overdue.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Btn variant="secondary" icon={<BellRing size={15} />} loading={busy} onClick={remindAll}>Remind all guardians on WhatsApp</Btn>
            </div>
          )}
          {shownLoans.length === 0 ? (
            <EmptyState icon={<BookOpen size={28} />} title={tab === "overdue" ? "Nothing overdue" : "Nothing on loan"} sub={tab === "overdue" ? "Every book is back on time." : "Lend a book from the catalogue."} />
          ) : (
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>Book</th><th>Borrower</th><th>Lent</th><th>Due</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                <tbody>
                  {shownLoans.map((l) => {
                    const late = daysOverdue(l);
                    const fine = fineFor(l, finePerDay);
                    return (
                      <tr key={l.id}>
                        <td><strong>{l.bookTitle}</strong></td>
                        <td>{l.borrowerName}<div className="text-muted" style={{ fontSize: 12 }}>{l.borrowerType === "staff" ? "Staff" : l.className}</div></td>
                        <td style={{ fontSize: 13 }}>{l.issuedOn}</td>
                        <td style={{ fontSize: 13 }}>{l.dueOn}</td>
                        <td>
                          {late > 0
                            ? <Pill tone="danger">{late} day{late === 1 ? "" : "s"} late{fine ? ` · ${money(fine)}` : ""}</Pill>
                            : <Pill tone="success">On loan</Pill>}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {late > 0 && l.borrowerType === "student" && (
                            <IconBtn icon={<BellRing size={15} />} title="Remind guardian on WhatsApp" onClick={() => remind(l)} />
                          )}
                          <IconBtn icon={<CalendarPlus size={15} />} title={`Renew ${DEFAULT_LOAN_DAYS} days`} onClick={() => act(() => renewLoan({ loan: l }), "Renewed.")} />
                          <Btn size="sm" variant="secondary" icon={<Undo2 size={14} />} disabled={busy}
                            onClick={() => act(async () => { const r = await returnBook({ loan: l, finePerDay, actor: currentUser }); if (r.fine) say("warning", `Returned. Fine due: ${money(r.fine)}.`); }, "Book returned.")}>
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
        </>
      )}

      {bookForm && (
        <BookDialog
          form={bookForm}
          onClose={() => setBookForm(null)}
          onSave={(data) => act(async () => { await saveBook({ schoolCode, id: bookForm.id, data, actor: currentUser }); setBookForm(null); }, bookForm.id ? "Book updated." : "Book added.")}
          busy={busy}
        />
      )}

      {issueFor && (
        <IssueDialog
          book={issueFor}
          students={students}
          staff={staff}
          onClose={() => setIssueFor(null)}
          busy={busy}
          onIssue={(borrower, dueOn) => act(async () => { await issueBook({ schoolCode, book: issueFor, borrower, dueOn, actor: currentUser }); setIssueFor(null); }, `Lent to ${borrower.name}.`)}
        />
      )}
    </div>
  );
}

function BookDialog({ form, onClose, onSave, busy }) {
  const [f, setF] = useState(form);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal
      title={form.id ? "Edit book" : "Add a book"}
      onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="accent" loading={busy} disabled={!f.title.trim()} onClick={() => onSave(f)}>Save</Btn></>}
    >
      <Input label="Title" required value={f.title} onChange={set("title")} autoFocus />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Author" value={f.author} onChange={set("author")} />
        <Input label="ISBN" value={f.isbn} onChange={set("isbn")} />
        <Select label="Category" value={f.category} onChange={set("category")}>
          {BOOK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input label="Subject" value={f.subject} onChange={set("subject")} placeholder="e.g. Biology" />
        <Input label="Shelf" value={f.shelf} onChange={set("shelf")} placeholder="e.g. B3" />
        <Input label="Copies" type="number" min="1" value={f.copies} onChange={set("copies")} />
      </div>
    </Modal>
  );
}

function IssueDialog({ book, students, staff, onClose, onIssue, busy }) {
  const [kind, setKind] = useState("student");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState(null);
  const [dueOn, setDueOn] = useState(dueFromToday());

  const t = term.trim().toLowerCase();
  const pool = kind === "student"
    ? students.map((s) => ({ type: "student", id: s.id, name: s.fullName || `${s.firstName || ""} ${s.lastName || ""}`.trim(), className: s.className || "", guardianPhone: s.guardianPhone || "" }))
    : staff.map((u) => ({ type: "staff", id: u.id, name: u.name || u.email || "Staff", className: "", guardianPhone: "" }));
  const matches = t ? pool.filter((p) => `${p.name} ${p.className}`.toLowerCase().includes(t)).slice(0, 8) : [];

  return (
    <Modal
      title={`Lend "${book.title}"`}
      subtitle={`${book.available} of ${book.copies} available`}
      onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="accent" loading={busy} disabled={!picked} onClick={() => onIssue(picked, dueOn)}>Lend</Btn></>}
    >
      <FilterBar value={kind} onChange={(k) => { setKind(k); setPicked(null); setTerm(""); }} options={[{ id: "student", label: "Learner" }, { id: "staff", label: "Staff" }]} />
      <div style={{ marginTop: 14 }}>
        <Input label="Find borrower" value={term} onChange={(e) => { setTerm(e.target.value); setPicked(null); }} placeholder="Type a name…" autoFocus />
      </div>
      {picked ? (
        <p style={{ margin: "0 0 12px", fontSize: 14 }}><strong>{picked.name}</strong>{picked.className ? ` · ${picked.className}` : ""}</p>
      ) : (
        matches.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {matches.map((m) => (
              <button key={m.id} type="button" className="btn btn--secondary btn--sm" style={{ justifyContent: "flex-start" }} onClick={() => setPicked(m)}>
                {m.name}{m.className ? ` · ${m.className}` : ""}
              </button>
            ))}
          </div>
        )
      )}
      <Input label="Due back" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
    </Modal>
  );
}
