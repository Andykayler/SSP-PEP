import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";

import Sidebar, { NAV_ITEMS } from "./side_bar";
import { getInitialTheme, applyTheme, toggleTheme as flipTheme } from "../../utils/theme";
import "./admin_dashboard.css";

import { IC } from "./modules/icons";
import { initials } from "./modules/helpers";
import Overview from "./modules/Overview";
import UserManagement from "./modules/UserManagement";
import StudentManagement from "./modules/StudentManagement";
import SchoolSettings from "./modules/SchoolSettings";
import Billing from "./modules/Billing";
import Announcements from "./modules/Announcements";
import AuditLog from "./modules/AuditLog";

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab]   = useState("overview");
  const [authUser,   setAuthUser]     = useState(null);
  const [userData,   setUserData]     = useState(null);
  const [schoolData, setSchoolData]   = useState(null);
  const [loading,    setLoading]      = useState(true);
  const [authError,  setAuthError]    = useState("");

  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  function handleToggleTheme() { setTheme(t => flipTheme(t)); }

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
      } catch (e) { setAuthError("Failed to load profile. Please refresh."); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Pressing Back after Sign Out can restore this dashboard straight from
  // the browser's back-forward cache (bfcache) — a frozen DOM snapshot from
  // before sign-out, painted instantly without re-running the auth check
  // above. `pageshow` with `event.persisted === true` detects a bfcache
  // restore; reloading re-runs onAuthStateChanged, which redirects a
  // signed-out user to "/" instead of leaving the stale page on screen.
  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  const displayName    = userData?.name || authUser?.email || "Admin";
  const schoolName     = schoolData?.name || userData?.name || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const schoolCode     = userData?.schoolCode || "";
  const currentNavItem = NAV_ITEMS.find(i => i.id === currentTab);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 44, height: 44, border: "3px solid var(--border)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin .7s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text3)", letterSpacing: 1 }}>Loading your dashboard…</p>
      </div>
    </div>
  );

  if (authError) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--bg2)", borderRadius: 20, border: "1px solid var(--border)", padding: 40, maxWidth: 380, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: "rgba(239,68,68,0.12)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#f87171" }}>{IC.warning}</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 20 }}>{authError}</p>
        <button onClick={handleSignOut} className="btn btn--accent btn--md">Back to Sign In</button>
      </div>
    </div>
  );

  return (
    <div className="dashboard-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentTab={currentTab}
        onTabChange={(tab) => { setCurrentTab(tab); setSidebarOpen(false); }}
        schoolName={schoolName}
        navItems={NAV_ITEMS}
        schoolDistrict={schoolDistrict}
        schoolCode={schoolCode}
        notificationRecipientId={authUser?.uid || ""}
        onSignOut={handleSignOut}
      />

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__left">
            <button className="topbar__menu-btn" onClick={() => setSidebarOpen(v => !v)}>
              {sidebarOpen ? IC.close : IC.menu}
            </button>
            <div>
              <div className="topbar__title">{currentNavItem?.label || "Dashboard"}</div>
              <div className="topbar__subtitle">System Administrator · {schoolName}</div>
            </div>
          </div>
          <div className="topbar__right">
            <div className="topbar__status">
              <span className="topbar__status-dot" />
              <span className="topbar__status-text">Online</span>
            </div>
            <button onClick={handleToggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} className="theme-toggle-btn">
              {theme === "dark" ? IC.sun : IC.moon}
            </button>
            <div style={{ textAlign: "right" }}>
              <div className="topbar-user-name">{displayName}</div>
              <div className="topbar__user-role">System Admin</div>
            </div>
            <div className="topbar__avatar">{initials(displayName) || "??"}</div>
          </div>
        </header>

        <main className="page-content">
          {currentTab === "overview"      && <Overview userData={userData} schoolData={schoolData} schoolCode={schoolCode} setTab={setCurrentTab} />}
          {currentTab === "users"         && <UserManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "students"      && <StudentManagement schoolCode={schoolCode} schoolName={schoolName} />}
          {currentTab === "settings"      && <SchoolSettings schoolCode={schoolCode} schoolData={schoolData} onUpdate={setSchoolData} />}
          {currentTab === "billing"       && <Billing schoolData={schoolData} />}
          {currentTab === "announcements" && <Announcements schoolCode={schoolCode} userName={displayName} />}
          {currentTab === "audit"         && <AuditLog schoolCode={schoolCode} />}
        </main>

        <footer className="dashboard-footer">
          <span>© 2026 Acalink</span>
          <span>v1.4.1</span>
        </footer>
      </div>
    </div>
  );
}
