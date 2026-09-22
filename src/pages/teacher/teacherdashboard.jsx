import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import {
  doc, getDoc, getDocs, collection, query, where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Users, BookOpen, Calendar, Award, TrendingUp, AlertTriangle,
  Home, FileText, CheckCircle, Clock, MessageSquare, MessagesSquare,
  CalendarOff, HeartPulse,
} from "lucide-react";

import DashboardShell from "../../components/DashboardShell";
import MessagesModule from "../../components/messaging/MessagesModule";
import { ClassActivityPage } from "../../components/activity/ClassActivityBoard";
import Studentmodule from "./modules/student";
import ClassModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";
import AttendanceModule from "./modules/AttendanceModule";
import DisciplineModule from "./modules/DisciplineModule";
import PerformanceModule from "./modules/PerformanceModule";
import HomeworkModule from "./modules/homework";
import LeaveModule from "../../components/leave/LeaveModule";
import HealthModule from "../../components/health/HealthModule";
import "../admin/admin_dashboard.css";

// Keep this in sync with the term shown in PerformanceModule's TERMS list
// and used to build the ca_marks document id (schoolCode_classId_term_userId).
const CURRENT_TERM = "Term 2 2026";

// Mirrors the period table used in ClassModule / lesson plan modules,
// just enough to render start/end times on the dashboard schedule.
const PERIODS = [
  { number: 1, start: "07:30", end: "08:20" },
  { number: 2, start: "08:30", end: "09:20" },
  { number: 3, start: "09:30", end: "10:20" },
  { number: 4, start: "10:30", end: "11:20" },
  { number: 5, start: "11:30", end: "12:20" },
  { number: 6, start: "13:00", end: "13:50" },
  { number: 7, start: "14:00", end: "14:50" },
  { number: 8, start: "15:00", end: "15:50" },
];
function periodTime(num) {
  const p = PERIODS.find((x) => x.number === Number(num));
  return p ? `${p.start}` : "—";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const quickActions = [
  { label: "Take Attendance", icon: <TrendingUp width={22} height={22} />, tab: "attendance", variant: "teal" },
  { label: "Enter Marks", icon: <Award width={22} height={22} />, tab: "marks", variant: "gold" },
  { label: "Log Discipline", icon: <AlertTriangle width={22} height={22} />, tab: "discipline", variant: "purple" },
  { label: "View Timetable", icon: <Calendar width={22} height={22} />, tab: "timetable", variant: "navy" },
];

export default function TeacherDashboard() {
  const [currentTab, setCurrentTab] = useState("overview");
  const [userId, setUserId] = useState(null);
  const [schoolCode, setSchoolCode] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Assigned classes (resolved to school_classes docs) ─────────────────────
  const [classes, setClasses] = useState([]);
  const [classesReady, setClassesReady] = useState(false);

  // ── Aggregated overview data pulled from the real modules' collections ─────
  const [overview, setOverview] = useState({
    totalStudents: 0,
    presentCount: 0,
    markedCount: 0,
    classesTaken: 0,
    pendingMarksClasses: [],
    disciplinePendingCount: 0,
    overdueHomeworkCount: 0,
    upcomingHomework: [],
    todayPlans: [],
  });
  const [overviewReady, setOverviewReady] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // Mirrors the head teacher dashboard's sign-out handling: force a
        // hard redirect so no stale userId/schoolCode/profile state lingers
        // in this component after auth.signOut() resolves.
        window.location.href = "/";
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserId(firebaseUser.uid);
          setSchoolCode(data.schoolCode);
          setProfile(data);
        }
      } catch (err) {
        console.error("Failed to load teacher profile:", err);
      } finally {
        setAuthLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── Resolve assignedClasses (names) → school_classes docs ───────────────────
  useEffect(() => {
    if (!schoolCode || !profile) return;
    let cancelled = false;

    (async () => {
      setClassesReady(false);
      try {
        const assignedNames = profile.assignedClasses || [];
        if (assignedNames.length === 0) {
          if (!cancelled) {
            setClasses([]);
            setClassesReady(true);
          }
          return;
        }
        const snap = await getDocs(
          query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode))
        );
        if (cancelled) return;
        const myClasses = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => assignedNames.includes(c.name));
        setClasses(myClasses);
        setClassesReady(true);
      } catch (err) {
        console.error("Failed to load class assignments:", err);
        if (!cancelled) setClassesReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [schoolCode, profile]);

  // ── Pull real numbers for the overview from students / attendance /
  //    ca_marks / discipline_cases / homework / lesson_plans ─────────────────
  useEffect(() => {
    if (!classesReady) return;
    if (!userId || !schoolCode || classes.length === 0) {
      setOverviewReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      setOverviewReady(false);
      setOverviewError("");
      const today = todayISO();
      const classIds = classes.map((c) => c.id);
      const termKey = CURRENT_TERM.replace(/\s+/g, "_");
      const failedSections = [];

      // Each section below is fetched and caught independently. That way a
      // permission error on one collection (e.g. a ca_marks doc that hasn't
      // been created yet) can't wipe out data we already successfully loaded
      // from another collection, such as the student counts.

      // 1. Students enrolled across all my classes
      let totalStudents = 0;
      try {
        const studentSnaps = await Promise.all(
          classIds.map((id) =>
            getDocs(query(
              collection(db, "students"),
              where("schoolCode", "==", schoolCode),
              where("classId", "==", id)
            ))
          )
        );
        totalStudents = studentSnaps.reduce((sum, s) => sum + s.size, 0);
      } catch (err) {
        console.error("overview: failed to load students:", err);
        failedSections.push("students");
      }

      // 2. Today's attendance per class
      let presentCount = 0, markedCount = 0, classesTaken = 0;
      try {
        const attendanceSnaps = await Promise.all(
          classIds.map((id) => getDoc(doc(db, "attendance", `${schoolCode}_${id}_${today}`)))
        );
        attendanceSnaps.forEach((snap) => {
          if (snap.exists()) {
            classesTaken += 1;
            const records = snap.data().records || {};
            Object.values(records).forEach((r) => {
              if (r?.status) {
                markedCount += 1;
                if (r.status === "Present" || r.status === "Late") presentCount += 1;
              }
            });
          }
        });
      } catch (err) {
        console.error("overview: failed to load attendance:", err);
        failedSections.push("attendance");
      }

      // 3. CA marks entered for the current term, per class
      // Note: getDoc() on a ca_marks doc that doesn't exist yet (no marks
      // saved for that class/term) requires the Firestore rule to explicitly
      // allow reads when resource == null — otherwise every class without
      // marks yet throws "Missing or insufficient permissions" here.
      let pendingMarksClasses = [];
      try {
        const marksSnaps = await Promise.all(
          classIds.map((id) =>
            getDoc(doc(db, "ca_marks", `${schoolCode}_${id}_${termKey}_${userId}`))
          )
        );
        pendingMarksClasses = classes.filter((c, i) => {
          const snap = marksSnaps[i];
          return !snap.exists() || Object.keys(snap.data()?.marks || {}).length === 0;
        });
      } catch (err) {
        console.error("overview: failed to load ca_marks:", err);
        failedSections.push("marks");
      }

      // 4. Discipline cases this teacher logged that are still pending review
      let disciplinePendingCount = 0;
      try {
        const discSnap = await getDocs(
          query(
            collection(db, "discipline_cases"),
            where("schoolCode", "==", schoolCode),
            where("reportedByUid", "==", userId),
            where("status", "==", "Pending Review")
          )
        );
        disciplinePendingCount = discSnap.size;
      } catch (err) {
        console.error("overview: failed to load discipline cases:", err);
        failedSections.push("discipline");
      }

      // 5. Homework — overdue with unfinished submissions + upcoming deadlines
      let overdueHomeworkCount = 0;
      let upcomingHomework = [];
      try {
        const hwSnap = await getDocs(
          query(
            collection(db, "homework"),
            where("teacherId", "==", userId),
            where("schoolCode", "==", schoolCode)
          )
        );
        const hwList = hwSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        overdueHomeworkCount = hwList.filter(
          (h) => h.dueDate < today && (h.submitted || 0) < (h.totalStudents || 0)
        ).length;
        upcomingHomework = hwList
          .filter((h) => h.dueDate >= today)
          .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
          .slice(0, 3);
      } catch (err) {
        console.error("overview: failed to load homework:", err);
        failedSections.push("homework");
      }

      // 6. Today's lesson plans, in period order
      let todayPlans = [];
      try {
        const lpSnap = await getDocs(
          query(
            collection(db, "lesson_plans"),
            where("teacherId", "==", userId),
            where("schoolCode", "==", schoolCode),
            where("date", "==", today)
          )
        );
        todayPlans = lpSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0));
      } catch (err) {
        console.error("overview: failed to load lesson plans:", err);
        failedSections.push("schedule");
      }

      if (cancelled) return;
      setOverview({
        totalStudents,
        presentCount,
        markedCount,
        classesTaken,
        pendingMarksClasses,
        disciplinePendingCount,
        overdueHomeworkCount,
        upcomingHomework,
        todayPlans,
      });
      if (failedSections.length > 0) {
        setOverviewError(`Some dashboard data couldn't be loaded (${failedSections.join(", ")}).`);
      }
      setOverviewReady(true);
    })();

    return () => { cancelled = true; };
  }, [classesReady, classes, userId, schoolCode]);

  const displayName = profile?.name || profile?.displayName || "Teacher";
  const displayRole = profile?.role === "head_teacher" ? "Head Teacher" : "Class Teacher";

  // Identity handed to the collaborative modules so posts are attributed and
  // @mentions resolve to a real uid.
  const currentUser = { id: userId, name: displayName, role: profile?.role || "class_teacher" };

  // Modules that raise notifications need the actor's name and role, not just
  // the uid, so the guardian sees who marked the register or logged the case.
  const moduleProps = {
    userId,
    schoolCode,
    userName: displayName,
    userRole: profile?.role || "class_teacher",
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: <Home className="w-5 h-5" /> },
    { id: "myclasses", label: "My Classes", icon: <BookOpen className="w-5 h-5" />, component: <ClassModule {...moduleProps} /> },
    { id: "timetable", label: "Timetable", icon: <Calendar className="w-5 h-5" />, component: <TimetableModule {...moduleProps} /> },
    { id: "attendance", label: "Take Attendance", icon: <TrendingUp className="w-5 h-5" />, component: <AttendanceModule {...moduleProps} /> },
    { id: "marks", label: "Enter Marks", icon: <Award className="w-5 h-5" />, component: <PerformanceModule {...moduleProps} /> },
    { id: "discipline", label: "Discipline Cases", icon: <AlertTriangle className="w-5 h-5" />, component: <DisciplineModule {...moduleProps} /> },
    { id: "students", label: "My Students", icon: <Users className="w-5 h-5" />, component: <Studentmodule {...moduleProps} /> },
    { id: "Homework", label: "Homework", icon: <FileText className="w-5 h-5" />, component: <HomeworkModule {...moduleProps} /> },
    { id: "classes", label: "Class Activity", icon: <MessagesSquare className="w-5 h-5" />, component: <ClassActivityPage schoolCode={schoolCode} currentUser={currentUser} restrictToAssigned /> },
    { id: "messages", label: "Parent Messages", icon: <MessageSquare className="w-5 h-5" />, component: <MessagesModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "leave", label: "Leave", icon: <CalendarOff className="w-5 h-5" />, component: <LeaveModule schoolCode={schoolCode} currentUser={currentUser} mode="teacher" /> },
    { id: "health", label: "Health", icon: <HeartPulse className="w-5 h-5" />, component: <HealthModule schoolCode={schoolCode} currentUser={currentUser} mode="staff" /> },
  ];

  const currentNavItem = navItems.find((item) => item.id === currentTab);

  // ── Derived, display-ready stat cards ───────────────────────────────────────
  const statsLoading = authLoading || !classesReady || !overviewReady;

  const attendancePct = overview.markedCount > 0
    ? Math.round((overview.presentCount / overview.markedCount) * 100)
    : null;

  const teacherStats = useMemo(() => ([
    {
      label: "My Students",
      value: statsLoading ? "…" : String(overview.totalStudents),
      change: statsLoading ? "" : `${classes.length} class${classes.length !== 1 ? "es" : ""}`,
      variant: "",
    },
    {
      label: "Classes Taught",
      value: statsLoading ? "…" : String(classes.length),
      change: "Active",
      variant: "teal",
    },
    {
      label: "Today's Attendance",
      value: statsLoading ? "…" : (attendancePct !== null ? `${attendancePct}%` : "—"),
      change: statsLoading ? "" : `${overview.classesTaken}/${classes.length} classes marked`,
      variant: "gold",
    },
    {
      label: "Pending Marks",
      value: statsLoading ? "…" : String(overview.pendingMarksClasses.length),
      change: "Classes",
      variant: "",
    },
  ]), [statsLoading, overview, classes.length, attendancePct]);

  // ── Pending-actions list built from real data ───────────────────────────────
  const pendingActions = useMemo(() => {
    if (statsLoading) return [];
    const actions = [];

    if (classes.length > 0 && overview.classesTaken < classes.length) {
      const remaining = classes.length - overview.classesTaken;
      actions.push({
        type: "warning",
        text: `Attendance not yet taken for ${remaining} of ${classes.length} class${classes.length !== 1 ? "es" : ""} today`,
      });
    }

    if (overview.pendingMarksClasses.length > 0) {
      const names = overview.pendingMarksClasses.map((c) => c.name).join(", ");
      actions.push({
        type: "warning",
        text: `Enter ${CURRENT_TERM} marks for ${names}`,
      });
    }

    if (overview.disciplinePendingCount > 0) {
      actions.push({
        type: "error",
        text: `${overview.disciplinePendingCount} discipline case${overview.disciplinePendingCount !== 1 ? "s" : ""} awaiting review`,
      });
    }

    if (overview.overdueHomeworkCount > 0) {
      actions.push({
        type: "error",
        text: `${overview.overdueHomeworkCount} homework assignment${overview.overdueHomeworkCount !== 1 ? "s" : ""} overdue with unsubmitted work`,
      });
    }

    return actions;
  }, [statsLoading, classes.length, overview]);

  if (authLoading) {
    return (
      <div className="page-loading">
        <div className="page-loading__spinner" />
        <p className="page-loading__text">Loading your workspace…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="page-loading">
        <div className="cc" style={{ padding: "40px 32px", maxWidth: 400, textAlign: "center" }}>
          <p className="module-title" style={{ fontSize: "1.2rem", marginBottom: 8 }}>Not signed in</p>
          <p className="module-sub">Please sign in to access your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      navItems={navItems}
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      title={currentTab === "overview" ? "Teacher Dashboard" : currentNavItem?.label}
      subtitle={`${displayRole} · ${CURRENT_TERM} Academic Year`}
      roleLabel={displayRole}
      tourRole="teacher"
      userName={displayName}
      schoolName={profile?.schoolName || ""}
      schoolCode={schoolCode || ""}
      portalLabel="Teacher Portal"
      navSectionLabel="Teacher Workspace"
      footerVersion="Teacher Portal v1.2.4"
      notificationRecipientId={userId || ""}
      onSignOut={async () => { await auth.signOut(); window.location.href = "/"; }}
    >
      {currentTab === "overview" ? (
        <div className="space-y-8">
          <div className="overview-hero">
            <div>
              <div className="overview-hero__greeting">{greeting()}</div>
              <h2 className="overview-hero__name">
                <span className="overview-hero__name-gradient">{displayName.split(" ")[0]}</span>
              </h2>
              <p className="overview-hero__school">My Teaching Workspace</p>
            </div>
            <div>
              <span className="overview-hero__plan overview-hero__plan--active">{displayRole}</span>
              {schoolCode && <div className="overview-hero__code">{schoolCode}</div>}
            </div>
          </div>

          {classes.length === 0 && classesReady && (
            <div className="alert alert--warning">
              No classes have been assigned to you yet. Ask your head teacher to assign classes from Staff Management.
            </div>
          )}

          {overviewError && (
            <div className="alert alert--error">{overviewError}</div>
          )}

          <div>
            <div className="sec-eyebrow">At a glance</div>
            <div className="stat-strip">
              {teacherStats.map((stat, i) => (
                <div key={i} className="stat-card">
                  <div className="stat-card__top">
                    <div className={`stat-card__icon${stat.variant ? ` stat-card__icon--${stat.variant}` : ""}`}>
                      <Award width={16} height={16} />
                    </div>
                    <span className="stat-card__label">{stat.label}</span>
                  </div>
                  <div className="stat-card__value">{stat.value}</div>
                  <div className="stat-card__sub">{stat.change}</div>
                  <div className="stat-card__bar">
                    <div className={`stat-card__bar-fill${stat.variant ? ` stat-card__bar-fill--${stat.variant}` : ""}`} style={{ width: `${60 + i * 8}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="sec-eyebrow">Quick actions</div>
            <div className="quick-actions-grid">
              {quickActions.map((action) => (
                <button
                  key={action.tab}
                  type="button"
                  className={`quick-action-btn quick-action-btn--${action.variant}`}
                  onClick={() => setCurrentTab(action.tab)}
                >
                  <span className="quick-action-btn__icon">{action.icon}</span>
                  <span className="quick-action-btn__label">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)" }}>
            <div className="cc">
              <div className="cc__head">
                <div className="cc__head-left">
                  <Calendar width={18} height={18} />
                  <h3>Today&apos;s Schedule</h3>
                </div>
              </div>
              <div className="cc__body">
                {statsLoading ? (
                  <div className="cc-row"><span className="module-sub">Loading schedule…</span></div>
                ) : overview.todayPlans.length === 0 ? (
                  <div className="cc-row">
                    <span className="module-sub">No lessons scheduled for today. Add one from Class Planning.</span>
                  </div>
                ) : (
                  overview.todayPlans.map((lesson) => {
                    const status = lesson.status === "completed" ? "Completed"
                      : lesson.status === "in-progress" ? "In Progress"
                      : "Upcoming";
                    return (
                      <div key={lesson.id} className="cc-row">
                        <div className="cc-row__rank" style={{ borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 10 }}>
                          {periodTime(lesson.periodNumber)}
                        </div>
                        <div className="cc-row__info">
                          <div className="cc-row__name">{lesson.subject} — {lesson.topic}</div>
                          <div className="cc-row__meta">{lesson.className}</div>
                        </div>
                        <div className="cc-row__right">
                          <span
                            className={`status-pill status-pill--${status === "Completed" ? "active" : "suspended"}`}
                            style={status === "Upcoming" ? { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" } : undefined}
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="cc">
                <div className="cc__head">
                  <div className="cc__head-left">
                    <AlertTriangle width={18} height={18} />
                    <h3>Pending Actions</h3>
                  </div>
                </div>
                <div className="cc__body" style={{ padding: "12px 20px" }}>
                  {statsLoading ? (
                    <p className="module-sub">Loading…</p>
                  ) : pendingActions.length === 0 ? (
                    <div className="alert alert--success" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle size={16} /> You&apos;re all caught up — no pending actions.
                    </div>
                  ) : (
                    pendingActions.map((a, i) => (
                      <div key={i} className={`alert alert--${a.type}`} style={{ marginBottom: i < pendingActions.length - 1 ? 8 : 0 }}>
                        {a.text}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="cc">
                <div className="cc__head"><h3>Upcoming Homework</h3></div>
                <div className="cc__body" style={{ padding: "16px 20px" }}>
                  {statsLoading ? (
                    <p className="module-sub">Loading…</p>
                  ) : overview.upcomingHomework.length === 0 ? (
                    <p className="module-sub">No upcoming homework deadlines.</p>
                  ) : (
                    <div className="space-y-3">
                      {overview.upcomingHomework.map((hw) => {
                        const rate = hw.totalStudents > 0
                          ? Math.round(((hw.submitted || 0) / hw.totalStudents) * 100)
                          : 0;
                        return (
                          <div key={hw.id} className="flex items-center justify-between gap-3" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <p className="module-title" style={{ fontSize: 13, marginBottom: 2 }}>{hw.title}</p>
                              <p className="module-sub" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                <Clock size={11} /> {hw.className} · Due {hw.dueDate}
                              </p>
                            </div>
                            <span className="status-pill status-pill--active" style={{ whiteSpace: "nowrap" }}>
                              {hw.submitted || 0}/{hw.totalStudents || 0} ({rate}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        currentNavItem?.component || (
          <div className="empty-state">
            <div className="empty-state__icon">📋</div>
            <div className="empty-state__title">{currentNavItem?.label}</div>
            <p className="empty-state__sub">This module is ready for full implementation.</p>
          </div>
        )
      )}
    </DashboardShell>
  );
}