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
import LeaveModule from "../../components/leave/LeaveModule";
import {
  Wallet, AlertTriangle, Banknote, BarChart3, Receipt, Users, School, CalendarDays,
} from "lucide-react";
import useDashboardSkin from "../../hooks/useDashboardSkin";
import { subscribeSchoolSettings, academicYearFor } from "../../services/academicTerm";
import { loadFinancePulse } from "../../services/financePulse";
import { syncTermFees } from "../../services/termFees";
import { money } from "../../components/ui/format";
import { plural } from "../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Banner, ModuleDirectory,
} from "../../components/overview/OverviewKit";
import "../admin/admin_dashboard.css";
import "../../styles/paper-skin.css";

const IC = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>,
  billing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  students: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  audit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/></svg>,
  leave: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0V11.25a2.25 2.25 0 012.25-2.25h13.5a2.25 2.25 0 012.25 2.25v7.5M9 16.5l1.5 1.5 3-3"/></svg>,
};

const MODULE_GROUPS = [
  { title: "Fees in", ids: ["fee-structure", "student-fees", "payments", "receipts"] },
  { title: "Follow-up", ids: ["arrears", "sponsors"] },
  { title: "Money out & reporting", ids: ["expenses", "reports"] },
  { title: "You", ids: ["leave"] },
];

const MODULE_HINTS = {
  "fee-structure": "Fees per class and term",
  "student-fees": "Balances and fee assignment",
  payments: "Record and confirm payments",
  receipts: "Printable official receipts",
  arrears: "Who owes, and what was decided",
  sponsors: "Who pays for which student",
  expenses: "Money out and petty cash",
  reports: "Summaries and exports",
  leave: "Your own leave requests",
};

const quickActions = [
  { label: "Record a Payment", hint: "Cash, bank or mobile money", icon: <Banknote size={22} />, tab: "payments", tone: "green" },
  { label: "Student Fees", hint: "Look up a balance", icon: <Users size={22} />, tab: "student-fees", tone: "" },
  { label: "Receipts", hint: "Print or resend a receipt", icon: <Receipt size={22} />, tab: "receipts", tone: "gold" },
  { label: "Financial Reports", hint: "Term and year summaries", icon: <BarChart3 size={22} />, tab: "reports", tone: "teal" },
];

