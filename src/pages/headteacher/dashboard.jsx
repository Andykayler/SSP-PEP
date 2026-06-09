import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  Users, Calendar, Award, AlertTriangle,
  Bell, Settings, LogOut, Menu, X, Home, FileText, UserCheck
} from "lucide-react";

import StudentManagement from "./modules/student";
import ClassAndStreamModule from "./modules/ClassModule";
// import TimetableModule from "./modules/TimetableModule";
import AttendanceOverview from "./modules/AttendanceModule";
import DisciplineOverview from "./modules/DisciplineModule";
import PerformanceAnalytics from "./modules/PerformanceModule";
import ReportsModule from "./modules/reports";
import StaffManagement from "./modules/StaffManagement";
import AnnouncementsModule from "./modules/announcement";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  Home:          () => <Home className="w-5 h-5" />,
  SchoolOverview:() => <Users className="w-5 h-5" />,
  Students:      () => <Users className="w-5 h-5" />,
  // Timetable:     () => <Calendar className="w-5 h-5" />,
  Attendance:    () => <UserCheck className="w-5 h-5" />,
  Performance:   () => <Award className="w-5 h-5" />,
  Discipline:    () => <AlertTriangle className="w-5 h-5" />,
  Reports:       () => <FileText className="w-5 h-5" />,
  Staff:         () => <Users className="w-5 h-5" />,
  Announcements: () => <Bell className="w-5 h-5" />,
  Settings:      () => <Settings className="w-5 h-5" />,
  Logout:        () => <LogOut className="w-5 h-5" />,
};

