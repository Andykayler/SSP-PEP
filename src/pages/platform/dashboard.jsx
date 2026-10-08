// src/pages/platform/dashboard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Acalink's own back office, at /platform. Signed in as a user whose profile
// says role: "superadmin". That profile is created by hand (scripts/
// make-platform-owner.mjs) — there is deliberately no way to become the
// platform owner from inside the product.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { Building2, ScrollText, Home, KeyRound } from "lucide-react";

import DashboardShell from "../../components/DashboardShell";
import SchoolsConsole from "./modules/SchoolsConsole";
import GuardianLookup from "./modules/GuardianLookup";
import PlatformActivity from "./modules/PlatformActivity";
import PlatformOverview from "./modules/PlatformOverview";
import useDashboardSkin from "../../hooks/useDashboardSkin";
import "../admin/admin_dashboard.css";
import "../../styles/paper-skin.css";

export default function PlatformDashboard() {
  useDashboardSkin("paper");
  const [currentTab, setCurrentTab] = useState("overview");
  // Which filter the Schools console opens on when the overview sends the
  // owner there.
  const [schoolsFilter, setSchoolsFilter] = useState("pending");
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { window.location.href = "/"; return; }
      try {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        const user = snap.exists() ? snap.data() : null;
        if (!user || user.role !== "superadmin") {
          setAuthError("Access denied. This area is for the Acalink platform owner.");
        } else {
          setMe({ id: fbUser.uid, name: user.name || fbUser.email || "Platform owner", role: "superadmin" });
        }
      } catch (err) {
        console.error(err);
        setAuthError("Failed to load your profile. Please refresh.");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handlePageShow = (event) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading__spinner" />
        <p className="page-loading__text">Loading…</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="page-loading">
        <p className="page-loading__text" style={{ marginBottom: 16 }}>{authError}</p>
        <button type="button" className="btn btn--accent btn--md" onClick={handleSignOut}>Back to sign in</button>
      </div>
    );
  }

  const openSchools = (filter) => { setSchoolsFilter(filter); setCurrentTab("schools"); };

  const navItems = [
    {
      id: "overview", label: "Overview", icon: <Home className="w-5 h-5" />,
      component: <PlatformOverview displayName={me.name} onOpenSchools={openSchools} onOpenActivity={() => setCurrentTab("activity")} />,
    },
    { id: "schools", label: "Schools", icon: <Building2 className="w-5 h-5" />, component: <SchoolsConsole key={schoolsFilter} currentUser={me} initialFilter={schoolsFilter} /> },
    { id: "guardians", label: "Guardians", icon: <KeyRound className="w-5 h-5" />, component: <GuardianLookup /> },
    { id: "activity", label: "Activity", icon: <ScrollText className="w-5 h-5" />, component: <PlatformActivity /> },
  ];
  const current = navItems.find((i) => i.id === currentTab) || navItems[0];

  return (
    <DashboardShell
      navItems={navItems}
      currentTab={current.id}
      onTabChange={setCurrentTab}
      title={current.id === "overview" ? "Acalink Back Office" : current.label}
      subtitle="Platform owner"
      roleLabel="Platform Owner"
      tourRole="platform"
      userName={me.name}
      schoolName="Acalink"
      portalLabel="Platform"
      navSectionLabel="Back office"
      onSignOut={handleSignOut}
    >
      {current.component}
    </DashboardShell>
  );
}
