import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import DashboardShell from "../../components/DashboardShell";
import FeeStructure from "./modules/Feestructure";
import StudentFees from "./modules/StudentFees";
import Payments from "./modules/Payments";
import Reports from "./modules/Reports";
import Receipts from "./modules/Receipts";
import Sponsors from "./modules/Sponsors";
import Expenses from "./modules/Expenses";
import ArrearsModule from "../../components/fees/ArrearsModule";
import "../admin/admin_dashboard.css";

const IC = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>,
  billing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  audit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function BursarOverview({ userData, schoolData, schoolCode, setTab }) {
  const displayName = userData?.name || "Bursar";
  const schoolName = schoolData?.name || schoolCode;

  const quickActions = [
    { label: "Fee Structure", icon: IC.billing, tab: "fee-structure", variant: "gold" },
    { label: "Student Fees", icon: IC.students, tab: "student-fees", variant: "teal" },
    { label: "Record Payment", icon: IC.plus, tab: "payments", variant: "navy" },
    { label: "Generate Receipt", icon: IC.billing, tab: "receipts", variant: "purple" },
  ];

  const modules = [
    { tab: "fee-structure", icon: IC.billing, title: "Fee Structure", desc: "Define fees per class and term" },
    { tab: "student-fees", icon: IC.students, title: "Student Fees", desc: "View balances and assign fees" },
    { tab: "payments", icon: IC.billing, title: "Payments", desc: "Record and track all payments" },
    { tab: "receipts", icon: IC.billing, title: "Receipts", desc: "Generate printable official receipts" },
    { tab: "arrears", icon: IC.students, title: "Arrears & Clearance", desc: "Who owes, for how long, and what was decided" },
    { tab: "sponsors", icon: IC.students, title: "Sponsors & Bursaries", desc: "Who pays for which student" },
    { tab: "expenses", icon: IC.billing, title: "Expenses & Petty Cash", desc: "Money out, beside money in" },
    { tab: "reports", icon: IC.audit, title: "Financial Reports", desc: "Summaries, exports & analytics" },
  ];

  return (
    <div className="space-y-8">
      <div className="overview-hero">
        <div>
          <div className="overview-hero__greeting">{greeting()}</div>
          <h2 className="overview-hero__name">
            <span className="overview-hero__name-gradient">{displayName.split(" ")[0]}</span>
          </h2>
          <p className="overview-hero__school">{schoolName} · Finance Office</p>
        </div>
        <div>
          <span className="overview-hero__plan overview-hero__plan--trial">Bursar</span>
          {schoolCode && <div className="overview-hero__code">{schoolCode}</div>}
        </div>
      </div>

      <div>
        <div className="sec-eyebrow">Quick actions</div>
        <div className="quick-actions-grid">
          {quickActions.map((a) => (
            <button key={a.tab} type="button" className={`quick-action-btn quick-action-btn--${a.variant}`} onClick={() => setTab(a.tab)}>
              <span className="quick-action-btn__icon">{a.icon}</span>
              <span className="quick-action-btn__label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="sec-eyebrow">Finance modules</div>
        <div className="modules-grid">
          {modules.map((m) => (
            <button key={m.tab} type="button" className="module-card" onClick={() => setTab(m.tab)}>
              <div className="module-card__icon">{m.icon}</div>
              <div className="module-card__title">{m.title}</div>
              <div className="module-card__desc">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BursarDashboard() {
  const [currentTab, setCurrentTab] = useState("overview");
  const [uid, setUid] = useState("");
  const [userData, setUserData] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) setUid(fbUser.uid);
      if (!fbUser) { window.location.href = "/"; return; }
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
      } catch (e) {
        setAuthError("Failed to load profile.");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  const displayName = userData?.name || "Bursar";
  const schoolName = schoolData?.name || "Your School";
  const schoolCode = userData?.schoolCode || "";

  const navItems = [
    { id: "overview", label: "Overview", icon: IC.home },
    { id: "fee-structure", label: "Fee Structure", icon: IC.billing },
    { id: "student-fees", label: "Student Fees", icon: IC.students },
    { id: "payments", label: "Payments", icon: IC.billing },
    { id: "receipts", label: "Receipts", icon: IC.billing },
    { id: "arrears", label: "Arrears & Clearance", icon: IC.students },
    { id: "sponsors", label: "Sponsors & Bursaries", icon: IC.students },
    { id: "expenses", label: "Expenses", icon: IC.billing },
    { id: "reports", label: "Reports", icon: IC.audit },
  ];

  const currentNavItem = navItems.find((i) => i.id === currentTab);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading__spinner" />
        <p className="page-loading__text">Loading Bursar Dashboard…</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="page-loading">
        <div className="alert alert--error">{authError}</div>
      </div>
    );
  }

  return (
    <DashboardShell
      navItems={navItems}
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      title={currentNavItem?.label || "Bursar Dashboard"}
      subtitle={`Finance Management · ${schoolName}`}
      roleLabel="Bursar"
      userName={displayName}
      schoolName={schoolName}
      schoolCode={schoolCode}
      notificationRecipientId={uid}
      portalLabel="Bursar Portal"
      navSectionLabel="Finance Modules"
      footerVersion="v1.4.0 · Bursar"
      onSignOut={handleSignOut}
    >
      {currentTab === "overview" && (
        <BursarOverview userData={userData} schoolData={schoolData} schoolCode={schoolCode} setTab={setCurrentTab} />
      )}
      {currentTab === "fee-structure" && <FeeStructure schoolCode={schoolCode} schoolName={schoolName} />}
      {currentTab === "student-fees" && <StudentFees schoolCode={schoolCode} schoolName={schoolName} />}
      {currentTab === "payments" && <Payments schoolCode={schoolCode} schoolName={schoolName} bursarName={displayName} />}
      {currentTab === "receipts" && <Receipts schoolCode={schoolCode} schoolName={schoolName} />}
      {currentTab === "arrears" && (
        <ArrearsModule
          schoolCode={schoolCode}
          currentUser={{ id: uid, name: displayName, role: "bursar" }}
          canDecide={false}
        />
      )}
      {currentTab === "sponsors" && (
        <Sponsors schoolCode={schoolCode} currentUser={{ id: uid, name: displayName, role: "bursar" }} />
      )}
      {currentTab === "expenses" && (
        <Expenses schoolCode={schoolCode} currentUser={{ id: uid, name: displayName, role: "bursar" }} />
      )}
      {currentTab === "reports" && <Reports schoolCode={schoolCode} schoolName={schoolName} />}
    </DashboardShell>
  );
}
