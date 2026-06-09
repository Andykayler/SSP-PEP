import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { Users, Calendar, Award, AlertTriangle, Bell, Home, FileText, UserCheck } from "lucide-react";

import HeadTeacherSidebar from "./headteacher_sidebar";
import StudentManagement from "./modules/student";
import ClassAndStreamModule from "./modules/ClassModule";
import AttendanceOverview from "./modules/AttendanceModule";
import DisciplineOverview from "./modules/DisciplineModule";
import PerformanceAnalytics from "./modules/PerformanceModule";
import ReportsModule from "./modules/reports";
import StaffManagement from "./modules/StaffManagement";
import AnnouncementsModule from "./modules/announcement";
import "../admin/admin_dashboard.css"; // shared component styles

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const quickActions = [
  { label: "Enroll New Student", icon: <Users width={22} height={22} />, tab: "students", variant: "navy" },
  { label: "School Timetable", icon: <Calendar width={22} height={22} />, tab: "classes", variant: "gold" },
  { label: "View Reports", icon: <FileText width={22} height={22} />, tab: "reports", variant: "teal" },
  { label: "Staff Management", icon: <Users width={22} height={22} />, tab: "staff", variant: "purple" },
];

export default function HeadTeacherDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("overview");
  const [userData, setUserData] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        window.location.href = "/";
        return;
      }
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

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  const displayName = userData?.name || "Head Teacher";
  const schoolName = schoolData?.name || userData?.schoolCode || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const schoolCode = userData?.schoolCode || "";

  const navItems = [
    { id: "overview", label: "School Overview", icon: <Home className="w-5 h-5" /> },
    { id: "students", label: "Student Management", icon: <Users className="w-5 h-5" />, component: <StudentManagement schoolCode={schoolCode} /> },
    { id: "classes", label: "Classes & Streams", icon: <Users className="w-5 h-5" />, component: <ClassAndStreamModule schoolCode={schoolCode} /> },
    { id: "attendance", label: "Attendance Overview", icon: <UserCheck className="w-5 h-5" />, component: <AttendanceOverview schoolCode={schoolCode} /> },
    { id: "performance", label: "Performance Analytics", icon: <Award className="w-5 h-5" />, component: <PerformanceAnalytics schoolCode={schoolCode} /> },
    { id: "discipline", label: "Discipline Management", icon: <AlertTriangle className="w-5 h-5" />, component: <DisciplineOverview schoolCode={schoolCode} /> },
    { id: "reports", label: "Reports & Exports", icon: <FileText className="w-5 h-5" />, component: <ReportsModule schoolCode={schoolCode} /> },
    { id: "staff", label: "Staff Management", icon: <Users className="w-5 h-5" />, component: <StaffManagement schoolCode={schoolCode} schoolName={schoolName} /> },
    { id: "announcements", label: "Announcements", icon: <Bell className="w-5 h-5" />, component: <AnnouncementsModule schoolCode={schoolCode} /> },
  ];

  const currentNavItem = navItems.find((item) => item.id === currentTab);
  const displayTitle = currentTab === "overview" ? "School Leadership Dashboard" : currentNavItem?.label;

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
    <div className="dashboard-shell">
      <HeadTeacherSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          setSidebarOpen(false);
        }}
        navItems={navItems}
        navSectionLabel="School Leadership"
        portalLabel="Head Teacher Portal"
        roleName="Head Teacher"
        schoolName={schoolName}
        schoolDistrict={schoolDistrict}
        schoolCode={schoolCode}
        onSignOut={handleSignOut}
      />

      <div className="main-area">
        {/* Top bar – contains hamburger menu for mobile */}
        <header className="topbar">
          <div className="topbar__left">
            <button
              type="button"
              className="topbar__menu-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}>
                <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div>
              <div className="topbar__title">{displayTitle}</div>
              <div className="topbar__subtitle">Head Teacher · {schoolName}{schoolDistrict && ` · ${schoolDistrict}`}</div>
            </div>
          </div>

          <div className="topbar__right">
            <div className="topbar__status" aria-label="System status online">
              <span className="topbar__status-dot" />
              <span className="topbar__status-text">Online</span>
            </div>

            <div style={{ textAlign: "right" }}>
              <div className="topbar__user-name">{displayName}</div>
              <div className="topbar__user-role">Head Teacher</div>
            </div>
            <div className="topbar__avatar" aria-hidden="true">
              {displayName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "HT"}
            </div>
          </div>
        </header>

        {/* Main scrollable content */}
        <main className="page-content">
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
        </main>

        {/* Footer */}
        <footer className="dashboard-footer">
          <span>© 2026 SSP-PEP · Ministry of Education, Malawi</span>
          <span>Head Teacher Portal v1.1</span>
        </footer>
      </div>
    </div>
  );
}