function BursarOverview({ displayName, schoolName, schoolCode, navItems, setTab }) {
  const [settings, setSettings] = useState(undefined);
  const [pulse, setPulse] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!schoolCode) return undefined;
    return subscribeSchoolSettings(schoolCode, (s) => setSettings(s || null));
  }, [schoolCode]);

  const academicYear = settings?.currentTerm ? academicYearFor(settings.currentTerm) : "";

  useEffect(() => {
    if (!schoolCode || settings === undefined) return undefined;
    let alive = true;
    // Billing follows the head teacher's term: bring it up to date before
    // counting, so a newly opened term or a new student is billed the moment
    // the bursar signs in.
    const term = settings?.currentTerm || "";
    (term ? syncTermFees({ schoolCode, term }).catch((err) => console.error("[bursar] billing sync failed:", err)) : Promise.resolve())
      .then(() => loadFinancePulse({ schoolCode, academicYear }))
      .then((p) => { if (alive) { setPulse(p); setError(""); } })
      .catch((err) => {
        console.error("[bursar] overview failed:", err);
        if (alive) { setError("The fee figures couldn't be loaded. Please refresh."); setPulse(null); }
      });
    return () => { alive = false; };
  }, [schoolCode, academicYear, settings]);

  const loading = pulse === null && !error;
  const p = pulse;

  const stats = [
    {
      label: "Collected",
      value: p ? money(p.collected) : "—",
      sub: p ? `of ${money(p.billed)} billed${academicYear ? ` · ${academicYear}` : ""}` : "",
      icon: <Wallet size={17} />, tone: "green",
      meter: p?.collectionRate ?? null,
    },
    {
      label: "Outstanding",
      value: p ? money(p.outstanding) : "—",
      sub: p ? `${plural(p.owing, "student")} still owing` : "",
      icon: <AlertTriangle size={17} />, tone: "red",
    },
    {
      label: "Taken Today",
      value: p ? money(p.collectedToday) : "—",
      sub: p ? `${plural(p.paymentsToday, "payment")} recorded` : "",
      icon: <Banknote size={17} />, tone: "gold",
    },
    {
      label: "Collection Rate",
      value: p?.collectionRate != null ? `${p.collectionRate}%` : "—",
      sub: p ? `${plural(p.students, "student")} on roll` : "",
      icon: <BarChart3 size={17} />, tone: "teal",
      meter: p?.collectionRate ?? null,
    },
  ];

  const todos = p ? [
    {
      key: "claims", tab: "payments",
      done: p.unverified === 0, urgent: p.unverified > 0,
      text: p.unverified === 0 ? "No parent-app payments to confirm" : `Confirm ${plural(p.unverified, "parent-app payment")}`,
    },
    {
      // Billing is automatic, so a student with no fees means their class has
      // no fee structure for the term yet.
      key: "unbilled", tab: "fee-structure",
      done: p.unbilled === 0,
      text: p.unbilled === 0 ? "Every student is billed this term" : `${plural(p.unbilled, "student")} not billed — set their class's fees`,
    },
    {
      key: "owing", tab: "arrears",
      done: p.owing === 0,
      text: p.owing === 0 ? "Nobody owes fees" : `Follow up ${plural(p.owing, "student")} with a balance`,
    },
    {
      key: "today", tab: "payments",
      done: p.paymentsToday > 0,
      text: p.paymentsToday > 0 ? `${plural(p.paymentsToday, "payment")} recorded today` : "No payments recorded today yet",
    },
  ] : [];

  return (
    <div className="tp">
      <OverviewHero
        name={displayName.split(" ")[0]}
        lead={
          loading ? "Adding up the ledger…"
            : !p ? "Your finance office at a glance."
            : <>
                <strong>{money(p.collected)}</strong> collected of <strong>{money(p.billed)}</strong> billed
                {academicYear ? <> this year</> : null}.{" "}
                {p.outstanding > 0
                  ? <><strong>{money(p.outstanding)}</strong> is still outstanding.</>
                  : "Nothing is outstanding."}
              </>
        }
        chips={[
          { label: "Bursar", icon: <Wallet size={14} aria-hidden="true" /> },
          { label: schoolName, icon: <School size={14} aria-hidden="true" /> },
          academicYear && { label: academicYear, icon: <CalendarDays size={14} aria-hidden="true" /> },
        ]}
        aside={
          <TodoSheet
            title="Finance office"
            todos={todos}
            loading={loading}
            emptyText="Figures will appear once the ledger loads."
            onOpen={setTab}
          />
        }
      />

      {error && <Banner tone="error" icon={<AlertTriangle size={17} aria-hidden="true" />}>{error}</Banner>}

      <section aria-labelledby="tp-glance">
        <SectionTitle id="tp-glance">At a glance</SectionTitle>
        <StatGrid stats={stats} loading={loading} />
      </section>

      <section aria-labelledby="tp-quick">
        <SectionTitle id="tp-quick">Quick actions</SectionTitle>
        <QuickActions actions={quickActions} onOpen={setTab} />
      </section>

      <section aria-labelledby="tp-modules">
        <SectionTitle id="tp-modules">All modules</SectionTitle>
        <ModuleDirectory groups={MODULE_GROUPS} navItems={navItems} hints={MODULE_HINTS} onOpen={setTab} />
      </section>
    </div>
  );
}

export default function BursarDashboard() {
  useDashboardSkin("paper");
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
      } catch {
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
    { id: "leave", label: "Leave", icon: IC.leave },
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
      title={currentTab === "overview" ? "Finance Office" : currentNavItem?.label || "Bursar Dashboard"}
      subtitle={`Finance Management · ${schoolName}`}
      roleLabel="Bursar"
      tourRole="bursar"
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
        <BursarOverview
          displayName={displayName}
          schoolName={schoolName}
          schoolCode={schoolCode}
          navItems={navItems}
          setTab={setCurrentTab}
        />
      )}
      {currentTab === "fee-structure" && <FeeStructure schoolCode={schoolCode} schoolName={schoolName} />}
      {currentTab === "student-fees" && (
        <StudentFees schoolCode={schoolCode} currentUser={{ id: uid, name: displayName, role: "bursar" }} />
      )}
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
      {currentTab === "leave" && <LeaveModule schoolCode={schoolCode} currentUser={{ id: uid, name: displayName, role: "bursar" }} mode="teacher" />}
    </DashboardShell>
  );
}
