// src/pages/library/dashboard.jsx
// The librarian's dashboard, at /library. The role existed in the sign-in list
// and the user forms but had nowhere to go; this is where it lands.
import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { BookOpen, Home } from "lucide-react";

import DashboardShell from "../../components/DashboardShell";
import LibraryModule from "./modules/LibraryModule";
import LibraryOverview from "./modules/LibraryOverview";
import useDashboardSkin from "../../hooks/useDashboardSkin";
import "../admin/admin_dashboard.css";
import "../../styles/paper-skin.css";

export default function LibrarianDashboard() {
  useDashboardSkin("paper");
  const [currentTab, setCurrentTab] = useState("overview");
  // Which view the Library page opens on when the overview sends someone
  // there ("catalogue", "loans" or "overdue").
  const [libraryView, setLibraryView] = useState("catalogue");
  const [uid, setUid] = useState("");
  const [userData, setUserData] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { window.location.href = "/"; return; }
      setUid(fbUser.uid);
      try {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        if (!snap.exists()) {
          setAuthError("User profile not found. Contact your system administrator.");
        } else if (snap.data().role !== "librarian") {
          setAuthError("Access denied. This portal is for the school librarian.");
        } else {
          const user = snap.data();
          setUserData(user);
          if (user.schoolCode) {
            const s = await getDoc(doc(db, "schools", user.schoolCode));
            if (s.exists()) setSchoolData(s.data());
          }
        }
      } catch (err) {
        console.error(err);
        setAuthError("Failed to load profile. Please refresh.");
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
        <p className="page-loading__text">Loading your dashboard…</p>
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

  const schoolCode = userData?.schoolCode || "";
  const displayName = userData?.name || "Librarian";
  const currentUser = { id: uid, name: displayName, role: "librarian" };

  const schoolName = schoolData?.name || schoolCode || "Your School";
  const openLibrary = (view) => { setLibraryView(view); setCurrentTab("library"); };

  const navItems = [
    {
      id: "overview", label: "Overview", icon: <Home className="w-5 h-5" />,
      component: <LibraryOverview displayName={displayName} schoolName={schoolName} schoolCode={schoolCode} onOpen={openLibrary} />,
    },
    {
      id: "library", label: "Library", icon: <BookOpen className="w-5 h-5" />,
      component: <LibraryModule key={libraryView} schoolCode={schoolCode} currentUser={currentUser} initialTab={libraryView} />,
    },
  ];
  const current = navItems.find((i) => i.id === currentTab) || navItems[0];

  return (
    <DashboardShell
      navItems={navItems}
      currentTab={current.id}
      onTabChange={setCurrentTab}
      title={current.id === "overview" ? "Library Desk" : "Library"}
      subtitle={`Librarian · ${schoolName}`}
      roleLabel="Librarian"
      tourRole="librarian"
      userName={displayName}
      schoolName={schoolName}
      schoolDistrict={schoolData?.district || ""}
      schoolCode={schoolCode}
      portalLabel="Librarian"
      navSectionLabel="Library"
      notificationRecipientId={uid}
      onSignOut={handleSignOut}
    >
      {current.component}
    </DashboardShell>
  );
}
