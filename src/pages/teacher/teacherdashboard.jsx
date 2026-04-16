import { useState } from "react";
import {
  Users, BookOpen, Calendar, Award, TrendingUp, AlertTriangle,
  Bell, Settings, LogOut, Menu, X, Home, FileText
} from "lucide-react";

import Studentmodule from "./modules/student";           // Reuse where appropriate
import ClassModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";
import AttendanceModule from "./modules/AttendanceModule";
import DisciplineModule from "./modules/DisciplineModule";
import PerformanceModule from "./modules/PerformanceModule";
import HomeworkModule from "./modules/homework";

// ─── Design System (Consistent with Admin) ─────────────────────────────────
const colors = {
  navy: "#0F2044",
  gold: "#F4B400",
  ivory: "#F7F5F0",
  cream: "#FAFAF8",
};

const Icon = {
  Home: () => <Home className="w-5 h-5" />,
  MyClasses: () => <BookOpen className="w-5 h-5" />,
  Timetable: () => <Calendar className="w-5 h-5" />,
  TakeAttendance: () => <TrendingUp className="w-5 h-5" />,
  EnterMarks: () => <Award className="w-5 h-5" />,
  Discipline: () => <AlertTriangle className="w-5 h-5" />,
  MyStudents: () => <Users className="w-5 h-5" />,
  Notifications: () => <Bell className="w-5 h-5" />,
  Reports: () => <FileText className="w-5 h-5" />,
  Settings: () => <Settings className="w-5 h-5" />,
  Logout: () => <LogOut className="w-5 h-5" />,
};

// Sample Data for Teacher
const teacherStats = [
  { label: "My Students", value: "187", change: "+3", color: "text-emerald-600" },
  { label: "Classes Taught", value: "6", change: "", color: "text-blue-600" },
  { label: "Today’s Attendance", value: "92%", change: "-2%", color: "text-amber-600" },
  { label: "Pending Marks", value: "3", change: "Classes", color: "text-red-600" },
];

const quickActions = [
  { title: "Take Attendance", icon: <TrendingUp className="w-8 h-8" />, color: "bg-emerald-600", tab: "attendance" },
  { title: "Enter Marks", icon: <Award className="w-8 h-8" />, color: "bg-amber-600", tab: "marks" },
  { title: "Log Discipline", icon: <AlertTriangle className="w-8 h-8" />, color: "bg-red-600", tab: "discipline" },
  { title: "View Timetable", icon: <Calendar className="w-8 h-8" />, color: "bg-[#0F2044]", tab: "timetable" },
];

