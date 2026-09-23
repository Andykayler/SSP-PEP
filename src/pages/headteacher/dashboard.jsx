import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import {
  doc, getDoc, getDocs, collection, query, where, getCountFromServer,
} from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { Users, Calendar, Award, AlertTriangle, Bell, Home, FileText, UserCheck, ClipboardCheck, MessageSquare, CalendarDays, GraduationCap, Wallet, BedDouble, Package, UserPlus, BookOpen, HeartPulse, Bus, CalendarOff, ClipboardList, School, Hash, MapPin, LayoutGrid, UserCog, ShieldCheck } from "lucide-react";

import DashboardShell from "../../components/DashboardShell";
import TermCard from "../../components/TermCard";
import MessagesModule from "../../components/messaging/MessagesModule";
import StudentManagement from "./modules/student";
import ClassAndStreamModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";
import LessonPlansModule from "./modules/classplanning";
import ExamsModule from "./modules/ExamsModule";
import AtRiskModule from "./modules/AtRiskModule";
import TransportModule from "./modules/TransportModule";
import LeaveModule from "../../components/leave/LeaveModule";
import HealthModule from "../../components/health/HealthModule";
import ClassSessionsModule from "./modules/ClassSessionsModule";
import AttendanceOverview from "./modules/AttendanceModule";
import DisciplineOverview from "./modules/DisciplineModule";
import PerformanceAnalytics from "./modules/PerformanceModule";
import ReportsModule from "./modules/reports";
import StaffManagement from "./modules/StaffManagement";
import AnnouncementsModule from "./modules/announcement";
import CalendarModule from "./modules/CalendarModule";
import ExamReadiness from "./modules/ExamReadiness";
import Admissions from "./modules/Admissions";
import Boarding from "./modules/Boarding";
import Inventory from "./modules/Inventory";
import ArrearsModule from "../../components/fees/ArrearsModule";
import { subscribeSchoolSettings } from "../../services/academicTerm";
import { boards } from "../../services/schoolProfile";
import { fetchSchoolClasses, cleanAssignments } from "../../services/staffAssignments";
import useDashboardSkin from "../../hooks/useDashboardSkin";
import { plural } from "../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Banner, ModuleDirectory,
} from "../../components/overview/OverviewKit";
import "../admin/admin_dashboard.css"; // shared component styles
import "../../styles/paper-skin.css";
import { isDeactivated } from "../../services/staffAccountCore";

const quickActions = [
  { label: "Enrol a Student", hint: "Add to the school roll", icon: <UserPlus size={22} />, tab: "students", tone: "green" },
  { label: "Staff Management", hint: "Assign classes & subjects", icon: <UserCog size={22} />, tab: "staff", tone: "" },
  { label: "School Timetable", hint: "Build and check the week", icon: <Calendar size={22} />, tab: "timetable", tone: "gold" },
  { label: "Reports & Exports", hint: "Report cards and returns", icon: <FileText size={22} />, tab: "reports", tone: "teal" },
];

// The module directory on the overview, grouped the way a head teacher thinks
// about the school. Ids must match navItems; anything not listed here falls
// into "More".
const MODULE_GROUPS = [
  { title: "Teaching & learning", ids: ["classes", "timetable", "lessonplans", "classmonitor", "performance", "exams", "readiness", "reports"] },
  { title: "Students & welfare", ids: ["students", "attendance", "discipline", "atrisk", "health", "admissions", "boarding"] },
  { title: "Staff & operations", ids: ["staff", "leave", "transport", "inventory", "arrears"] },
  { title: "Communication", ids: ["messages", "announcements", "calendar"] },
];

