import { useState } from "react";
import {
  Users, BookOpen, Calendar, Award, TrendingUp, AlertTriangle,
  Bell, Settings, LogOut, Menu, X, Home, FileText, DollarSign, UserCheck
} from "lucide-react";

import StudentManagement from "./modules/student";     // Full enrollment + records
import ClassAndStreamModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";         // School-wide
import AttendanceOverview from "./modules/AttendanceModule";
import DisciplineOverview from "./modules/DisciplineModule";
import PerformanceAnalytics from "./modules/PerformanceModule";
import ReportsModule from "./modules/reports";
import StaffManagement from "./modules/StaffManagement";
import AnnouncementsModule from "./modules/announcement";

// ─── Design System (Same as Teacher Portal) ─────────────────────────────────
const colors = {
  navy: "#0F2044",
  gold: "#F4B400",
  ivory: "#F7F5F0",
  cream: "#FAFAF8",
};

const Icon = {
  Home: () => <Home className="w-5 h-5" />,
  SchoolOverview: () => <Users className="w-5 h-5" />,
  Students: () => <Users className="w-5 h-5" />,
  Timetable: () => <Calendar className="w-5 h-5" />,
  Attendance: () => <UserCheck className="w-5 h-5" />,
  Performance: () => <Award className="w-5 h-5" />,
  Discipline: () => <AlertTriangle className="w-5 h-5" />,
  Reports: () => <FileText className="w-5 h-5" />,
  Staff: () => <Users className="w-5 h-5" />,
  Announcements: () => <Bell className="w-5 h-5" />,
  Settings: () => <Settings className="w-5 h-5" />,
  Logout: () => <LogOut className="w-5 h-5" />,
};

// Sample Data for Head Teacher (School-wide)
const headStats = [
  { label: "Total Students", value: "1,248", change: "+42", color: "text-emerald-600" },
  { label: "Overall Attendance", value: "89%", change: "-1%", color: "text-amber-600" },
  { label: "Fee Collection Rate", value: "76%", change: "+5%", color: "text-emerald-600" },
  { label: "Discipline Cases", value: "18", change: "This week", color: "text-red-600" },
  { label: "Staff Present", value: "48/52", change: "", color: "text-blue-600" },
];

const quickActions = [
  { title: "Enroll New Student", icon: <Users className="w-8 h-8" />, color: "bg-[#0F2044]", tab: "students" },
  { title: "School Timetable", icon: <Calendar className="w-8 h-8" />, color: "bg-amber-600", tab: "timetable" },
  { title: "View Reports", icon: <FileText className="w-8 h-8" />, color: "bg-emerald-600", tab: "reports" },
  { title: "Staff Management", icon: <Users className="w-8 h-8" />, color: "bg-blue-600", tab: "staff" },
];

