// src/components/activity/ClassActivityBoard.jsx
// The channel rail (Staffroom + one channel per class/stream) beside the
// thread feed. Two entry points:
//   • ClassActivityBoard — presentational; the head teacher's Classes &
//     Streams module already holds the class/staff lists, so it passes them in
//     and keeps the selected channel in its own state.
//   • ClassActivityPage — loads its own data, for portals that do not.
import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Users, School, Loader2 } from "lucide-react";
import ActivityFeed from "./ActivityFeed";
import { fetchThreadCounts } from "../../services/activity";
import "./activity.css";
import { isDeactivated } from "../../services/staffAccountCore";

export const SCHOOL_SCOPE = "__school__";

export default function ClassActivityBoard({
  schoolCode,
  currentUser,
  classes = [],
  staff = [],
  scopeId,
  onScopeChange,
  threadCounts = {},
}) {
  const activeClass = classes.find((c) => c.id === scopeId) || null;

  // Who can be @-mentioned here, and who is pinged when a topic is posted:
  // for a class channel that is the staff assigned to it plus leadership; the
  // staffroom reaches everyone.
  const members = useMemo(() => {
    const roster = activeClass
      ? staff.filter((m) => m.role === "head_teacher" || m.assignedClasses?.includes(activeClass.name))
      : staff;
    // Always include the signed-in user so the composer can exclude them by id.
    if (currentUser?.id && !roster.some((m) => m.id === currentUser.id)) {
      return [...roster, { id: currentUser.id, name: currentUser.name, role: currentUser.role }];
    }
    return roster;
  }, [staff, activeClass, currentUser]);

  return (
    <div className="cls-activity">
      <aside className="cls-scopes">
        <div className="cls-scopes__label">Channels</div>
        <button
          type="button"
          className={`cls-scope ${scopeId === SCHOOL_SCOPE ? "cls-scope--on" : ""}`}
          onClick={() => onScopeChange(SCHOOL_SCOPE)}
        >
          <School size={14} />
          <span className="cls-scope__name">Staffroom</span>
          {threadCounts[SCHOOL_SCOPE]?.threads > 0 && (
            <span className="cls-scope__n">{threadCounts[SCHOOL_SCOPE].threads}</span>
          )}
        </button>

        <div className="cls-scopes__label">Classes &amp; streams</div>
        {classes.length === 0 && (
          <p className="cls-scopes__empty">No classes yet — the staffroom channel is still open.</p>
        )}
        {classes.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cls-scope ${scopeId === c.id ? "cls-scope--on" : ""}`}
            onClick={() => onScopeChange(c.id)}
          >
            <Users size={14} />
            <span className="cls-scope__name">{c.name}</span>
            {threadCounts[c.id]?.threads > 0 && (
              <span className="cls-scope__n">{threadCounts[c.id].threads}</span>
            )}
          </button>
        ))}
      </aside>

      <div className="cls-activity__main">
        {currentUser?.id ? (
          <ActivityFeed
            key={scopeId}
            schoolCode={schoolCode}
            scopeId={scopeId}
            scopeName={activeClass ? activeClass.name : "Staffroom"}
            scopeType={activeClass ? "class" : "school"}
            currentUser={currentUser}
            members={members}
          />
        ) : (
          <div className="act-state"><Loader2 size={16} className="act-spin" /> Signing you in…</div>
        )}
      </div>
    </div>
  );
}

/**
 * Self-loading board. `restrictToAssigned` limits the channel rail to the
 * classes this user actually teaches, which is what the teacher portal wants.
 */
export function ClassActivityPage({ schoolCode, currentUser, restrictToAssigned = false }) {
  const [classes, setClasses] = useState([]);
  const [staff, setStaff] = useState([]);
  const [threadCounts, setThreadCounts] = useState({});
  const [scopeId, setScopeId] = useState(SCHOOL_SCOPE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolCode) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [classSnap, staffSnap, counts] = await Promise.all([
          getDocs(query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))),
          getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
          fetchThreadCounts(schoolCode),
        ]);
        if (cancelled) return;

        const roster = staffSnap.docs
          .filter((d) => d.data().role && d.data().role !== "student" && !isDeactivated(d.data()))
          .map((d) => ({
            id: d.id,
            name: d.data().name || d.data().displayName || "Staff",
            role: d.data().role || "",
            assignedClasses: d.data().assignedClasses || [],
          }));

        const mine = roster.find((m) => m.id === currentUser?.id);
        const allClasses = classSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        setStaff(roster);
        setClasses(
          restrictToAssigned && mine?.assignedClasses?.length
            ? allClasses.filter((c) => mine.assignedClasses.includes(c.name))
            : allClasses,
        );
        setThreadCounts(counts);
      } catch (err) {
        console.error("[activity] board load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolCode, currentUser?.id, restrictToAssigned]);

  if (loading) {
    return <div className="act-state"><Loader2 size={18} className="act-spin" /> Loading activity…</div>;
  }

  return (
    <ClassActivityBoard
      schoolCode={schoolCode}
      currentUser={currentUser}
      classes={classes}
      staff={staff}
      scopeId={scopeId}
      onScopeChange={setScopeId}
      threadCounts={threadCounts}
    />
  );
}