const MODULE_HINTS = {
  students: "Enrol, transfer and look up learners",
  classes: "Forms, streams and class teachers",
  messages: "Conversations with parents",
  timetable: "The weekly timetable and clashes",
  lessonplans: "Review teachers' lesson plans",
  classmonitor: "Which lessons ran today",
  attendance: "Registers and absence trends",
  performance: "Marks, grades and rankings",
  discipline: "Cases waiting for your review",
  reports: "Report cards and exports",
  staff: "Staff list and class assignments",
  announcements: "Notices to staff and parents",
  calendar: "Terms, holidays and events",
  readiness: "MSCE / JCE exam preparation",
  exams: "Exam timetables and invigilation",
  atrisk: "Learners who need attention",
  leave: "Staff leave and lesson cover",
  health: "Sick bay visits and conditions",
  transport: "Routes and riders",
  arrears: "Fee balances and clearance",
  admissions: "Applications and intake",
  boarding: "Hostels and bed allocation",
  inventory: "Stock, books and equipment",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function HeadTeacherDashboard() {
  useDashboardSkin("paper");
  const [currentTab, setCurrentTab] = useState("overview");
  const [uid, setUid] = useState("");
  const [userData, setUserData] = useState(null);
  // Set when a notification deep-links into a specific conversation so the
  // Messages module can open it straight away.
  const [pendingConversationId, setPendingConversationId] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  // Boarding modules appear only when the school keeps students overnight,
  // which the administrator answers once during setup.
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  // Live numbers for the overview. `null` while loading.
  const [pulse, setPulse] = useState(null);
  const [pulseError, setPulseError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        window.location.href = "/";
        return;
      }
      setUid(fbUser.uid);
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (!userSnap.exists()) {
          setAuthError("User profile not found. Contact your system administrator.");
          setLoading(false);
          return;
        }
        const user = userSnap.data();
        if (user.role !== "head_teacher") {
          setAuthError("Access denied. This portal is for Head Teachers only.");
          setLoading(false);
          return;
        }
        setUserData(user);
        if (user.schoolCode) {
          const schoolSnap = await getDoc(doc(db, "schools", user.schoolCode));
          if (schoolSnap.exists()) setSchoolData(schoolSnap.data());
        }
      } catch (e) {
        console.error(e);
        setAuthError("Failed to load profile. Please refresh.");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const code = userData?.schoolCode;
    if (!code) return;
    return subscribeSchoolSettings(code, setSettings);
  }, [userData?.schoolCode]);

  // ── School pulse: roll, staff, today's registers, open discipline cases ────
  // Each part is fetched and caught on its own so one refused query can't
  // blank the numbers that did load.
  useEffect(() => {
    const code = userData?.schoolCode;
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      const failed = [];
      const safe = async (label, fn, fallback) => {
        try { return await fn(); } catch (err) {
          console.error(`overview: ${label}:`, err);
          failed.push(label);
          return fallback;
        }
      };

      const classes = await safe("classes", () => fetchSchoolClasses(code), []);
      const [students, staff, registers, discipline] = await Promise.all([
        safe("students", async () => (await getCountFromServer(
          query(collection(db, "students"), where("schoolCode", "==", code))
        )).data().count, null),
        safe("staff", async () => (await getDocs(query(
          collection(db, "users"),
          where("schoolCode", "==", code),
          where("role", "in", ["head_teacher", "class_teacher"])
        ))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !isDeactivated(m)), []),
        safe("attendance", async () => {
          const today = todayISO();
          const snaps = await Promise.all(
            classes.map((c) => getDoc(doc(db, "attendance", `${code}_${c.id}_${today}`)))
          );
          let taken = 0, present = 0, marked = 0;
          snaps.forEach((snap) => {
            if (!snap.exists()) return;
            taken += 1;
            Object.values(snap.data().records || {}).forEach((r) => {
              if (!r?.status) return;
              marked += 1;
              if (r.status === "Present" || r.status === "Late") present += 1;
            });
          });
          return { taken, present, marked };
        }, { taken: 0, present: 0, marked: 0 }),
        safe("discipline", async () => (await getCountFromServer(query(
          collection(db, "discipline_cases"),
          where("schoolCode", "==", code),
          where("status", "==", "Pending Review")
        ))).data().count, 0),
      ]);

      if (cancelled) return;
      // Coverage is judged against the register, so a teacher still carrying
      // a closed class doesn't make it look covered.
      const teachers = staff.filter((m) => m.role === "class_teacher");
      const covered = new Set(staff.flatMap((m) => cleanAssignments(m, classes).classes));
      setPulse({
        classes,
        students,
        teachers,
        heads: staff.length - teachers.length,
        registers,
        discipline,
        uncovered: classes.filter((c) => !covered.has(c.name)),
        idleTeachers: teachers.filter((t) => cleanAssignments(t, classes).classes.length === 0),
      });
      setPulseError(failed.length ? `Some numbers couldn't be loaded (${failed.join(", ")}).` : "");
    })();
    return () => { cancelled = true; };
  }, [userData?.schoolCode]);

  // Pressing Back after Sign Out can restore this dashboard straight from
  // the browser's back-forward cache (bfcache) — a frozen DOM snapshot from
  // before sign-out, painted instantly without re-running the auth check
  // above. `pageshow` with `event.persisted === true` detects a bfcache
  // restore; reloading re-runs onAuthStateChanged, which redirects a
  // signed-out user to "/" instead of leaving the stale page on screen.
  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  const displayName = userData?.name || "Head Teacher";
  const schoolName = schoolData?.name || userData?.schoolCode || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const schoolCode = userData?.schoolCode || "";

  // Identity handed to every collaborative module (threads, messages) so posts
  // are attributed and @mentions resolve to a real uid.
  const currentUser = { id: uid, name: displayName, role: "head_teacher" };

  const navItems = [
    { id: "overview", label: "School Overview", icon: <Home className="w-5 h-5" /> },
    // `viewer` carries the campus scope: a head attached to one campus sees
    // that campus's roll and no other. Read from their own users document, so
    // it cannot be widened from the client.
    { id: "students", label: "Student Management", icon: <Users className="w-5 h-5" />, component: <StudentManagement schoolCode={schoolCode} viewer={userData} senderName={displayName} /> },
    { id: "classes", label: "Classes & Streams", icon: <Users className="w-5 h-5" />, component: <ClassAndStreamModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "messages", label: "Parent Messages", icon: <MessageSquare className="w-5 h-5" />, component: <MessagesModule key={pendingConversationId || "inbox"} schoolCode={schoolCode} currentUser={currentUser} initialConversationId={pendingConversationId} /> },
    { id: "timetable", label: "Timetable", icon: <Calendar className="w-5 h-5" />, component: <TimetableModule schoolCode={schoolCode} /> },
    { id: "lessonplans", label: "Lesson Plans", icon: <BookOpen className="w-5 h-5" />, component: <LessonPlansModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "classmonitor", label: "Class Monitor", icon: <ClipboardCheck className="w-5 h-5" />, component: <ClassSessionsModule schoolCode={schoolCode} /> },
    { id: "attendance", label: "Attendance Overview", icon: <UserCheck className="w-5 h-5" />, component: <AttendanceOverview schoolCode={schoolCode} /> },
    { id: "performance", label: "Performance Analytics", icon: <Award className="w-5 h-5" />, component: <PerformanceAnalytics schoolCode={schoolCode} /> },
    { id: "discipline", label: "Discipline Management", icon: <AlertTriangle className="w-5 h-5" />, component: <DisciplineOverview schoolCode={schoolCode} /> },
    { id: "reports", label: "Reports & Exports", icon: <FileText className="w-5 h-5" />, component: <ReportsModule schoolCode={schoolCode} userId={uid} userName={displayName} /> },
    { id: "staff", label: "Staff Management", icon: <Users className="w-5 h-5" />, component: <StaffManagement schoolCode={schoolCode} schoolName={schoolName} /> },
    { id: "announcements", label: "Announcements", icon: <Bell className="w-5 h-5" />, component: <AnnouncementsModule schoolCode={schoolCode} userId={uid} userName={displayName} /> },
    { id: "calendar", label: "School Calendar", icon: <CalendarDays className="w-5 h-5" />, component: <CalendarModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "readiness", label: "Exam Readiness", icon: <GraduationCap className="w-5 h-5" />, component: <ExamReadiness schoolCode={schoolCode} /> },
    { id: "exams", label: "Exams", icon: <ClipboardList className="w-5 h-5" />, component: <ExamsModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "atrisk", label: "At-Risk Learners", icon: <HeartPulse className="w-5 h-5" />, component: <AtRiskModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "leave", label: "Leave & Cover", icon: <CalendarOff className="w-5 h-5" />, component: <LeaveModule schoolCode={schoolCode} currentUser={currentUser} mode="head" /> },
    { id: "health", label: "Health", icon: <HeartPulse className="w-5 h-5" />, component: <HealthModule schoolCode={schoolCode} currentUser={currentUser} mode="lead" /> },
    { id: "transport", label: "Transport", icon: <Bus className="w-5 h-5" />, component: <TransportModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "arrears", label: "Arrears & Clearance", icon: <Wallet className="w-5 h-5" />, component: <ArrearsModule schoolCode={schoolCode} currentUser={currentUser} canDecide /> },
    { id: "admissions", label: "Admissions", icon: <UserPlus className="w-5 h-5" />, component: <Admissions schoolCode={schoolCode} currentUser={currentUser} schoolBoards={boards(settings)} /> },
    ...(boards(settings)
      ? [{ id: "boarding", label: "Boarding", icon: <BedDouble className="w-5 h-5" />, component: <Boarding schoolCode={schoolCode} currentUser={currentUser} /> }]
      : []),
    { id: "inventory", label: "Inventory", icon: <Package className="w-5 h-5" />, component: <Inventory schoolCode={schoolCode} currentUser={currentUser} /> },
  ];

  const currentNavItem = navItems.find((item) => item.id === currentTab);

  const pulseLoading = pulse === null;
  const classCount = pulse?.classes.length || 0;
  const attendancePct = pulse?.registers.marked
    ? Math.round((pulse.registers.present / pulse.registers.marked) * 100)
    : null;

  const stats = useMemo(() => {
    if (!pulse) return [
      { label: "Students", icon: <GraduationCap size={17} /> },
      { label: "Teaching Staff", icon: <Users size={17} />, tone: "teal" },
      { label: "Today's Attendance", icon: <UserCheck size={17} />, tone: "green" },
      { label: "Classes Covered", icon: <LayoutGrid size={17} />, tone: "gold" },
    ];
    const coveredCount = classCount - pulse.uncovered.length;
    return [
      {
        label: "Students",
        value: pulse.students == null ? "—" : pulse.students.toLocaleString("en-GB"),
        sub: `Enrolled across ${plural(classCount, "class", "es")}`,
        icon: <GraduationCap size={17} />,
      },
      {
        label: "Teaching Staff",
        value: String(pulse.teachers.length),
        sub: `${plural(pulse.teachers.length, "class teacher")} · ${plural(pulse.heads, "head")}`,
        icon: <Users size={17} />,
        tone: "teal",
      },
      {
        label: "Today's Attendance",
        value: attendancePct !== null ? `${attendancePct}%` : "—",
        sub: `${pulse.registers.taken} of ${plural(classCount, "register")} taken`,
        icon: <UserCheck size={17} />,
        tone: "green",
        meter: attendancePct,
      },
      {
        label: "Classes Covered",
        value: `${coveredCount}/${classCount}`,
        sub: "Classes with a teacher assigned",
        icon: <LayoutGrid size={17} />,
        tone: "gold",
        meter: classCount ? Math.round((coveredCount / classCount) * 100) : null,
      },
    ];
  }, [pulse, classCount, attendancePct]);

  const todos = useMemo(() => {
    if (!pulse || classCount === 0) return [];
    const regsLeft = classCount - pulse.registers.taken;
    const unc = pulse.uncovered;
    const idle = pulse.idleTeachers;
    return [
      {
        key: "registers",
        tab: "attendance",
        done: regsLeft <= 0,
        text: regsLeft <= 0 ? "Every register taken" : `Registers outstanding · ${regsLeft} of ${classCount}`,
      },
      {
        key: "discipline",
        tab: "discipline",
        done: pulse.discipline === 0,
        urgent: pulse.discipline > 0,
        text: pulse.discipline === 0 ? "No discipline cases to review" : `Review ${plural(pulse.discipline, "discipline case")}`,
      },
      {
        key: "uncovered",
        tab: "staff",
        done: unc.length === 0,
        urgent: unc.length > 0,
        text: unc.length === 0
          ? "Every class has a teacher"
          : `Assign a teacher to ${unc.slice(0, 3).map((c) => c.name).join(", ")}${unc.length > 3 ? ` +${unc.length - 3}` : ""}`,
      },
      {
        key: "idle",
        tab: "staff",
        done: idle.length === 0,
        text: idle.length === 0 ? "Every teacher has classes" : `${plural(idle.length, "teacher")} without classes`,
      },
    ];
  }, [pulse, classCount]);


  const displayTitle = currentTab === "overview" ? "School Leadership Dashboard" : currentNavItem?.label;

  // Clicking a notification (bell or toast) opens the module it points at.
  const handleNotificationNavigate = (tab, notification) => {
    if (notification?.entityType === "conversation") {
      setPendingConversationId(notification.entityId);
      setCurrentTab("messages");
      return;
    }
    if (tab && navItems.some((item) => item.id === tab)) setCurrentTab(tab);
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading__spinner" />
        <p className="page-loading__text">Loading your dashboard…</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="page-loading">
        <div style={{ padding: "40px 32px", maxWidth: 420, textAlign: "center" }}>
          <div className="alert alert--error" style={{ marginBottom: 16 }}>{authError}</div>
          <button type="button" className="btn btn--accent btn--md" onClick={handleSignOut}>Back to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      navItems={navItems}
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      title={displayTitle}
      subtitle={`Head Teacher · ${schoolName}${schoolDistrict ? ` · ${schoolDistrict}` : ""}`}
      roleLabel="Head Teacher"
      tourRole="head"
      userName={displayName}
      schoolName={schoolName}
      schoolDistrict={schoolDistrict}
      schoolCode={schoolCode}
      portalLabel="Head Teacher Portal"
      navSectionLabel="School Leadership"
      footerVersion="Head Teacher Portal v1.2"
      notificationRecipientId={uid}
      onNotificationNavigate={handleNotificationNavigate}
      onSignOut={handleSignOut}
    >
      {currentTab === "overview" ? (
        <div className="tp">
          <OverviewHero
            name={displayName.split(" ")[0]}
            lead={
              pulseLoading ? (
                "Getting the school's day together…"
              ) : classCount === 0 ? (
                "No classes are set up yet. Open Classes & Streams to create your forms, then assign teachers in Staff Management."
              ) : (
                <>
                  {pulse.students != null && <><strong>{plural(pulse.students, "student")}</strong> across </>}
                  <strong>{plural(classCount, "class", "es")}</strong>, taught by{" "}
                  <strong>{plural(pulse.teachers.length, "teacher")}</strong>.{" "}
                  {pulse.registers.taken >= classCount
                    ? "Every register is in for today."
                    : <><strong>{plural(classCount - pulse.registers.taken, "register")}</strong> still to come in today.</>}
                </>
              )
            }
            chips={[
              { label: "Head Teacher", icon: <ShieldCheck size={14} aria-hidden="true" /> },
              { label: schoolName, icon: <School size={14} aria-hidden="true" /> },
              schoolDistrict && { label: schoolDistrict, icon: <MapPin size={14} aria-hidden="true" /> },
              schoolCode && { label: schoolCode, icon: <Hash size={13} aria-hidden="true" />, mono: true, title: "School code" },
            ]}
            aside={
              <TodoSheet
                title="Today at school"
                todos={todos}
                loading={pulseLoading}
                emptyText="Set up your classes to start the day's checklist."
                onOpen={setCurrentTab}
              />
            }
          />

          {pulseError && (
            <Banner tone="error" icon={<AlertTriangle size={17} aria-hidden="true" />}>{pulseError}</Banner>
          )}

          <section aria-labelledby="tp-glance">
            <SectionTitle id="tp-glance">At a glance</SectionTitle>
            <StatGrid stats={stats} loading={pulseLoading} />
          </section>

          <TermCard schoolCode={schoolCode} actorId={uid} />

          <section aria-labelledby="tp-quick">
            <SectionTitle id="tp-quick">Quick actions</SectionTitle>
            <QuickActions actions={quickActions} onOpen={setCurrentTab} />
          </section>

          <section aria-labelledby="tp-modules">
            <SectionTitle id="tp-modules">All modules</SectionTitle>
            <ModuleDirectory groups={MODULE_GROUPS} navItems={navItems} hints={MODULE_HINTS} onOpen={setCurrentTab} />
          </section>
        </div>
      ) : (
        currentNavItem?.component || (
          <div className="empty-state">
            <div className="empty-state__title">{currentNavItem?.label}</div>
            <p className="empty-state__sub">Module content loading…</p>
          </div>
        )
      )}
    </DashboardShell>
  );
}