export default function TeacherDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: Icon.Home },
    { id: "myclasses", label: "My Classes", icon: Icon.MyClasses, component: <ClassModule /> },
    { id: "timetable", label: "Timetable", icon: Icon.Timetable, component: <TimetableModule /> },
    { id: "attendance", label: "Take Attendance", icon: Icon.TakeAttendance, component: <AttendanceModule /> },
    { id: "marks", label: "Enter Marks", icon: Icon.EnterMarks, component: <PerformanceModule /> },
    { id: "discipline", label: "Discipline Cases", icon: Icon.Discipline, component: <DisciplineModule /> },
    { id: "students", label: "My Students", icon: Icon.MyStudents, component: <Studentmodule /> },
    { id: "Homework", label: "Homework", icon: Icon.Reports, component: <HomeworkModule /> },
   
  ];

  const currentNavItem = navItems.find(item => item.id === currentTab);

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Sidebar */}
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
            <div className="text-[10px] text-[#0F2044]/50 -mt-1">Teacher Portal</div>
          </div>
        </div>

        <div className="p-4">
          <div className="px-3 py-2 text-xs font-bold tracking-widest uppercase text-[#0F2044]/50 mb-2">TEACHER WORKSPACE</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setSidebarOpen(false);
                  }}
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

        {/* Teacher Info & Logout */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl p-5 text-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#0F2044] text-white rounded-2xl flex items-center justify-center font-bold text-lg">MK</div>
              <div>
                <div className="font-semibold text-[#0F2044]">Mr. Martin Khumbata</div>
                <div className="text-[#0F2044]/50">Mathematics & Physics • Form 3 & 4</div>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="bg-white border-b border-[#0F2044]/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-[#0F2044] hover:bg-[#F7F5F0] rounded-xl"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
                {currentTab === "overview" ? "Teacher Dashboard" : currentNavItem?.label}
              </h1>
              <p className="text-sm text-[#0F2044]/50">Term 2 • 2026 Academic Year</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="p-2.5 hover:bg-[#F7F5F0] rounded-xl relative">
              <Icon.Notifications />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">7</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-[#0F2044]">Mr. Martin Khumbata</div>
                <div className="text-xs text-emerald-600">Mathematics Teacher</div>
              </div>
              <div className="w-9 h-9 bg-[#0F2044] text-white rounded-2xl flex items-center justify-center font-bold text-lg">
                MK
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 lg:p-8 overflow-auto bg-[#F7F5F0]">
          {currentTab === "overview" && (
            <>
              <div className="mb-10">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[#0F2044]/60">Good afternoon, Mr. Khumbata</p>
                    <h2 className="text-3xl font-bold text-[#0F2044] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                      My Teaching Workspace
                    </h2>
                  </div>
                  <div className="text-sm text-[#0F2044]/50">Last updated: Today at 14:05</div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                  {teacherStats.map((stat, i) => (
                    <div key={i} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 shadow-sm hover:shadow transition-all">
                      <div className="text-sm text-[#0F2044]/60 mb-1">{stat.label}</div>
                      <div className="text-4xl font-bold text-[#0F2044] tabular-nums tracking-tighter">{stat.value}</div>
                      <div className={`text-xs mt-2 ${stat.color}`}>{stat.change} this week</div>
                    </div>
                  ))}
                </div>

                {/* Quick Actions */}
                <div className="mb-10">
                  <h3 className="uppercase text-xs font-bold tracking-widest text-[#0F2044]/50 mb-4">Quick Actions</h3>
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

                {/* Recent Activity */}
                <div className="grid lg:grid-cols-5 gap-6">
                  <div className="lg:col-span-3 bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                    <h3 className="font-semibold text-lg mb-6">Today’s Schedule</h3>
                    <div className="space-y-4">
                      {[
                        { time: "08:00", subject: "Mathematics 3A", class: "Form 3A", status: "Completed" },
                        { time: "09:40", subject: "Physics 4B", class: "Form 4B", status: "In Progress" },
                        { time: "11:20", subject: "Mathematics 3B", class: "Form 3B", status: "Upcoming" },
                      ].map((lesson, i) => (
                        <div key={i} className="flex items-center gap-4 bg-[#F7F5F0] p-4 rounded-2xl">
                          <div className="font-mono text-sm w-14 text-[#0F2044]/60">{lesson.time}</div>
                          <div className="flex-1">
                            <div className="font-medium">{lesson.subject}</div>
                            <div className="text-xs text-[#0F2044]/60">{lesson.class}</div>
                          </div>
                          <div className={`text-xs px-3 py-1 rounded-full ${lesson.status === "Completed" ? "bg-emerald-100 text-emerald-700" : lesson.status === "In Progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                            {lesson.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                      <h3 className="font-semibold mb-5 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" /> Pending Actions
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="p-3 bg-amber-50 rounded-2xl">Enter marks for Form 3A Mid-term Test</div>
                        <div className="p-3 bg-red-50 rounded-2xl">Submit attendance for yesterday’s Physics 4B</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                      <h3 className="font-semibold mb-4">Recent Parent Messages</h3>
                      <p className="text-sm text-[#0F2044]/60">3 unread messages from parents regarding student performance.</p>
                    </div>
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
                    <div className="text-6xl mb-6 opacity-20">📋</div>
                    <h3 className="text-2xl font-bold text-[#0F2044] mb-2">
                      {currentNavItem?.label}
                    </h3>
                    <p className="text-[#0F2044]/50 max-w-md mx-auto">
                      This module is ready for full implementation including data tables, forms, and export functionality.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-[#0F2044]/8 bg-white py-4 px-8 text-xs text-[#0F2044]/40 flex justify-between items-center">
          <div>© 2026 SSP-PEP • Ministry of Education, Malawi</div>
          <div className="flex items-center gap-6">
            <span>Teacher Portal v1.2.4</span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Online
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}