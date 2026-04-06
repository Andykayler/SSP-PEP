import { useState } from "react";
import {
  Users, BookOpen, Calendar, Award, DollarSign, AlertTriangle,
  Bell, Settings, LogOut, Menu, X, Home, TrendingUp
} from "lucide-react"; // or use your own SVG icons
import Studentmodule from "./modules/student";
import ClassModule from "./modules/ClassModule";
import TimetableModule from "./modules/TimetableModule";
import AttendanceModule from "./modules/AttendanceModule";
import DisciplineModule from "./modules/DisciplineModule";
import PerformanceModule from "./modules/PerformanceModule";
// ─── Design System Tokens (matching registration page) ─────────────────────
const colors = {
  navy: "#0F2044",
  gold: "#F4B400",
  ivory: "#F7F5F0",
  cream: "#FAFAF8",
};

const Icon = {
  Home: () => <Home className="w-5 h-5" />,
  Students: () => <Users className="w-5 h-5" />,
  Classes: () => <BookOpen className="w-5 h-5" />,
  Timetable: () => <Calendar className="w-5 h-5" />,
  Performance: () => <Award className="w-5 h-5" />,
  Attendance: () => <TrendingUp className="w-5 h-5" />,
  Discipline: () => <AlertTriangle className="w-5 h-5" />,
  Fees: () => <DollarSign className="w-5 h-5" />,
  Notifications: () => <Bell className="w-5 h-5" />,
  Settings: () => <Settings className="w-5 h-5" />,
  Logout: () => <LogOut className="w-5 h-5" />,
};

// Sample Data
const stats = [
  { label: "Total Students", value: "1,248", change: "+12", color: "text-emerald-600" },
  { label: "Active Classes", value: "42", change: "0", color: "text-blue-600" },
  { label: "Attendance Today", value: "94.8%", change: "-1.2%", color: "text-amber-600" },
  { label: "Pending Fees", value: "MWK 2.84M", change: "↑", color: "text-red-600" },
];

const quickLinks = [
  { title: "Register New Student", icon: <Users />, color: "bg-[#0F2044]" },
  { title: "Take Attendance", icon: <TrendingUp />, color: "bg-emerald-600" },
  { title: "Upload Marks", icon: <Award />, color: "bg-amber-600" },
  { title: "Send Announcement", icon: <Bell />, color: "bg-[#F4B400] text-[#0F2044]" },
];