// ─── Spinner ─────────────────────────────────────────────────────────────────
const Spinner = () => (
  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ─── Static school-wide stats ───────────────────────────────────────────────
// const headStats = [
//   { label: "Total Students",       value: "1,248", change: "+42",      color: "text-emerald-600" },
//   { label: "Overall Attendance",   value: "89%",   change: "-1%",      color: "text-amber-600"   },
//   { label: "Fee Collection Rate",  value: "76%",   change: "+5%",      color: "text-emerald-600" },
//   { label: "Discipline Cases",     value: "18",    change: "This week",color: "text-red-600"      },
//   { label: "Staff Present",        value: "48/52", change: "",         color: "text-blue-600"     },
// ];

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function HeadTeacherDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab,  setCurrentTab]  = useState("overview");

  // ── Auth / profile state ───────────────────────────────────────────────────
  const [authUser,   setAuthUser]   = useState(null);
  const [userData,   setUserData]   = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [authError,  setAuthError]  = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { 
        window.location.href = "/"; 
        return; 
      }
      
      setAuthUser(fbUser);
      
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (!userSnap.exists()) {
          setAuthError("User profile not found. Contact your system administrator.");
          setLoading(false);
          return;
        }

        const user = userSnap.data();

        // Guard: only head_teacher role may access this portal
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

  // ── Derived values ────────────────────────────────────────────────────────
  const displayName    = userData?.name    || authUser?.email || "Head Teacher";
  const schoolName     = schoolData?.name  || userData?.schoolCode || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const schoolCode     = userData?.schoolCode || "";
  const userInitials   = initials(displayName);
  const schoolInitials = initials(schoolName).slice(0, 2) || "SC";

  // ── Navigation Items with proper props ────────────────────────────────────
  const navItems = [
    { id: "overview",      label: "School Overview",       icon: Icon.Home },
    { 
      id: "students",      
      label: "Student Management",    
      icon: Icon.Students,
      component: <StudentManagement schoolCode={schoolCode} /> 
    },
    { 
      id: "classes",       
      label: "Classes & Streams",     
      icon: Icon.SchoolOverview,
      component: <ClassAndStreamModule schoolCode={schoolCode} /> 
    },
    // { 
    //   id: "timetable",     
    //   label: "School Timetable",      
    //   icon: Icon.Timetable,
    //   component: <TimetableModule schoolCode={schoolCode} /> 
    // },
    { 
      id: "attendance",    
      label: "Attendance Overview",   
      icon: Icon.Attendance,
      component: <AttendanceOverview schoolCode={schoolCode} /> 
    },
    { 
      id: "performance",   
      label: "Performance Analytics", 
      icon: Icon.Performance,
      component: <PerformanceAnalytics schoolCode={schoolCode} /> 
    },
    { 
      id: "discipline",    
      label: "Discipline Management", 
      icon: Icon.Discipline,
      component: <DisciplineOverview schoolCode={schoolCode} /> 
    },
    { 
      id: "reports",       
      label: "Reports & Exports",     
      icon: Icon.Reports,
      component: <ReportsModule schoolCode={schoolCode} /> 
    },
    { 
      id: "staff",         
      label: "Staff Management",      
      icon: Icon.Staff,
      component: <StaffManagement schoolCode={schoolCode} schoolName={schoolName} />   // ← FIXED
    },
    { 
      id: "announcements", 
      label: "Announcements",         
      icon: Icon.Announcements,
      component: <AnnouncementsModule schoolCode={schoolCode} /> 
    },
  ];

  const currentNavItem = navItems.find(item => item.id === currentTab);

  const quickActions = [
    { title: "Enroll New Student", icon: <Users className="w-8 h-8" />,    color: "bg-[#0F2044]",  tab: "students"      },
    { title: "School Timetable",   icon: <Calendar className="w-8 h-8" />, color: "bg-amber-600",  tab: "timetable"     },
    { title: "View Reports",       icon: <FileText className="w-8 h-8" />, color: "bg-emerald-600",tab: "reports"       },
    { title: "Staff Management",   icon: <Users className="w-8 h-8" />,    color: "bg-blue-600",   tab: "staff"         },
  ];

  // ── Loading & Error States ────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-[#0F2044]/20 border-t-[#0F2044] rounded-full animate-spin mx-auto" />
        <p className="text-sm text-[#0F2044]/60">Loading your dashboard…</p>
      </div>
    </div>
  );

  if (authError) return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-sm text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <p className="text-sm font-semibold text-gray-800">{authError}</p>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#0F2044] text-white hover:bg-[#0F2044]/90 transition-all"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F5F0] flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
                      lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50
                      w-72 bg-white border-r border-[#0F2044]/10 shadow-xl
                      transition-transform duration-300 flex flex-col`}>

        {/* Logo */}
        <div className="p-6 border-b border-[#0F2044]/8 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#F4B400] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#0F2044" />
              <path d="M2 13l10 5 10-5" stroke="#0F2044" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-xl text-[#0F2044] tracking-tight">SSP-PEP</div>
            <div className="text-[10px] text-[#0F2044]/50 -mt-1">Head Teacher Portal</div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-bold tracking-widest uppercase text-[#0F2044]/50 mb-2">School Leadership</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setCurrentTab(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all duration-200 group
                    ${isActive
                      ? "bg-[#0F2044] text-white shadow-md"
                      : "hover:bg-[#0F2044]/5 text-[#0F2044]/70 hover:text-[#0F2044]"
                    }`}
                >
                  <span className={isActive ? "text-white" : "text-[#0F2044]/60 group-hover:text-[#0F2044]"}>
                    <item.icon />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Profile card */}
        <div className="p-4 border-t border-[#0F2044]/8 flex-shrink-0">
          <div className="bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[#0F2044] text-white rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0">
                {userInitials || "HT"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0F2044] truncate">{displayName}</div>
                <div className="text-[10px] text-[#0F2044]/50 truncate">
                  Head Teacher{schoolDistrict ? ` · ${schoolDistrict}` : ""}
                </div>
                {schoolCode && <div className="text-[9px] font-mono text-[#0F2044]/30 tracking-wider">{schoolCode}</div>}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header className="bg-white border-b border-[#0F2044]/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 text-[#0F2044] hover:bg-[#F7F5F0] rounded-xl">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#0F2044]">
                {currentTab === "overview" ? "School Leadership Dashboard" : currentNavItem?.label}
              </h1>
              <p className="text-sm text-[#0F2044]/50">
                Head Teacher · {schoolName}{schoolDistrict ? ` · ${schoolDistrict}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#F7F5F0] rounded-xl border border-[#0F2044]/8">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-[#0F2044]/60 font-medium">Online</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-[#0F2044]">{displayName}</div>
                <div className="text-xs text-emerald-600">Head Teacher</div>
              </div>
              <div className="w-9 h-9 bg-[#0F2044] text-white rounded-xl flex items-center justify-center font-bold text-sm">
                {userInitials || "HT"}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8 overflow-auto bg-[#F7F5F0]">
          {currentTab === "overview" && (
            <div className="space-y-8">
              {/* Welcome banner */}
              <div className="bg-[#0F2044] rounded-3xl p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-white/50 text-sm mb-1">{greeting()}</p>
                  <h2 className="text-2xl font-bold text-white">{displayName.split(" ")[0]}</h2>
                  <p className="text-white/60 text-sm mt-1">{schoolName}</p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2">
                  <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F4B400] text-[#0F2044]">
                    Head Teacher
                  </span>
                  {schoolCode && <span className="text-white/40 text-xs font-mono">{schoolCode}</span>}
                </div>
              </div>

              {/* Stats and Quick Actions */}
              {/* <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">School Overview</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {headStats.map((stat, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-[#0F2044]/8 shadow-sm hover:shadow transition-all">
                      <div className="text-xs text-[#0F2044]/50 mb-1">{stat.label}</div>
                      <div className="text-3xl font-bold text-[#0F2044] tabular-nums tracking-tighter">{stat.value}</div>
                      <div className={`text-xs mt-1.5 ${stat.color}`}>{stat.change}</div>
                    </div>
                  ))}
                </div>
              </div> */}

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {quickActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentTab(action.tab)}
                      className={`${action.color} text-white hover:brightness-105 active:scale-[0.98] transition-all h-28 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-lg`}
                    >
                      <div className="opacity-90">{action.icon}</div>
                      <span className="font-semibold text-sm text-center leading-tight">{action.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pending items */}
              {/* <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-[#0F2044]/8">
                  <h3 className="font-semibold text-[#0F2044] mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" /> Pending Approvals
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="p-4 bg-amber-50 rounded-xl text-amber-800">Approve 12 new Form 1 enrollments</div>
                    <div className="p-4 bg-red-50 rounded-xl text-red-800">Review 5 serious discipline cases</div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-[#0F2044]/8">
                  <h3 className="font-semibold text-[#0F2044] mb-3">Key Metrics This Term</h3>
                  <p className="text-sm text-[#0F2044]/60">Overall performance trending upward.</p>
                </div>
              </div> */}
            </div>
          )}

          {/* Render selected module with props */}
          {currentTab !== "overview" && currentNavItem?.component}
        </main>

        {/* Footer */}
        <footer className="border-t border-[#0F2044]/8 bg-white py-3 px-8 text-xs text-[#0F2044]/30 flex justify-between items-center flex-shrink-0">
          <span>© 2026 SSP-PEP · Ministry of Education, Malawi · Head Teacher Portal v1.1</span>
          <span>Online</span>
        </footer>
      </div>
    </div>
  );
}