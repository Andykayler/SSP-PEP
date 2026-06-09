import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import {
  doc, getDoc, collection, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, addDoc
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import FeeStructure from "./modules/Feestructure";
import StudentFees from "./modules/StudentFees";
import Payments from "./modules/Payments";
import Reports from "./modules/Reports";
import Receipts from "./modules/Receipts";
// Reuse shared icons and helpers from admin (or duplicate if needed)
const IC = {
  // ... (copy all icons from admin dashboard or import if possible)
  home:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>,
  billing:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  users:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
  students:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  bell:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>,
  audit:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>,
  logout:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>,
  menu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>,
  close:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  plus:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  // Add more as needed from admin
};

// Reuse helpers (initials, greeting, fmtDate, etc.)
function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Shared UI components (copy from admin or import)
const Badge = ({ role }) => { /* ... copy from admin */ };
const StatusPill = ({ active }) => { /* ... */ };
const Modal = ({ title, onClose, children, wide }) => { /* ... */ };
const Input = ({ label, required, error, ...props }) => { /* ... */ };
const Select = ({ label, required, error, children, ...props }) => { /* ... */ };
const Btn = ({ children, variant = "primary", size = "md", loading, ...props }) => { /* ... */ };
const Spinner = () => { /* ... */ };
const EmptyState = ({ icon, title, sub, action }) => { /* ... */ };

// Import modules


// Overview for Bursar
function BursarOverview({ userData, schoolData, schoolCode, setTab }) {
  const displayName = userData?.name || "Bursar";
  const schoolName = schoolData?.name || schoolCode;
  const quickActions = [
    { label: "Fee Structure", icon: IC.billing, tab: "fee-structure", color: "bg-amber-600" },
    { label: "Student Fees", icon: IC.students, tab: "student-fees", color: "bg-teal-600" },
    { label: "Record Payment", icon: IC.plus, tab: "payments", color: "bg-[#F4B400]" },
    { label: "Generate Receipt", icon: IC.billing, tab: "receipts", color: "bg-purple-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="bg-[#0F2044] rounded-3xl p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-white/50 text-sm mb-1">{greeting()}</p>
          <h2 className="text-2xl font-bold text-white">{displayName.split(" ")[0]}</h2>
          <p className="text-white/60 text-sm mt-1">{schoolName} • Finance Office</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2">
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-400 text-amber-900">Bursar</span>
          <span className="text-white/40 text-xs font-mono">{schoolCode}</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map(a => (
            <button key={a.tab} onClick={() => setTab(a.tab)} className={`${a.color} text-white rounded-2xl p-5 flex flex-col items-start gap-3 hover:brightness-105 active:scale-[0.98] transition-all text-left`}>
              <div className="opacity-90">{a.icon}</div>
              <span className="text-sm font-semibold leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#0F2044]/40 mb-3">Bursar Modules</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { tab: "fee-structure", icon: IC.billing, title: "Fee Structure", desc: "Define fees per class and term" },
            { tab: "student-fees", icon: IC.students, title: "Student Fees", desc: "View balances and assign fees" },
            { tab: "payments", icon: IC.billing, title: "Payments", desc: "Record and track all payments" },
            { tab: "receipts", icon: IC.billing, title: "Receipts", desc: "Generate printable official receipts" },
            { tab: "reports", icon: IC.audit, title: "Financial Reports", desc: "Summaries, exports & analytics" },
          ].map(m => (
            <button key={m.tab} onClick={() => setTab(m.tab)} className="bg-white rounded-2xl border border-[#0F2044]/8 p-5 text-left hover:border-[#0F2044]/20 hover:shadow-sm transition-all group">
              <div className="w-10 h-10 bg-[#0F2044]/5 rounded-xl flex items-center justify-center text-[#0F2044]/60 group-hover:bg-[#0F2044] group-hover:text-white transition-all mb-3">{m.icon}</div>
              <p className="font-semibold text-[#0F2044] text-sm mb-1">{m.title}</p>
              <p className="text-xs text-[#0F2044]/50 leading-relaxed">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main Bursar Dashboard
export default function BursarDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("overview");
  const [authUser, setAuthUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { window.location.href = "/"; return; }
      setAuthUser(fbUser);
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (!userSnap.exists()) { setAuthError("User profile not found."); setLoading(false); return; }
        const user = userSnap.data();
        if (user.role !== "bursar") { window.location.href = "/"; return; }
        setUserData(user);
        if (user.schoolCode) {
          const schoolSnap = await getDoc(doc(db, "schools", user.schoolCode));
          if (schoolSnap.exists()) setSchoolData(schoolSnap.data());
        }
      } catch (e) { setAuthError("Failed to load profile."); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  const displayName = userData?.name || "Bursar";
  const schoolName = schoolData?.name || "Your School";
  const schoolCode = userData?.schoolCode || "";
  const userInitials = initials(displayName);

  const navItems = [
    { id: "overview", label: "Overview", icon: IC.home },
    { id: "fee-structure", label: "Fee Structure", icon: IC.billing },
    { id: "student-fees", label: "Student Fees", icon: IC.students },
    { id: "payments", label: "Payments", icon: IC.billing },
    { id: "receipts", label: "Receipts", icon: IC.billing },
    { id: "reports", label: "Reports", icon: IC.audit },
  ];

  if (loading) return <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">Loading Bursar Dashboard...</div>;
  if (authError) return <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center p-4">{authError}</div>;

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Sidebar - same theme */}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-[#0F2044]/10 shadow-xl lg:shadow-none transition-transform duration-300 flex flex-col`} style={{ width: "17rem" }}>
        <div className="px-6 py-5 border-b border-[#0F2044]/8 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#F4B400] flex items-center justify-center flex-shrink-0">
            <span className="text-[#0F2044] font-bold">💰</span>
          </div>
          <div>
            <div className="font-bold text-lg text-[#0F2044] leading-none">SSP-PEP</div>
            <div className="text-[10px] text-[#0F2044]/40 mt-0.5">Bursar Portal</div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-[#0F2044]/40">Finance Modules</p>
          {navItems.map(item => {
            const active = currentTab === item.id;
            return (
              <button key={item.id} onClick={() => { setCurrentTab(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${active ? "bg-[#0F2044] text-white shadow-md" : "text-[#0F2044]/60 hover:bg-[#0F2044]/5 hover:text-[#0F2044]"}`}>
                <span className={active ? "text-white" : "text-[#0F2044]/50"}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#0F2044]/8 flex-shrink-0">
          <div className="bg-[#F7F5F0] rounded-2xl p-4 border border-[#0F2044]/8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-[#F4B400] text-[#0F2044] rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">💰</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0F2044] truncate">{schoolName}</p>
                <p className="text-[10px] text-[#0F2044]/40 truncate">Finance Office</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 py-2 rounded-xl text-xs font-semibold transition-colors">
              {IC.logout} Sign Out
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#0F2044]/10 px-6 py-4 flex items-center justify-between sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(v => !v)} className="lg:hidden p-2 text-[#0F2044] hover:bg-[#F7F5F0] rounded-xl">{sidebarOpen ? IC.close : IC.menu}</button>
            <div>
              <h1 className="text-xl font-bold text-[#0F2044]">{navItems.find(i => i.id === currentTab)?.label || "Bursar Dashboard"}</h1>
              <p className="text-xs text-[#0F2044]/40">Finance Management • {schoolName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-[#0F2044]">{displayName}</p>
                <p className="text-xs text-amber-600">Bursar</p>
              </div>
              <div className="w-9 h-9 bg-[#F4B400] text-[#0F2044] rounded-xl flex items-center justify-center font-bold text-sm">{userInitials}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {currentTab === "overview" && <BursarOverview userData={userData} schoolData={schoolData} schoolCode={schoolCode} setTab={setCurrentTab} />}
          {currentTab === "fee-structure" && <FeeStructure schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "student-fees" && <StudentFees schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "payments" && <Payments schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "receipts" && <Receipts schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "reports" && <Reports schoolCode={schoolCode} schoolName={schoolName} />}
        </main>

        <footer className="border-t border-[#0F2044]/8 bg-white py-3 px-8 text-xs text-[#0F2044]/30 flex justify-between items-center flex-shrink-0">
          <span>© 2026 SSP-PEP • Ministry of Education, Malawi</span>
          <span>v1.4.0 - Bursar</span>
        </footer>
      </div>
    </div>
  );
}