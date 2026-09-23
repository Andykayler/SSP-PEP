// The librarian's landing page: what's out, what's late, and what's due back.
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, BookMarked, AlertTriangle, Library, CalendarClock, School, Clock,
} from "lucide-react";
import {
  fetchBooks, fetchLoans, withAvailability, isOpen, overdueLoans, daysOverdue, todayISO,
} from "../../../services/library";
import { plural } from "../../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Panel, EmptyNote, Banner, Skeleton,
} from "../../../components/overview/OverviewKit";

const quickActions = [
  { label: "Lend a Book", hint: "From the catalogue", icon: <BookOpen size={22} />, tab: "catalogue", tone: "green" },
  { label: "On Loan", hint: "Everything that's out", icon: <BookMarked size={22} />, tab: "loans", tone: "" },
  { label: "Overdue", hint: "Chase late returns", icon: <AlertTriangle size={22} />, tab: "overdue", tone: "red" },
  { label: "Add a Title", hint: "Grow the catalogue", icon: <Library size={22} />, tab: "catalogue", tone: "gold" },
];

export default function LibraryOverview({ displayName, schoolName, schoolCode, onOpen }) {
  const [books, setBooks] = useState(null);
  const [loans, setLoans] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!schoolCode) return undefined;
    let alive = true;
    Promise.all([fetchBooks(schoolCode), fetchLoans(schoolCode)])
      .then(([b, l]) => { if (alive) { setBooks(b); setLoans(l); } })
      .catch((err) => {
        console.error("[library] overview failed:", err);
        if (alive) { setError("The library couldn't be loaded. Please refresh."); setBooks([]); }
      });
    return () => { alive = false; };
  }, [schoolCode]);

  const loading = books === null;
  const today = todayISO();
  const enriched = useMemo(() => withAvailability(books || [], loans), [books, loans]);
  const out = useMemo(() => loans.filter(isOpen), [loans]);
  const late = useMemo(() => overdueLoans(loans, today), [loans, today]);
  const dueToday = useMemo(() => out.filter((l) => l.dueOn === today), [out, today]);
  const copies = enriched.reduce((n, b) => n + (Number(b.copies) || 0), 0);
  const noneLeft = enriched.filter((b) => (Number(b.copies) || 0) > 0 && b.available === 0);

  const stats = [
    { label: "Titles", value: String(enriched.length), sub: copies === 1 ? "1 copy in all" : `${copies} copies in all`, icon: <Library size={17} /> },
    {
      label: "On Loan", value: String(out.length),
      sub: copies ? `${Math.round((out.length / copies) * 100)}% of copies out` : "No copies yet",
      icon: <BookMarked size={17} />, tone: "teal",
      meter: copies ? Math.min(100, Math.round((out.length / copies) * 100)) : null,
    },
    { label: "Overdue", value: String(late.length), sub: late.length ? `Longest ${daysOverdue(late[0], today)} days late` : "Nothing late", icon: <AlertTriangle size={17} />, tone: "red" },
    { label: "Due Today", value: String(dueToday.length), sub: "Expected back today", icon: <CalendarClock size={17} />, tone: "gold" },
  ];

  const todos = loading ? [] : [
    {
      key: "late", tab: "overdue", done: late.length === 0, urgent: late.length > 0,
      text: late.length === 0 ? "Nothing overdue" : `Chase ${plural(late.length, "overdue book")}`,
    },
    {
      key: "today", tab: "loans", done: dueToday.length === 0,
      text: dueToday.length === 0 ? "Nothing due back today" : `${plural(dueToday.length, "book")} due back today`,
    },
    {
      key: "none", tab: "catalogue", done: noneLeft.length === 0,
      text: noneLeft.length === 0 ? "Every title has a copy on the shelf" : `${plural(noneLeft.length, "title")} with no copies left`,
    },
  ];

  return (
    <div className="tp">
      <OverviewHero
        name={displayName.split(" ")[0]}
        lead={
          loading ? "Checking the shelves…" : (
            <>
              <strong>{plural(enriched.length, "title")}</strong> in the catalogue and{" "}
              <strong>{plural(out.length, "book")}</strong> out on loan.{" "}
              {late.length ? <><strong>{plural(late.length, "book")}</strong> {late.length === 1 ? "is" : "are"} overdue.</> : "Nothing is overdue."}
            </>
          )
        }
        chips={[
          { label: "Librarian", icon: <BookOpen size={14} aria-hidden="true" /> },
          { label: schoolName, icon: <School size={14} aria-hidden="true" /> },
        ]}
        aside={<TodoSheet title="The desk today" todos={todos} loading={loading} emptyText="" onOpen={onOpen} />}
      />

      {error && <Banner tone="error" icon={<AlertTriangle size={17} aria-hidden="true" />}>{error}</Banner>}

      <section aria-labelledby="tp-glance">
        <SectionTitle id="tp-glance">At a glance</SectionTitle>
        <StatGrid stats={stats} loading={loading} />
      </section>

      <section aria-labelledby="tp-quick">
        <SectionTitle id="tp-quick">Quick actions</SectionTitle>
        <QuickActions actions={quickActions} onOpen={onOpen} />
      </section>

      <div className="tp-grid">
        <Panel id="tp-late" icon={<AlertTriangle size={18} aria-hidden="true" />} title="Most overdue" linkLabel="All overdue" onLink={() => onOpen("overdue")}>
          {loading ? <Skeleton /> : late.length === 0 ? (
            <EmptyNote icon={<BookMarked size={20} />} title="Nothing overdue">Every book is back on time.</EmptyNote>
          ) : (
            <ul className="tp-hw">
              {late.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <div className="tp-hw__row">
                    <span className="tp-hw__title">{l.bookTitle}</span>
                    <span className="tp-tag tp-tag--live">{daysOverdue(l, today)}d late</span>
                  </div>
                  <div className="tp-hw__meta">{l.borrowerName}{l.className ? ` · ${l.className}` : ""} · due {l.dueOn}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="tp-today" icon={<CalendarClock size={18} aria-hidden="true" />} title="Due back today" linkLabel="On loan" onLink={() => onOpen("loans")}>
          {loading ? <Skeleton lines={2} /> : dueToday.length === 0 ? (
            <EmptyNote icon={<Clock size={20} />} title="Nothing due today">Loans due back today will show here.</EmptyNote>
          ) : (
            <ul className="tp-hw">
              {dueToday.map((l) => (
                <li key={l.id}>
                  <div className="tp-hw__row"><span className="tp-hw__title">{l.bookTitle}</span></div>
                  <div className="tp-hw__meta">{l.borrowerName}{l.className ? ` · ${l.className}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
