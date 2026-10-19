// src/pages/director/modules/HomeworkMonitor.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Homework across the whole school, for someone who sets none of it.
//
// A teacher's homework screen is organised around setting work; the question a
// director asks is different — is work being set, by whom, and is it coming
// back? So this lists every task the school has issued, with who set it, when
// it is due and how many children have handed it in, and it has no controls.
//
// It reads `homework` for the whole school. The rule for that collection lets
// a director read and nothing else (see canOversee() in firestore.rules).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { BookOpen } from "lucide-react";
import { db } from "../../../firebase";
import {
  ModuleHeader, StatGrid, StatCard, TableWrap, EmptyState, LoadingState, FilterBar, Pill, Notice,
} from "../../../components/ui/ModuleKit";

const dayKey = (v) => String(v || "").slice(0, 10);
const todayKey = () => new Date().toISOString().slice(0, 10);

function fmt(day) {
  if (!day) return "—";
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function HomeworkMonitor({ schoolCode }) {
  const [rows, setRows] = useState(null);
  const [teachers, setTeachers] = useState({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [className, setClassName] = useState("all");

  useEffect(() => {
    if (!schoolCode) return undefined;
    let alive = true;
    (async () => {
      try {
        const [hw, users] = await Promise.all([
          getDocs(query(collection(db, "homework"), where("schoolCode", "==", schoolCode))),
          getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
        ]);
        if (!alive) return;
        setTeachers(Object.fromEntries(users.docs.map((d) => [d.id, d.data().name || d.data().email || "Staff"])));
        setRows(hw.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("[director] homework failed:", err);
        if (alive) { setError("Could not load homework."); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, [schoolCode]);

  const today = todayKey();
  const all = useMemo(() => rows || [], [rows]);

  const classes = useMemo(
    () => [...new Set(all.map((h) => h.className).filter(Boolean))].sort(),
    [all],
  );

  const visible = useMemo(() => {
    return all
      .filter((h) => className === "all" || h.className === className)
      .filter((h) => {
        const due = dayKey(h.dueDate);
        if (filter === "open") return due >= today;
        if (filter === "overdue") return due && due < today;
        return true;
      })
      .sort((a, b) => dayKey(b.dueDate).localeCompare(dayKey(a.dueDate)));
  }, [all, className, filter, today]);

  if (rows === null) return <LoadingState label="Loading homework…" />;

  const open = all.filter((h) => dayKey(h.dueDate) >= today).length;
  const overdue = all.length - open;
  const expected = all.reduce((n, h) => n + Number(h.totalStudents || 0), 0);
  const handedIn = all.reduce((n, h) => n + Number(h.submitted || 0), 0);
  const rate = expected > 0 ? Math.round((handedIn / expected) * 100) : null;
  const setters = new Set(all.map((h) => h.teacherId).filter(Boolean)).size;

  return (
    <div className="space-y-5">
      <ModuleHeader title="Homework" subtitle="Every task set across the school" />
      <Notice tone="danger">{error}</Notice>

      <StatGrid>
        <StatCard label="Tasks set" value={all.length.toLocaleString()} sub={`${setters} teacher${setters === 1 ? "" : "s"} setting work`} />
        <StatCard label="Still open" value={open.toLocaleString()} sub="Due today or later" />
        <StatCard label="Past due" value={overdue.toLocaleString()} tone={overdue > 0 ? "warning" : undefined} />
        <StatCard label="Handed in" value={rate === null ? "—" : `${rate}%`} sub={`${handedIn.toLocaleString()} of ${expected.toLocaleString()} expected`} />
      </StatGrid>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBar
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: all.length },
            { id: "open", label: "Open", count: open },
            { id: "overdue", label: "Past due", count: overdue },
          ]}
        />
        {classes.length > 1 && (
          <select
            className="field__select"
            style={{ width: "auto" }}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            aria-label="Filter by class"
          >
            <option value="all">All classes</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<BookOpen size={28} />} title="No homework" sub="Nothing matches this view." />
      ) : (
        <TableWrap>
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>Task</th>
                <th>Class</th>
                <th>Set by</th>
                <th>Due</th>
                <th>Handed in</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((h) => {
                const due = dayKey(h.dueDate);
                const total = Number(h.totalStudents || 0);
                const done = Number(h.submitted || 0);
                return (
                  <tr key={h.id}>
                    <td data-label="Task">
                      <div className="data-table__primary">{h.title || "Untitled"}</div>
                      <div className="data-table__meta">{h.subject || "—"}</div>
                    </td>
                    <td data-label="Class">{h.className || "—"}</td>
                    <td data-label="Set by">{teachers[h.teacherId] || "—"}</td>
                    <td data-label="Due">
                      {fmt(due)}{" "}
                      {due && due < today && <Pill tone="warning">Past due</Pill>}
                    </td>
                    <td data-label="Handed in">
                      {total > 0 ? `${done} / ${total}` : done}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
