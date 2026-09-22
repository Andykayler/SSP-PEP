// modules/classplanning.jsx — "Lesson Plans"
// Every lesson plan the school's teachers have written (`lesson_plans`, created
// from the teacher dashboard), and the head teacher's review of them.
//
// A plan starts "awaiting review". The head teacher approves it, or asks for
// changes with a comment; the teacher is told on WhatsApp either way, and a
// plan saved again after "changes requested" goes back into the queue. The
// head teacher can change only the review fields — never the plan itself
// (see the lesson_plans rules).
//
// The second job is the one a head teacher cannot do by reading: noticing
// whose plans are MISSING. The timetable says who is teaching this week; a
// teacher with lessons and no plan is listed, with a reminder button.
import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Eye, BookOpen, RefreshCw, Search, BellRing, Check, MessageSquareWarning } from "lucide-react";
import { notifyLessonReviewed } from "../../../services/notificationHooks";
import { notifyUsers } from "../../../services/notifications";
import {
  Modal, Btn, Pill, Textarea, EmptyState, StatGrid, StatCard, ModuleHeader,
  Notice, LoadingState, FilterBar,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";

const PERIODS = [
  { number: 1, label: "P1", start: "07:30", end: "08:20" },
  { number: 2, label: "P2", start: "08:30", end: "09:20" },
  { number: 3, label: "P3", start: "09:30", end: "10:20" },
  { number: 4, label: "P4", start: "10:30", end: "11:20" },
  { number: 5, label: "P5", start: "11:30", end: "12:20" },
  { number: 6, label: "P6", start: "13:00", end: "13:50" },
  { number: 7, label: "P7", start: "14:00", end: "14:50" },
  { number: 8, label: "P8", start: "15:00", end: "15:50" },
];

const REVIEW = {
  pending: { label: "Awaiting review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes: { label: "Changes requested", tone: "danger" },
};
const reviewOf = (p) => p.reviewStatus || "pending";

const getPeriod = (n) => PERIODS.find((p) => p.number === Number(n)) || null;

function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Monday and Sunday of the week containing today, as yyyy-mm-dd. */
function thisWeek() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(monday), end: iso(sunday) };
}

function PlanCard({ plan, onOpen }) {
  const r = REVIEW[reviewOf(plan)];
  const period = getPeriod(plan.periodNumber);
  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="badge badge--blue">{plan.className}</span>
          <span className="badge badge--teal">{plan.subject}</span>
          <Pill tone={r.tone}>{r.label}</Pill>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Wk {plan.week || "—"} · {plan.term}</span>
      </div>
      <div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", color: "var(--text-primary)", lineHeight: 1.3, margin: 0 }}>{plan.topic}</h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
          By {plan.teacherName} · {fmt(plan.date)}{period ? ` · ${period.label} (${period.start}–${period.end})` : ""}
        </p>
        {plan.objectives && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {plan.objectives}
          </p>
        )}
      </div>
      <div>
        <Btn size="sm" variant={reviewOf(plan) === "pending" ? "accent" : "secondary"} icon={<Eye size={14} />} onClick={() => onOpen(plan)}>
          {reviewOf(plan) === "pending" ? "Review" : "View"}
        </Btn>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 6px", fontFamily: "var(--font-mono)" }}>{children}</p>;
}