export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: Icon.Home },
    { id: "students",     label: "Students",          icon: Icon.Students,     component: <Studentmodule /> },
    { id: "classes", label: "Classes", icon: Icon.Classes, component: <ClassModule /> },
    { id: "timetable", label: "Timetable", icon: Icon.Timetable, component: <TimetableModule />  },
    { id: "academic", label: "Academic Performance", icon: Icon.Performance, component: <PerformanceModule />        },
    { id: "attendance", label: "Attendance", icon: Icon.Attendance, component: <AttendanceModule /> },
    { id: "discipline", label: "Discipline", icon: Icon.Discipline, component: <DisciplineModule /> },
    { id: "fees", label: "Fees & Payments", icon: Icon.Fees },
    { id: "notifications", label: "Notifications", icon: Icon.Notifications },
    { id: "settings", label: "Settings", icon: Icon.Settings },
  ];

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
          <div className="text-[10px] text-[#0F2044]/50 -mt-1">Admin Portal</div>
        </div>
      </div>

      <div className="p-4">
        <div className="px-3 py-2 text-xs font-bold tracking-widest uppercase text-[#0F2044]/50 mb-2">MAIN NAVIGATION</div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;   // using currentTab as you had
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

      {/* School Info & Logout */}
      <div className="absolute bottom-6 left-6 right-6">
        <div className="bg-[#F7F5F0] border border-[#0F2044]/10 rounded-2xl p-5 text-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#0F2044] text-white rounded-2xl flex items-center justify-center font-bold">KA</div>
            <div>
              <div className="font-semibold text-[#0F2044]">Kamuzu Academy</div>
              <div className="text-[#0F2044]/50">Lilongwe, Malawi</div>
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

    {/* Main Content Area */}
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
              {currentTab === "overview" ? "Dashboard" : navItems.find(i => i.id === currentTab)?.label}
            </h1>
            <p className="text-sm text-[#0F2044]/50">Term 2 • 2026 Academic Year</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative">
            <button className="p-2.5 hover:bg-[#F7F5F0] rounded-xl relative">
              <Icon.Notifications />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">3</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-[#0F2044]">Mr. Chifundo Banda</div>
              <div className="text-xs text-emerald-600">Principal • Admin</div>
            </div>
            <div className="w-9 h-9 bg-[#0F2044] text-white rounded-2xl flex items-center justify-center font-bold text-lg">
              CB
            </div>
          </div>
        </div>
      </header>

      {/* Dynamic Content */}
      <main className="flex-1 p-6 lg:p-8 overflow-auto bg-[#F7F5F0]">
        {currentTab === "overview" && (
          <>
            {/* Welcome + Stats */}
            <div className="mb-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <p className="text-[#0F2044]/60">Good afternoon, Mr. Banda</p>
                  <h2 className="text-3xl font-bold text-[#0F2044] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                    School Overview
                  </h2>
                </div>
                <div className="text-sm text-[#0F2044]/50">Last updated: Today at 13:42</div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                {stats.map((stat, i) => (
                  <div key={i} className="bg-white rounded-3xl p-6 border border-[#0F2044]/8 shadow-sm hover:shadow transition-all">
                    <div className="text-sm text-[#0F2044]/60 mb-1">{stat.label}</div>
                    <div className="text-4xl font-bold text-[#0F2044] tabular-nums tracking-tighter">{stat.value}</div>
                    <div className={`text-xs mt-2 ${stat.color}`}>{stat.change} from last week</div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="mb-10">
                <h3 className="uppercase text-xs font-bold tracking-widest text-[#0F2044]/50 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {quickLinks.map((link, i) => (
                    <button
                      key={i}
                      className={`${link.color} text-white hover:brightness-105 active:scale-[0.985] transition-all h-28 rounded-3xl flex flex-col items-center justify-center gap-2 shadow-lg`}
                    >
                      <div className="text-3xl opacity-90">{link.icon}</div>
                      <span className="font-semibold text-sm">{link.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Activity & Charts */}
              <div className="grid lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-lg">Academic Performance Overview</h3>
                    <span className="text-xs bg-[#F4B400]/10 text-[#F4B400] px-3 py-1 rounded-full">Term 2</span>
                  </div>
                  <div className="h-80 flex items-center justify-center border border-dashed border-[#0F2044]/10 rounded-2xl text-[#0F2044]/40">
                    [Interactive Performance Chart – Use Recharts or Chart.js here]
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                    <h3 className="font-semibold mb-5 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" /> Recent Discipline Cases
                    </h3>
                    <div className="space-y-4 text-sm">
                      {[
                        { student: "John Phiri (Form 3A)", offense: "Late to class", time: "2h ago" },
                        { student: "Mary Banda (Form 2B)", offense: "Phone found", time: "Yesterday" },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-start py-2 border-b border-[#0F2044]/5 last:border-0">
                          <div>
                            <div className="font-medium">{item.student}</div>
                            <div className="text-[#0F2044]/60 text-xs">{item.offense}</div>
                          </div>
                          <div className="text-xs text-[#0F2044]/40 whitespace-nowrap">{item.time}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-7 border border-[#0F2044]/8">
                    <h3 className="font-semibold mb-5">Upcoming Events</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex gap-4">
                        <div className="w-14 text-right">
                          <div className="text-xs text-[#F4B400] font-bold">28 MAR</div>
                          <div className="text-[10px] text-[#0F2044]/40">SAT</div>
                        </div>
                        <div>Inter-House Athletics Competition</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Render other modules dynamically */}
        {currentTab !== "overview" && (
          <div>
            {navItems.find(i => i.id === currentTab)?.component || (
              <div className="bg-white rounded-3xl p-12 text-center border border-[#0F2044]/8 min-h-[60vh] flex items-center justify-center">
                <div>
                  <div className="text-6xl mb-6 opacity-20">🚧</div>
                  <h3 className="text-2xl font-bold text-[#0F2044] mb-2">
                    {navItems.find(i => i.id === currentTab)?.label} Module
                  </h3>
                  <p className="text-[#0F2044]/50 max-w-md mx-auto">
                    This module is under development. It will include full CRUD operations, tables, filters, and exports as per the SRS.
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
          <span>Version 1.2.4</span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Online
          </span>
        </div>
      </footer>
    </div>
  </div>
);
}