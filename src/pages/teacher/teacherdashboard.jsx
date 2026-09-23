import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import {
  doc, getDoc, getDocs, collection, query, where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Users, BookOpen, Calendar, Award, TrendingUp, AlertTriangle,
  Home, FileText, CheckCircle, Clock, MessageSquare, MessagesSquare,
  CalendarOff, HeartPulse, School, Hash, ClipboardCheck, ClipboardList,
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
import useDashboardSkin from "../../hooks/useDashboardSkin";
import { plural } from "../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Panel,
  EmptyNote, Banner, Skeleton,
} from "../../components/overview/OverviewKit";
import "../admin/admin_dashboard.css";
import "../../styles/paper-skin.css";

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

// Where a period sits relative to the clock: "past", "now" or "future".
function periodPhase(num, now = new Date()) {
  const p = PERIODS.find((x) => x.number === Number(num));
  if (!p) return "future";
  const hhmm = now.toTimeString().slice(0, 5);
  if (hhmm < p.start) return "future";
  if (hhmm > p.end) return "past";
  return "now";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const quickActions = [
  { label: "Take Attendance", hint: "Mark today's register", icon: <ClipboardCheck size={22} />, tab: "attendance", tone: "green" },
  { label: "Enter Marks", hint: "Continuous assessment", icon: <Award size={22} />, tab: "marks", tone: "gold" },
  { label: "Log Discipline", hint: "Record an incident", icon: <AlertTriangle size={22} />, tab: "discipline", tone: "red" },
  { label: "View Timetable", hint: "Your week at a glance", icon: <Calendar size={22} />, tab: "timetable", tone: "" },
];

export default function TeacherDashboard() {
  useDashboardSkin("paper");
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

  const marksDone = classes.length - overview.pendingMarksClasses.length;

  const teacherStats = useMemo(() => ([
    {
      label: "My Students",
      value: String(overview.totalStudents),
      sub: `Across ${plural(classes.length, "class", "es")}`,
      icon: <Users size={17} />,
      tone: "",
    },
    {
      label: "Classes Taught",
      value: String(classes.length),
      sub: classes.length ? classes.map((c) => c.name).join(", ") : "None assigned yet",
      icon: <BookOpen size={17} />,
      tone: "teal",
    },
    {
      label: "Today's Attendance",
      value: attendancePct !== null ? `${attendancePct}%` : "—",
      sub: `${overview.classesTaken} of ${plural(classes.length, "register")} taken`,
      icon: <CheckCircle size={17} />,
      tone: "green",
      meter: attendancePct,
    },
    {
      label: "Marks Entered",
      value: `${marksDone}/${classes.length}`,
      sub: `Classes with ${CURRENT_TERM} marks`,
      icon: <Award size={17} />,
      tone: "gold",
      meter: classes.length ? Math.round((marksDone / classes.length) * 100) : null,
    },
  ]), [overview, classes, attendancePct, marksDone]);

  // ── Today's list: each line opens the module that clears it ─────────────────
  const todos = useMemo(() => {
    if (statsLoading || classes.length === 0) return [];
    const regsLeft = classes.length - overview.classesTaken;
    const pendingMarks = overview.pendingMarksClasses;
    const disc = overview.disciplinePendingCount;
    const overdue = overview.overdueHomeworkCount;
    return [
      {
        key: "attendance",
        tab: "attendance",
        done: regsLeft <= 0,
        text: regsLeft <= 0
          ? "All registers taken"
          : `Take attendance · ${regsLeft} of ${plural(classes.length, "class", "es")} left`,
      },
      {
        key: "marks",
        tab: "marks",
        done: pendingMarks.length === 0,
        text: pendingMarks.length === 0
          ? `${CURRENT_TERM} marks entered`
          : `Enter marks for ${pendingMarks.map((c) => c.name).join(", ")}`,
      },
      {
        key: "discipline",
        tab: "discipline",
        done: disc === 0,
        urgent: disc > 0,
        text: disc === 0 ? "No discipline cases waiting" : `${plural(disc, "discipline case")} awaiting review`,
      },
      {
        key: "homework",
        tab: "Homework",
        done: overdue === 0,
        urgent: overdue > 0,
        text: overdue === 0 ? "No overdue homework" : `${plural(overdue, "homework task")} overdue with missing work`,
      },
    ];
  }, [statsLoading, classes, overview]);

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
        <div className="tp">
          <OverviewHero
            name={displayName.split(" ")[0]}
            lead={
              statsLoading ? (
                "Getting your day ready…"
              ) : classes.length === 0 ? (
                "Once your head teacher assigns your classes, your registers, marks and timetable will appear here."
              ) : (
                <>
                  You teach <strong>{plural(overview.totalStudents, "student")}</strong> across{" "}
                  <strong>{plural(classes.length, "class", "es")}</strong>.{" "}
                  {overview.todayPlans.length > 0 ? (
                    <>There {overview.todayPlans.length === 1 ? "is" : "are"} <strong>{plural(overview.todayPlans.length, "lesson")}</strong> on today&apos;s plan.</>
                  ) : (
                    "No lessons are planned for today yet."
                  )}
                </>
              )
            }
            chips={[
              { label: displayRole, icon: <Users size={14} aria-hidden="true" /> },
              profile?.schoolName && { label: profile.schoolName, icon: <School size={14} aria-hidden="true" /> },
              schoolCode && { label: schoolCode, icon: <Hash size={13} aria-hidden="true" />, mono: true, title: "School code" },
            ]}
            aside={
              <TodoSheet
                todos={todos}
                loading={statsLoading}
                emptyText="Nothing to do until classes are assigned."
                onOpen={setCurrentTab}
              />
            }
          />

          {classes.length === 0 && classesReady && (
            <Banner icon={<AlertTriangle size={17} aria-hidden="true" />}>
              No classes have been assigned to you yet. Ask your head teacher to assign classes from Staff Management.
            </Banner>
          )}

          {overviewError && (
            <Banner tone="error" icon={<AlertTriangle size={17} aria-hidden="true" />}>{overviewError}</Banner>
          )}

          <section aria-labelledby="tp-glance">
            <SectionTitle id="tp-glance">At a glance</SectionTitle>
            <StatGrid stats={teacherStats} loading={statsLoading} />
          </section>

          <section aria-labelledby="tp-quick">
            <SectionTitle id="tp-quick">Quick actions</SectionTitle>
            <QuickActions actions={quickActions} onOpen={setCurrentTab} />
          </section>

          <div className="tp-grid">
            <Panel
              id="tp-schedule"
              icon={<Calendar size={18} aria-hidden="true" />}
              title="Today's Schedule"
              linkLabel="Timetable"
              onLink={() => setCurrentTab("timetable")}
            >
              {statsLoading ? (
                <Skeleton />
              ) : overview.todayPlans.length === 0 ? (
                <EmptyNote
                  icon={<ClipboardList size={20} />}
                  title="No lessons planned for today"
                  actionLabel="Go to My Classes"
                  onAction={() => setCurrentTab("myclasses")}
                >
                  Plan a lesson from My Classes and it will show up here with its period and time.
                </EmptyNote>
              ) : (
                <ol className="tp-periods">
                  {overview.todayPlans.map((lesson) => {
                    const phase = periodPhase(lesson.periodNumber);
                    const status = lesson.status === "completed" ? "done"
                      : lesson.status === "in-progress" || phase === "now" ? "live"
                      : phase === "past" ? "past"
                      : "next";
                    const label = { done: "Done", live: "Now", past: "Earlier", next: "Upcoming" }[status];
                    return (
                      <li key={lesson.id} className={`tp-period${status === "live" ? " is-now" : ""}`}>
                        <span className="tp-period__num" aria-label={`Period ${lesson.periodNumber}`}>
                          {lesson.periodNumber ?? "–"}
                        </span>
                        <span className="tp-period__time">{periodTime(lesson.periodNumber)}</span>
                        <div className="tp-period__main">
                          <div className="tp-period__subject">{lesson.subject}{lesson.topic ? ` — ${lesson.topic}` : ""}</div>
                          <div className="tp-period__meta">{lesson.className}</div>
                        </div>
                        <span className={`tp-tag tp-tag--${status}`}>{label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <Panel
              id="tp-homework"
              icon={<FileText size={18} aria-hidden="true" />}
              title="Upcoming Homework"
              linkLabel="View all"
              onLink={() => setCurrentTab("Homework")}
            >
              {statsLoading ? (
                <Skeleton lines={2} />
              ) : overview.upcomingHomework.length === 0 ? (
                <EmptyNote
                  icon={<FileText size={20} />}
                  title="No deadlines coming up"
                  actionLabel="Set homework"
                  onAction={() => setCurrentTab("Homework")}
                >
                  Homework you set will appear here with how many students have handed it in.
                </EmptyNote>
              ) : (
                <ul className="tp-hw">
                  {overview.upcomingHomework.map((hw) => {
                    const total = hw.totalStudents || 0;
                    const handed = hw.submitted || 0;
                    const rate = total > 0 ? Math.round((handed / total) * 100) : 0;
                    const dueToday = hw.dueDate === todayISO();
                    return (
                      <li key={hw.id}>
                        <div className="tp-hw__row">
                          <span className="tp-hw__title">{hw.title}</span>
                          <span className="tp-hw__count">{handed}/{total} in</span>
                        </div>
                        <div className={`tp-hw__meta${dueToday ? " is-soon" : ""}`}>
                          <Clock size={12} aria-hidden="true" />
                          {hw.className} · {dueToday ? "Due today" : `Due ${hw.dueDate}`}
                        </div>
                        <div className="tp-meter" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label={`${hw.title} submissions`}>
                          <span style={{ width: `${rate}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
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