function ReviewDialog({ plan, onClose, onDecide, busy }) {
  const [comment, setComment] = useState(plan.review || "");
  const period = getPeriod(plan.periodNumber);
  const r = REVIEW[reviewOf(plan)];
  return (
    <Modal
      title={plan.topic}
      subtitle={`${plan.className} · ${plan.subject} · ${plan.teacherName}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>Close</Btn>
          <Btn variant="danger" icon={<MessageSquareWarning size={15} />} disabled={busy || !comment.trim()} onClick={() => onDecide("changes", comment.trim())}>
            Request changes
          </Btn>
          <Btn variant="accent" icon={<Check size={15} />} loading={busy} onClick={() => onDecide("approved", comment.trim())}>
            Approve
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <Pill tone={r.tone}>{r.label}</Pill>
        {plan.reviewedByName && plan.reviewedAt && <span className="text-muted" style={{ fontSize: 12 }}>by {plan.reviewedByName}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 14, fontSize: 13 }}>
        <div><Label>Date</Label>{fmt(plan.date)}{period ? ` · ${period.label} (${period.start}–${period.end})` : ""}</div>
        <div><Label>Week / term</Label>Wk {plan.week || "—"} · {plan.term}</div>
      </div>

      <Label>Learning objectives</Label>
      <div style={{ background: "var(--surface)", padding: 14, borderRadius: "var(--radius-md)", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", border: "1px solid var(--border-color)", whiteSpace: "pre-wrap", marginBottom: 14 }}>
        {plan.objectives || "—"}
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 14, fontSize: 13 }}>
        <div><Label>Resources</Label>{plan.resources || "—"}</div>
        <div><Label>Assessment</Label>{plan.assessment || "—"}</div>
      </div>
      {plan.notes && <div style={{ marginBottom: 14, fontSize: 13 }}><Label>Notes</Label>{plan.notes}</div>}

      <Textarea
        label="Your feedback"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Required when asking for changes. Optional when approving."
        hint="The teacher receives this on WhatsApp and sees it on their plan."
      />
    </Modal>
  );
}

export default function ClassPlanningModule({ schoolCode, currentUser }) {
  const [plans, setPlans] = useState(null);
  const [timetable, setTimetable] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const [search, setSearch] = useState("");
  const [review, setReview] = useState("pending");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const load = useCallback(async () => {
    if (!schoolCode) return;
    setError("");
    try {
      // Plans are filtered by schoolCode only (the shape the security rules can
      // verify for a head teacher) and sorted client-side, which avoids a
      // composite index.
      const [planSnap, userSnap, ttSnap] = await Promise.all([
        getDocs(query(collection(db, "lesson_plans"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
        getDocs(query(collection(db, "timetable"), where("schoolCode", "==", schoolCode))),
      ]);
      const names = {};
      userSnap.docs.forEach((d) => {
        const u = d.data();
        names[d.id] = u.name || u.fullName || u.displayName || u.email || "Unknown teacher";
      });
      setPlans(
        planSnap.docs
          .map((d) => {
            const p = d.data();
            return { id: d.id, ...p, teacherName: p.teacherName || names[p.teacherId] || "Unknown teacher" };
          })
          .sort((a, b) => {
            const da = a.date || "";
            const db_ = b.date || "";
            if (db_ !== da) return db_.localeCompare(da);
            return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
          }),
      );
      setTimetable(ttSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("lesson plans load error:", err);
      setError(err.message || "Could not load lesson plans.");
      setPlans([]);
    }
  }, [schoolCode]);

  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => {
    const uniq = (arr) => [...new Set(arr)].filter(Boolean).sort();
    return { teachers: uniq((plans || []).map((p) => p.teacherName)), subjects: uniq((plans || []).map((p) => p.subject)) };
  }, [plans]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, changes: 0 };
    (plans || []).forEach((p) => { c[reviewOf(p)] += 1; });
    return c;
  }, [plans]);

  // Teachers with lessons on this week's timetable but no plan dated this week.
  const missing = useMemo(() => {
    if (!plans) return [];
    const { start, end } = thisWeek();
    const planned = new Set(plans.filter((p) => p.date >= start && p.date <= end).map((p) => p.teacherId));
    const lessons = new Map();
    timetable.forEach((s) => {
      if (!s.teacherId) return;
      const e = lessons.get(s.teacherId) || { id: s.teacherId, name: s.teacherName || "Teacher", lessons: 0 };
      e.lessons += 1;
      lessons.set(s.teacherId, e);
    });
    return [...lessons.values()].filter((t) => !planned.has(t.id)).sort((a, b) => b.lessons - a.lessons);
  }, [plans, timetable]);

  const filtered = (plans || []).filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && ![p.topic, p.className, p.subject, p.teacherName].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    if (review !== "all" && reviewOf(p) !== review) return false;
    if (teacherFilter !== "all" && p.teacherName !== teacherFilter) return false;
    if (subjectFilter !== "all" && p.subject !== subjectFilter) return false;
    return true;
  });

  const decide = async (status, comment) => {
    const plan = open;
    setBusy(true);
    try {
      await updateDoc(doc(db, "lesson_plans", plan.id), {
        reviewStatus: status,
        review: comment,
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser?.id || "",
        reviewedByName: currentUser?.name || "",
      });
      await notifyLessonReviewed({ schoolCode, plan, status, comment, actor: currentUser });
      setNotice({ tone: "success", text: status === "approved" ? "Plan approved. The teacher has been told." : "Changes requested. The teacher has been told." });
      setOpen(null);
      await load();
    } catch (err) {
      setNotice({ tone: "danger", text: err.message || "Could not save your review." });
    } finally {
      setBusy(false);
    }
  };

  const remind = async (targets) => {
    setBusy(true);
    try {
      await notifyUsers({
        userIds: targets.map((t) => t.id),
        schoolCode,
        title: "Please submit your lesson plans for this week",
        body: "You have lessons on the timetable this week but no lesson plan yet. Add them under My Classes.",
        category: "review",
        priority: "high",
        actorId: currentUser?.id,
        actorName: currentUser?.name,
        tab: "myclasses",
      });
      setNotice({ tone: "success", text: `Reminded ${targets.length} teacher${targets.length === 1 ? "" : "s"}.` });
    } catch (err) {
      setNotice({ tone: "danger", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (plans === null) return <LoadingState label="Loading lesson plans…" />;

  return (
    <div>
      <ModuleHeader
        title="Lesson Plans"
        subtitle="Review the plans your teachers have written"
        actions={<Btn variant="secondary" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Btn>}
      />

      {error && <Notice tone="danger">Could not load lesson plans: {error}</Notice>}
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <StatGrid>
        <StatCard label="Total plans" value={plans.length} />
        <StatCard label="Awaiting review" value={counts.pending} tone={counts.pending ? "warning" : undefined} />
        <StatCard label="Approved" value={counts.approved} tone="success" />
        <StatCard label="Changes requested" value={counts.changes} tone={counts.changes ? "danger" : undefined} />
      </StatGrid>

      {missing.length > 0 && (
        <div className="alert alert--warning" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: "1 1 260px" }}>
            <strong>No lesson plan yet this week: {missing.length} teacher{missing.length === 1 ? "" : "s"}</strong>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>
              {missing.slice(0, 6).map((t) => `${t.name} (${t.lessons} lesson${t.lessons === 1 ? "" : "s"})`).join(", ")}
              {missing.length > 6 ? ` and ${missing.length - 6} more` : ""}
            </div>
          </div>
          <Btn size="sm" variant="secondary" icon={<BellRing size={14} />} loading={busy} onClick={() => remind(missing)}>Remind on WhatsApp</Btn>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4" style={{ flexWrap: "wrap" }}>
        <FilterBar
          value={review}
          onChange={setReview}
          options={[
            { id: "pending", label: "Awaiting review", count: counts.pending },
            { id: "changes", label: "Changes requested", count: counts.changes },
            { id: "approved", label: "Approved", count: counts.approved },
            { id: "all", label: "All", count: plans.length },
          ]}
        />
        <div className="search-wrapper" style={{ maxWidth: 260 }}>
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search topic, teacher, class…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="search-input" style={{ maxWidth: 170 }} value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
          <option value="all">All teachers</option>
          {options.teachers.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="search-input" style={{ maxWidth: 160 }} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
          <option value="all">All subjects</option>
          {options.subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title={plans.length === 0 ? "No teacher has created a lesson plan yet" : review === "pending" ? "Nothing is waiting for review" : "No lesson plans match"}
          sub={plans.length === 0 ? "Plans appear here as soon as teachers write them." : "Try another filter."}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((p) => <PlanCard key={p.id} plan={p} onOpen={setOpen} />)}
        </div>
      )}

      {open && <ReviewDialog plan={open} onClose={() => setOpen(null)} onDecide={decide} busy={busy} />}
    </div>
  );
}
