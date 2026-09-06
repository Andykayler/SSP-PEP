import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { Users, Calendar, Award, AlertTriangle, Bell, Home, FileText, UserCheck, ClipboardCheck, MessageSquare, CalendarDays, GraduationCap, Wallet, BedDouble, Package, UserPlus } from "lucide-react";

import DashboardShell from "../../components/DashboardShell";
import TermCard from "../../components/TermCard";
import MessagesModule from "../../components/messaging/MessagesModule";
import StudentManagement from "./modules/student";
import ClassAndStreamModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";
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
import "../admin/admin_dashboard.css"; // shared component styles

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const quickActions = [
  { label: "Enroll New Student", icon: <Users width={22} height={22} />, tab: "students", variant: "navy" },
  { label: "School Timetable", icon: <Calendar width={22} height={22} />, tab: "timetable", variant: "gold" },
  { label: "View Reports", icon: <FileText width={22} height={22} />, tab: "reports", variant: "teal" },
  { label: "Staff Management", icon: <Users width={22} height={22} />, tab: "staff", variant: "purple" },
];

export default function HeadTeacherDashboard() {
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
    { id: "students", label: "Student Management", icon: <Users className="w-5 h-5" />, component: <StudentManagement schoolCode={schoolCode} /> },
    { id: "classes", label: "Classes & Streams", icon: <Users className="w-5 h-5" />, component: <ClassAndStreamModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "messages", label: "Parent Messages", icon: <MessageSquare className="w-5 h-5" />, component: <MessagesModule key={pendingConversationId || "inbox"} schoolCode={schoolCode} currentUser={currentUser} initialConversationId={pendingConversationId} /> },
    { id: "timetable", label: "Timetable", icon: <Calendar className="w-5 h-5" />, component: <TimetableModule schoolCode={schoolCode} /> },
    { id: "classmonitor", label: "Class Monitor", icon: <ClipboardCheck className="w-5 h-5" />, component: <ClassSessionsModule schoolCode={schoolCode} /> },
    { id: "attendance", label: "Attendance Overview", icon: <UserCheck className="w-5 h-5" />, component: <AttendanceOverview schoolCode={schoolCode} /> },
    { id: "performance", label: "Performance Analytics", icon: <Award className="w-5 h-5" />, component: <PerformanceAnalytics schoolCode={schoolCode} /> },
    { id: "discipline", label: "Discipline Management", icon: <AlertTriangle className="w-5 h-5" />, component: <DisciplineOverview schoolCode={schoolCode} /> },
    { id: "reports", label: "Reports & Exports", icon: <FileText className="w-5 h-5" />, component: <ReportsModule schoolCode={schoolCode} userId={uid} userName={displayName} /> },
    { id: "staff", label: "Staff Management", icon: <Users className="w-5 h-5" />, component: <StaffManagement schoolCode={schoolCode} schoolName={schoolName} /> },
    { id: "announcements", label: "Announcements", icon: <Bell className="w-5 h-5" />, component: <AnnouncementsModule schoolCode={schoolCode} userId={uid} userName={displayName} /> },
    { id: "calendar", label: "School Calendar", icon: <CalendarDays className="w-5 h-5" />, component: <CalendarModule schoolCode={schoolCode} currentUser={currentUser} /> },
    { id: "readiness", label: "Exam Readiness", icon: <GraduationCap className="w-5 h-5" />, component: <ExamReadiness schoolCode={schoolCode} /> },
    { id: "arrears", label: "Arrears & Clearance", icon: <Wallet className="w-5 h-5" />, component: <ArrearsModule schoolCode={schoolCode} currentUser={currentUser} canDecide /> },
    { id: "admissions", label: "Admissions", icon: <UserPlus className="w-5 h-5" />, component: <Admissions schoolCode={schoolCode} currentUser={currentUser} schoolBoards={boards(settings)} /> },
    ...(boards(settings)
      ? [{ id: "boarding", label: "Boarding", icon: <BedDouble className="w-5 h-5" />, component: <Boarding schoolCode={schoolCode} currentUser={currentUser} /> }]
      : []),
    { id: "inventory", label: "Inventory", icon: <Package className="w-5 h-5" />, component: <Inventory schoolCode={schoolCode} currentUser={currentUser} /> },
  ];

  const currentNavItem = navItems.find((item) => item.id === currentTab);
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
    <div className="space-y-8">
          <div className="overview-hero">
            <div>
              <div className="overview-hero__greeting">{greeting()}</div>
              <h2 className="overview-hero__name">
                <span className="overview-hero__name-gradient">{displayName.split(" ")[0]}</span>
              </h2>
              <p className="overview-hero__school">{schoolName}</p>
            </div>
            <div>
              <span className="overview-hero__plan overview-hero__plan--trial">Head Teacher</span>
              {schoolCode && <div className="overview-hero__code">{schoolCode}</div>}
            </div>
          </div>

          <TermCard schoolCode={schoolCode} actorId={uid} />

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

          <div>
            <div className="sec-eyebrow">Leadership modules</div>
            <div className="modules-grid">
              {navItems.filter((n) => n.id !== "overview").map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="module-card"
                  onClick={() => setCurrentTab(item.id)}
                >
                  <div className="module-card__icon">{item.icon}</div>
                  <div className="module-card__title">{item.label}</div>
                  <div className="module-card__desc">Open {item.label.toLowerCase()}</div>
                </button>
              ))}
            </div>
          </div>
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