import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Users, BookOpen, Calendar, Award, TrendingUp, AlertTriangle, Home, FileText } from "lucide-react";

import DashboardShell from "../../components/DashboardShell";
import Studentmodule from "./modules/student";
import ClassModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";
import AttendanceModule from "./modules/AttendanceModule";
import DisciplineModule from "./modules/DisciplineModule";
import PerformanceModule from "./modules/PerformanceModule";
import HomeworkModule from "./modules/homework";
import "../admin/admin_dashboard.css";

const teacherStats = [
  { label: "My Students", value: "187", change: "+3", variant: "" },
  { label: "Classes Taught", value: "6", change: "Active", variant: "teal" },
  { label: "Today's Attendance", value: "92%", change: "-2%", variant: "gold" },
  { label: "Pending Marks", value: "3", change: "Classes", variant: "" },
];

const quickActions = [
  { label: "Take Attendance", icon: <TrendingUp width={22} height={22} />, tab: "attendance", variant: "teal" },
  { label: "Enter Marks", icon: <Award width={22} height={22} />, tab: "marks", variant: "gold" },
  { label: "Log Discipline", icon: <AlertTriangle width={22} height={22} />, tab: "discipline", variant: "purple" },
  { label: "View Timetable", icon: <Calendar width={22} height={22} />, tab: "timetable", variant: "navy" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function TeacherDashboard() {
  const [currentTab, setCurrentTab] = useState("overview");
  const [userId, setUserId] = useState(null);
  const [schoolCode, setSchoolCode] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setAuthLoading(false);
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

  const moduleProps = { userId, schoolCode };
  const displayName = profile?.name || profile?.displayName || "Teacher";
  const displayRole = profile?.role === "head_teacher" ? "Head Teacher" : "Class Teacher";

  const navItems = [
    { id: "overview", label: "Overview", icon: <Home className="w-5 h-5" /> },
    { id: "myclasses", label: "My Classes", icon: <BookOpen className="w-5 h-5" />, component: <ClassModule {...moduleProps} /> },
    { id: "timetable", label: "Timetable", icon: <Calendar className="w-5 h-5" />, component: <TimetableModule {...moduleProps} /> },
    { id: "attendance", label: "Take Attendance", icon: <TrendingUp className="w-5 h-5" />, component: <AttendanceModule {...moduleProps} /> },
    { id: "marks", label: "Enter Marks", icon: <Award className="w-5 h-5" />, component: <PerformanceModule {...moduleProps} /> },
    { id: "discipline", label: "Discipline Cases", icon: <AlertTriangle className="w-5 h-5" />, component: <DisciplineModule {...moduleProps} /> },
    { id: "students", label: "My Students", icon: <Users className="w-5 h-5" />, component: <Studentmodule {...moduleProps} /> },
    { id: "Homework", label: "Homework", icon: <FileText className="w-5 h-5" />, component: <HomeworkModule {...moduleProps} /> },
  ];

  const currentNavItem = navItems.find((item) => item.id === currentTab);

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
      subtitle={`${displayRole} · Term 2 · 2026 Academic Year`}
      roleLabel={displayRole}
      userName={displayName}
      schoolName={profile?.schoolName || ""}
      schoolCode={schoolCode || ""}
      portalLabel="Teacher Portal"
      navSectionLabel="Teacher Workspace"
      footerVersion="Teacher Portal v1.2.4"
      onSignOut={() => auth.signOut()}
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
                {[
                  { time: "08:00", subject: "Mathematics 3A", class: "Form 3A", status: "Completed" },
                  { time: "09:40", subject: "Physics 4B", class: "Form 4B", status: "In Progress" },
                  { time: "11:20", subject: "Mathematics 3B", class: "Form 3B", status: "Upcoming" },
                ].map((lesson, i) => (
                  <div key={i} className="cc-row">
                    <div className="cc-row__rank" style={{ borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 10 }}>{lesson.time}</div>
                    <div className="cc-row__info">
                      <div className="cc-row__name">{lesson.subject}</div>
                      <div className="cc-row__meta">{lesson.class}</div>
                    </div>
                    <div className="cc-row__right">
                      <span className={`status-pill status-pill--${lesson.status === "Completed" ? "active" : "suspended"}`} style={lesson.status === "Upcoming" ? { background: "var(--warning-pale)", color: "var(--warning-light)", border: "1px solid rgba(232,168,0,0.2)" } : undefined}>
                        {lesson.status}
                      </span>
                    </div>
                  </div>
                ))}
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
                  <div className="alert alert--warning" style={{ marginBottom: 8 }}>Enter marks for Form 3A Mid-term Test</div>
                  <div className="alert alert--error">Submit attendance for yesterday&apos;s Physics 4B</div>
                </div>
              </div>
              <div className="cc">
                <div className="cc__head"><h3>Recent Parent Messages</h3></div>
                <div className="cc__body" style={{ padding: "16px 20px" }}>
                  <p className="module-sub">3 unread messages from parents regarding student performance.</p>
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
