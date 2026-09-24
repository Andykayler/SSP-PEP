import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";

import { NAV_ITEMS } from "./side_bar";
import "./admin_dashboard.css";
import "../../styles/paper-skin.css";
import DashboardShell from "../../components/DashboardShell";
import useDashboardSkin from "../../hooks/useDashboardSkin";

import Overview from "./modules/Overview";
import UserManagement from "./modules/UserManagement";
import StudentManagement from "./modules/StudentManagement";
import CampusManagement from "./modules/CampusManagement";
import TransferApprovals from "../../components/campus/TransferApprovals";
import SchoolSettings from "./modules/SchoolSettings";
import Billing from "./modules/Billing";
import Announcements from "./modules/Announcements";
import AuditLog from "./modules/AuditLog";
import DataBackup from "./modules/DataBackup";
import SchoolSetupGate from "../../components/setup/SchoolSetupGate";
import { subscribeSchoolSettings } from "../../services/academicTerm";
import { isSetUp } from "../../services/schoolProfile";

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
// Runs on the same DashboardShell as every other portal, so the sidebar,
// top bar, notifications, guided tour, account panel and subscription gate
// behave identically. The shell locks a lapsed school's administrator to
// Billing, so they can pay their way back in.
export default function AdminDashboard() {
  useDashboardSkin("paper");
  const [currentTab, setCurrentTab]   = useState("overview");
  const [authUser,   setAuthUser]     = useState(null);
  const [userData,   setUserData]     = useState(null);
  const [schoolData, setSchoolData]   = useState(null);
  const [loading,    setLoading]      = useState(true);
  const [authError,  setAuthError]    = useState("");
  // undefined while unknown, so the gate is not flashed at a school that is
  // already set up before its settings have arrived.
  const [settings,   setSettings]     = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { window.location.href = "/"; return; }
      setAuthUser(fbUser);
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (!userSnap.exists()) { setAuthError("User profile not found."); setLoading(false); return; }
        const user = userSnap.data();
        setUserData(user);
        if (user.schoolCode) {
          const schoolSnap = await getDoc(doc(db, "schools", user.schoolCode));
          if (schoolSnap.exists()) setSchoolData(schoolSnap.data());
        }
      } catch { setAuthError("Failed to load profile. Please refresh."); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const code = userData?.schoolCode;
    if (!code) return;
    return subscribeSchoolSettings(code, setSettings);
  }, [userData?.schoolCode]);

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  const displayName    = userData?.name || authUser?.email || "Admin";
  const schoolName     = schoolData?.name || userData?.name || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const schoolCode     = userData?.schoolCode || "";
  const uid            = authUser?.uid || "";
  const currentNavItem = NAV_ITEMS.find((i) => i.id === currentTab);

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

  // Until the school has said whether it boards and which term is running,
  // the modules would be configured against nothing — so setup comes first
  // rather than as a prompt to dismiss.
  // Both steps: the basics (isSetUp) and then classes & settings, which stamps
  // setupCompletedAt last.
  const needsSetup = schoolCode && settings !== undefined && !(isSetUp(settings) && settings?.setupCompletedAt);

  return (
    <DashboardShell
      navItems={NAV_ITEMS}
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      title={currentTab === "overview" ? "School Administration" : currentNavItem?.label || "Dashboard"}
      subtitle={`System Administrator · ${schoolName}${schoolDistrict ? ` · ${schoolDistrict}` : ""}`}
      roleLabel="System Admin"
      tourRole="admin"
      userName={displayName}
      schoolName={schoolName}
      schoolDistrict={schoolDistrict}
      schoolCode={schoolCode}
      portalLabel="Admin Portal"
      navSectionLabel="Administration"
      footerVersion="Admin Portal v1.5"
      notificationRecipientId={uid}
      onSignOut={handleSignOut}
    >
      {needsSetup ? (
        <SchoolSetupGate
          schoolCode={schoolCode}
          schoolName={schoolName}
          actorId={uid}
          settings={settings}
          school={schoolData}
          onDone={(next) => setSettings((prev) => ({ ...(prev || {}), ...next }))}
        />
      ) : (
        <>
          {currentTab === "overview"      && <Overview userData={userData} schoolData={schoolData} schoolCode={schoolCode} settings={settings} navItems={NAV_ITEMS} setTab={setCurrentTab} />}
          {currentTab === "users"         && <UserManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "campuses"      && <CampusManagement schoolCode={schoolCode} schoolName={schoolName} actorId={uid} />}
          {currentTab === "transfers"     && <TransferApprovals schoolCode={schoolCode} currentUser={{ id: uid, name: displayName, role: "admin" }} canDecide />}
          {currentTab === "students"      && <StudentManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "settings"      && <SchoolSettings schoolCode={schoolCode} schoolData={schoolData} onUpdate={setSchoolData} />}
          {currentTab === "billing"       && <Billing schoolData={schoolData} schoolCode={schoolCode} />}
          {currentTab === "announcements" && <Announcements schoolCode={schoolCode} userName={displayName} />}
          {currentTab === "audit"         && <AuditLog schoolCode={schoolCode} />}
          {currentTab === "backup"        && <DataBackup schoolCode={schoolCode} schoolName={schoolName} actorName={displayName} />}
        </>
      )}
    </DashboardShell>
  );
}