export default function HeadTeacherDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("overview");

  const navItems = [
    { id: "overview", label: "School Overview", icon: Icon.Home },
    { id: "students", label: "Student Management", icon: Icon.Students, component: <StudentManagement /> },
    { id: "classes", label: "Classes & Streams", icon: Icon.SchoolOverview, component: <ClassAndStreamModule /> },
    { id: "timetable", label: "School Timetable", icon: Icon.Timetable, component: <TimetableModule /> },
    { id: "attendance", label: "Attendance Overview", icon: Icon.Attendance, component: <AttendanceOverview /> },
    { id: "performance", label: "Performance Analytics", icon: Icon.Performance, component: <PerformanceAnalytics /> },
    { id: "discipline", label: "Discipline Management", icon: Icon.Discipline, component: <DisciplineOverview /> },
    { id: "reports", label: "Reports & Exports", icon: Icon.Reports, component: <ReportsModule /> },
    { id: "staff", label: "Staff Management", icon: Icon.Staff, component: <StaffManagement /> },
    { id: "announcements", label: "Announcements", icon: Icon.Announcements, component: <AnnouncementsModule /> },
  ];

  const currentNavItem = navItems.find(item => item.id === currentTab);

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Sidebar - Same style as Teacher */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
                      lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 
                      w-72 bg-white border-r border-[#0F2044]/10 shadow-xl transition-transform duration-300 overflow-y-auto`}>

        <div className="p-6 border-b border-[#0F2044]/8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F4B400] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#0F2044" />
              <path d="M2 13l10 5 10-5" stroke="#0F2044" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-xl text-[#0F2044] tracking-tight">SSP-PEP</div>
            <div className="text-[10px] text-[#0F2044]/50 -mt-1">Head Teacher Portal • Super Admin</div>
          </div>
        </div>

        <div className="p-4">
          <div className="px-3 py-2 text-xs font-bold tracking-widest uppercase text-[#0F2044]/50 mb-2">SCHOOL LEADERSHIP</div>
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
                  <item.icon className={`w-5 h-5 transition-colors ${isActive ? "text-white" : "text-[#0F2044]/60 group-hover:text-[#0F2044]"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Head Teacher Info */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl p-5 text-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#0F2044] text-white rounded-2xl flex items-center justify-center font-bold text-lg">Dr. JM</div>
              <div>
                <div className="font-semibold text-[#0F2044]">Dr. Jane Mphande</div>
                <div className="text-[#0F2044]/50">Head Teacher • Lilongwe Secondary School</div>
              </div>
            </div>
            <button 
              onClick={() => alert("Logged out successfully")}
              className="w-full flex items-center justify-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              <Icon.Logout className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Same structure */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#0F2044]/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 text-[#0F2044] hover:bg-[#F7F5F0] rounded-xl">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
                {currentTab === "overview" ? "School Leadership Dashboard" : currentNavItem?.label}
              </h1>
              <p className="text-sm text-[#0F2044]/50">Term 2 • 2026 Academic Year • Lilongwe Secondary School</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="p-2.5 hover:bg-[#F7F5F0] rounded-xl relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">12</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-[#0F2044]">Dr. Jane Mphande</div>
                <div className="text-xs text-emerald-600">Head Teacher</div>
              </div>
              <div className="w-9 h-9 bg-[#0F2044] text-white rounded-2xl flex items-center justify-center font-bold text-lg">JM</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto bg-[#F7F5F0]">
          {currentTab === "overview" && (
            <>
              <div className="mb-10">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[#0F2044]/60">Good afternoon, Dr. Mphande</p>
                    <h2 className="text-3xl font-bold text-[#0F2044] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                      School Overview
                    </h2>
                  </div>
                  <div className="text-sm text-[#0F2044]/50">Last updated: Today at 14:58</div>
                </div>

                {/* School-wide Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-10">
                  {headStats.map((stat, i) => (
                    <div key={i} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 shadow-sm hover:shadow transition-all">
                      <div className="text-sm text-[#0F2044]/60 mb-1">{stat.label}</div>
                      <div className="text-4xl font-bold text-[#0F2044] tabular-nums tracking-tighter">{stat.value}</div>
                      <div className={`text-xs mt-2 ${stat.color}`}>{stat.change}</div>
                    </div>
                  ))}
                </div>

                {/* Quick Actions for Head */}
                <div className="mb-10">
                  <h3 className="uppercase text-xs font-bold tracking-widest text-[#0F2044]/50 mb-4">Quick Leadership Actions</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {quickActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentTab(action.tab)}
                        className={`${action.color} text-white hover:brightness-105 active:scale-[0.985] transition-all h-28 rounded-3xl flex flex-col items-center justify-center gap-3 shadow-lg`}
                      >
                        <div className="opacity-90">{action.icon}</div>
                        <span className="font-semibold text-sm text-center">{action.title}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent / Pending Sections (customize as needed) */}
                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                    <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" /> Pending Approvals
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="p-4 bg-amber-50 rounded-2xl">Approve 12 new Form 1 enrollments</div>
                      <div className="p-4 bg-red-50 rounded-2xl">Review 5 serious discipline cases</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                    <h3 className="font-semibold mb-5">Key School Metrics This Term</h3>
                    <p className="text-sm text-[#0F2044]/60">Overall performance trending upward • Focus on boarding attendance and Form 4 MSCE prep.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Dynamic Module Rendering */}
          {currentTab !== "overview" && (
            <div>
              {currentNavItem?.component || (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#0F2044]/8 min-h-[60vh] flex items-center justify-center">
                  <div>
                    <div className="text-6xl mb-6 opacity-20">📊</div>
                    <h3 className="text-2xl font-bold text-[#0F2044] mb-2">{currentNavItem?.label}</h3>
                    <p className="text-[#0F2044]/50">Full school-wide module with approval workflows, exports, and oversight tools.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="border-t border-[#0F2044]/8 bg-white py-4 px-8 text-xs text-[#0F2044]/40 flex justify-between items-center">
          <div>© 2026 SSP-PEP • Ministry of Education, Malawi • Head Teacher Portal v1.0</div>
          <div className="flex items-center gap-6">
            <span>Online</span>
          </div>
        </footer>
      </div>
    </div>
  );
}