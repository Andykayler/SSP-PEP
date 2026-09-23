// src/pages/director/dashboard.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The director's portal.
//
// A director sits above the head teachers: they own the school as an
// institution rather than any one of its campuses. Until now the product had
// no seat for that person, so schools handed them an administrator login —
// which gave them the power to create accounts, edit rolls and delete records,
// none of which they want and all of which they would be signing off on later.
//
// So this portal is deliberately narrow and deliberately whole-school:
//
//   • It reads everything, across every campus, and edits almost nothing.
//   • The one decision it owns is a student moving between campuses, because
//     that is precisely the call that needs someone with sight of both sites.
//   • It can pay the group's Acalink subscription, since that is the person
//     who signs the cheque.
//
// Built on the same DashboardShell as the head teacher's portal, so a school
// that adds a director gets a product that looks like the one they already use.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { Home, Building2, ArrowLeftRight, Wallet, CreditCard } from "lucide-react";

import { auth, db } from "../../firebase";
import DashboardShell from "../../components/DashboardShell";
import TransferApprovals from "../../components/campus/TransferApprovals";
import Billing from "../admin/modules/Billing";
import SchoolOverview from "./modules/SchoolOverview";
import CampusPerformance from "./modules/CampusPerformance";
import FeePosition from "./modules/FeePosition";
import { subscribeCampuses, subscribeTransferRequests, TRANSFER_PENDING } from "../../services/campuses";
import { subscribeSchoolSettings, academicYearFor } from "../../services/academicTerm";
import { loadSchoolOverview, emptyOverview } from "../../services/schoolOverview";
import "../admin/admin_dashboard.css";
import "../burser/modules/staff-management.css";
import "../../styles/paper-skin.css";
import useDashboardSkin from "../../hooks/useDashboardSkin";

export default function DirectorDashboard() {
  useDashboardSkin("paper");
  const [currentTab, setCurrentTab] = useState("overview");
  const [uid, setUid] = useState("");
  const [userData, setUserData] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [campuses, setCampuses] = useState([]);
  const [pending, setPending] = useState(0);
  // null until the first aggregation lands, so "not loaded yet" and "loaded,
  // and the school really is empty" are different states rather than the same
  // grid of zeroes.
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { window.location.href = "/"; return; }
      setUid(fbUser.uid);
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (!userSnap.exists()) { setAuthError("No profile is attached to this account."); setLoading(false); return; }
        const user = userSnap.data();

        // A director portal handed to a class teacher would show them every
        // campus's finances. The role is checked here as well as at sign-in,
        // because a URL typed directly does not pass through sign-in.
        if (user.role !== "director") {
          setAuthError("This portal is for the school director.");
          setLoading(false);
          return;
        }

        setUserData(user);
        if (user.schoolCode) {
          const schoolSnap = await getDoc(doc(db, "schools", user.schoolCode));
          if (schoolSnap.exists()) setSchoolData(schoolSnap.data());
        }
      } catch {
        setAuthError("Could not load your profile. Please refresh.");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Back after sign-out can restore this page straight from the bfcache — a
  // frozen snapshot painted without re-running the auth check above.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const schoolCode = userData?.schoolCode || "";

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, setSettings);
  }, [schoolCode]);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeCampuses(schoolCode, setCampuses);
  }, [schoolCode]);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeTransferRequests(schoolCode, (rows) =>
      setPending(rows.filter((r) => r.status === TRANSFER_PENDING).length));
  }, [schoolCode]);

  const academicYear = settings?.currentTerm ? academicYearFor(settings.currentTerm) : "";

  // Re-runs when the campus list arrives, because records with no campus are
  // attributed to the primary site — aggregating before the campuses land
  // would put the whole school under "unassigned" and then visibly correct
  // itself. The previous figures stay on screen while it recomputes, which is
  // less alarming than a dashboard that blanks every time a campus is renamed.
  useEffect(() => {
    if (!schoolCode) return undefined;
    let alive = true;

    (async () => {
      try {
        const next = await loadSchoolOverview({ schoolCode, campuses, academicYear });
        if (alive) setOverview(next);
      } catch (err) {
        console.error("[director] overview failed:", err);
        if (alive) setOverview(emptyOverview());
      }
    })();

    return () => { alive = false; };
  }, [schoolCode, campuses, academicYear]);

  const overviewLoading = overview === null;
  const overviewData = overview || emptyOverview();

  const handleSignOut = async () => { await signOut(auth); window.location.href = "/"; };

  const displayName = userData?.name || "Director";
  const schoolName = schoolData?.name || schoolCode || "Your School";
  const schoolDistrict = schoolData?.district || "";
  const currentUser = { id: uid, name: displayName, role: "director" };

  const navItems = [
    { id: "overview", label: "School Overview", icon: <Home className="w-5 h-5" /> },
    {
      id: "campuses", label: "Campuses", icon: <Building2 className="w-5 h-5" />,
      component: <CampusPerformance overview={overviewData} loading={overviewLoading} />,
    },
    {
      id: "transfers", label: "Campus Transfers", icon: <ArrowLeftRight className="w-5 h-5" />,
      badge: pending || undefined,
      component: <TransferApprovals schoolCode={schoolCode} currentUser={currentUser} canDecide />,
    },
    {
      id: "finance", label: "Fee Position", icon: <Wallet className="w-5 h-5" />,
      component: <FeePosition overview={overviewData} loading={overviewLoading} academicYear={academicYear} />,
    },
    {
      id: "billing", label: "Subscription", icon: <CreditCard className="w-5 h-5" />,
      component: <Billing schoolData={schoolData} schoolCode={schoolCode} canPay />,
    },
  ];

  const currentNavItem = navItems.find((i) => i.id === currentTab);

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
          <button type="button" className="btn btn--accent btn--md" onClick={handleSignOut}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      navItems={navItems}
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      title={currentTab === "overview" ? "School Overview" : currentNavItem?.label}
      subtitle={`Director · ${schoolName}${schoolDistrict ? ` · ${schoolDistrict}` : ""}`}
      roleLabel="Director"
      tourRole="director"
      userName={displayName}
      schoolName={schoolName}
      schoolDistrict={schoolDistrict}
      schoolCode={schoolCode}
      portalLabel="Director Portal"
      navSectionLabel="Governance"
      footerVersion="Director Portal v1.0"
      notificationRecipientId={uid}
      onSignOut={handleSignOut}
    >
      {currentTab === "overview" ? (
        <SchoolOverview
          displayName={displayName}
          schoolName={schoolName}
          schoolCode={schoolCode}
          overview={overviewData}
          loading={overviewLoading}
          pendingTransfers={pending}
          onOpenTab={setCurrentTab}
        />
      ) : (
        currentNavItem?.component || null
      )}
    </DashboardShell>
  );
}
