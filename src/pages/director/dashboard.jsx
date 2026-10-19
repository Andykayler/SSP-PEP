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
//   • It reads everything, across every campus, and edits almost nothing:
//     students, fees, attendance, homework, results and the rest are the
//     staff's own modules shown through <ViewOnly>, with write access withheld
//     by firestore.rules.
//   • The one decision it owns is a student moving between campuses, because
//     that is precisely the call that needs someone with sight of both sites.
//   • It can pay the group's Acalink subscription, since that is the person
//     who signs the cheque.
//
// Built on the same DashboardShell as the head teacher's portal, so a school
// that adds a director gets a product that looks like the one they already use.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, createElement } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  Home, Building2, ArrowLeftRight, Wallet, CreditCard, Users, UserCheck, Award, BookOpen,
  AlertTriangle, FileText, ClipboardList, GraduationCap, HeartPulse, Calendar, ClipboardCheck,
  CalendarDays, Bell, UserCog, UserPlus, Receipt, Landmark, ShieldCheck, Library, Bus,
  BedDouble, Package, CalendarOff,
} from "lucide-react";

import { auth, db } from "../../firebase";
import DashboardShell from "../../components/DashboardShell";
import TransferApprovals from "../../components/campus/TransferApprovals";
import Billing from "../admin/modules/Billing";
import ViewOnly from "../../components/ui/ViewOnly";
import ArrearsModule from "../../components/fees/ArrearsModule";
import LeaveModule from "../../components/leave/LeaveModule";
import HealthModule from "../../components/health/HealthModule";
import StudentManagement from "../headteacher/modules/student";
import ClassAndStreamModule from "../headteacher/modules/ClassModule";
import TimetableModule from "../headteacher/modules/TimetableModule";
import LessonPlansModule from "../headteacher/modules/classplanning";
import ClassSessionsModule from "../headteacher/modules/ClassSessionsModule";
import AttendanceOverview from "../headteacher/modules/AttendanceModule";
import PerformanceAnalytics from "../headteacher/modules/PerformanceModule";
import DisciplineOverview from "../headteacher/modules/DisciplineModule";
import ReportsModule from "../headteacher/modules/reports";
import ExamsModule from "../headteacher/modules/ExamsModule";
import ExamReadiness from "../headteacher/modules/ExamReadiness";
import AtRiskModule from "../headteacher/modules/AtRiskModule";
import Admissions from "../headteacher/modules/Admissions";
import StaffManagement from "../headteacher/modules/StaffManagement";
import AnnouncementsModule from "../headteacher/modules/announcement";
import CalendarModule from "../headteacher/modules/CalendarModule";
import TransportModule from "../headteacher/modules/TransportModule";
import Boarding from "../headteacher/modules/Boarding";
import Inventory from "../headteacher/modules/Inventory";
import StudentFees from "../burser/modules/StudentFees";
import Payments from "../burser/modules/Payments";
import Receipts from "../burser/modules/Receipts";
import Expenses from "../burser/modules/Expenses";
import FeeStructure from "../burser/modules/Feestructure";
import Sponsors from "../burser/modules/Sponsors";
import FinanceReports from "../burser/modules/Reports";
import LibraryModule from "../library/modules/LibraryModule";
import AuditLog from "../admin/modules/AuditLog";
import HomeworkMonitor from "./modules/HomeworkMonitor";
import SchoolOverview from "./modules/SchoolOverview";
import CampusPerformance from "./modules/CampusPerformance";
import FeePosition from "./modules/FeePosition";
import { subscribeCampuses, subscribeTransferRequests, TRANSFER_PENDING } from "../../services/campuses";
import { subscribeSchoolSettings, academicYearFor } from "../../services/academicTerm";
import { boards } from "../../services/schoolProfile";
import { loadSchoolOverview, emptyOverview } from "../../services/schoolOverview";
import "../admin/admin_dashboard.css";
import "../burser/modules/staff-management.css";
import "../../styles/paper-skin.css";
import useDashboardSkin from "../../hooks/useDashboardSkin";

// The sidebar folds these under headings so thirty-odd modules are not one long
// scroll; the overview shows the same groups as cards. Ids not listed (the
// first screens, and Subscription) stay at the top level.
const MODULE_GROUPS = [
  { title: "Learning & results", ids: ["students", "classes", "attendance", "homework", "performance", "exams", "readiness", "reports", "timetable", "lessonplans", "classmonitor"] },
  { title: "Welfare & admissions", ids: ["discipline", "atrisk", "health", "admissions", "boarding"] },
  { title: "Fees & finance", ids: ["finance", "studentfees", "payments", "receipts", "arrears", "feestructure", "expenses", "sponsors", "financereports"] },
  { title: "Staff & operations", ids: ["staff", "leave", "transport", "inventory", "library", "announcements", "calendar", "audit"] },
];

const MODULE_HINTS = {
  students: "Roll, classes and guardians", classes: "Forms, streams and teachers",
  attendance: "Registers and absence trends", homework: "Work set and handed in",
  performance: "Marks, grades and rankings", exams: "Papers, rooms and invigilation",
  readiness: "MSCE / JCE preparation", reports: "Report cards and returns",
  timetable: "The weekly timetable", lessonplans: "Teachers' lesson plans",
  classmonitor: "Which lessons ran today", discipline: "Cases and outcomes",
  atrisk: "Learners who need attention", health: "Sick bay and health records",
  admissions: "Applications and enrolment", boarding: "Hostels and allocations",
  finance: "Billed, collected, outstanding", studentfees: "Balances per student",
  payments: "Every payment received", receipts: "Receipts issued",
  arrears: "Who owes, and for how long", feestructure: "Fees set for each class",
  expenses: "What the school spent", sponsors: "Sponsors and bursaries",
  financereports: "Fee reports and exports", staff: "Staff list and assignments",
  leave: "Staff leave and lesson cover", transport: "Routes and riders",
  inventory: "Stock and issues", library: "Catalogue and loans",
  announcements: "Notices to staff and parents", calendar: "Terms, holidays and events",
  audit: "Who changed what",
};

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

  // Everything below the first four screens is the same module the staff who
  // run it use, shown through <ViewOnly>. The director monitors; the rules in
  // firestore.rules are what stop a write, the wrapper just doesn't offer one.
  const view = (node) => <ViewOnly>{node}</ViewOnly>;
  const icon = (Glyph) => createElement(Glyph, { className: "w-5 h-5" });

  const navItems = [
    { id: "overview", label: "School Overview", icon: icon(Home) },
    {
      id: "campuses", label: "Campuses", icon: icon(Building2),
      component: <CampusPerformance overview={overviewData} loading={overviewLoading} />,
    },
    {
      id: "transfers", label: "Campus Transfers", icon: icon(ArrowLeftRight),
      badge: pending || undefined,
      component: <TransferApprovals schoolCode={schoolCode} currentUser={currentUser} canDecide />,
    },
    // Students and learning
    { id: "students", label: "Students", icon: icon(Users), component: view(<StudentManagement schoolCode={schoolCode} viewer={userData} senderName={displayName} schoolBoards={boards(settings)} />) },
    { id: "classes", label: "Classes & Streams", icon: icon(Users), component: view(<ClassAndStreamModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "attendance", label: "Attendance", icon: icon(UserCheck), component: view(<AttendanceOverview schoolCode={schoolCode} />) },
    { id: "homework", label: "Homework", icon: icon(BookOpen), component: <HomeworkMonitor schoolCode={schoolCode} /> },
    { id: "performance", label: "Results & Performance", icon: icon(Award), component: view(<PerformanceAnalytics schoolCode={schoolCode} />) },
    { id: "exams", label: "Exams", icon: icon(ClipboardList), component: view(<ExamsModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "readiness", label: "Exam Readiness", icon: icon(GraduationCap), component: view(<ExamReadiness schoolCode={schoolCode} />) },
    { id: "reports", label: "Report Cards", icon: icon(FileText), component: view(<ReportsModule schoolCode={schoolCode} userId={uid} userName={displayName} />) },
    { id: "timetable", label: "Timetable", icon: icon(Calendar), component: view(<TimetableModule schoolCode={schoolCode} />) },
    { id: "lessonplans", label: "Lesson Plans", icon: icon(BookOpen), component: view(<LessonPlansModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "classmonitor", label: "Class Monitor", icon: icon(ClipboardCheck), component: view(<ClassSessionsModule schoolCode={schoolCode} />) },
    { id: "discipline", label: "Discipline", icon: icon(AlertTriangle), component: view(<DisciplineOverview schoolCode={schoolCode} />) },
    { id: "atrisk", label: "At-Risk Learners", icon: icon(HeartPulse), component: view(<AtRiskModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "admissions", label: "Admissions", icon: icon(UserPlus), component: view(<Admissions schoolCode={schoolCode} currentUser={currentUser} schoolBoards={boards(settings)} />) },
    // Money
    { id: "finance", label: "Fee Position", icon: icon(Wallet), component: <FeePosition overview={overviewData} loading={overviewLoading} academicYear={academicYear} /> },
    { id: "studentfees", label: "Student Fees", icon: icon(Receipt), component: view(<StudentFees schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "payments", label: "Payments", icon: icon(Landmark), component: view(<Payments schoolCode={schoolCode} bursarName={displayName} />) },
    { id: "receipts", label: "Receipts", icon: icon(Receipt), component: view(<Receipts schoolCode={schoolCode} schoolName={schoolName} />) },
    { id: "arrears", label: "Arrears & Clearance", icon: icon(Wallet), component: view(<ArrearsModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "feestructure", label: "Fee Structure", icon: icon(Landmark), component: view(<FeeStructure schoolCode={schoolCode} schoolName={schoolName} />) },
    { id: "expenses", label: "Expenses", icon: icon(Wallet), component: view(<Expenses schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "sponsors", label: "Sponsors", icon: icon(Users), component: view(<Sponsors schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "financereports", label: "Finance Reports", icon: icon(FileText), component: view(<FinanceReports schoolCode={schoolCode} schoolName={schoolName} />) },
    // Staff and operations
    { id: "staff", label: "Staff", icon: icon(UserCog), component: view(<StaffManagement schoolCode={schoolCode} schoolName={schoolName} />) },
    { id: "leave", label: "Leave & Cover", icon: icon(CalendarOff), component: view(<LeaveModule schoolCode={schoolCode} currentUser={currentUser} mode="head" />) },
    { id: "health", label: "Health", icon: icon(HeartPulse), component: view(<HealthModule schoolCode={schoolCode} currentUser={currentUser} mode="lead" />) },
    { id: "transport", label: "Transport", icon: icon(Bus), component: view(<TransportModule schoolCode={schoolCode} currentUser={currentUser} />) },
    ...(boards(settings)
      ? [{ id: "boarding", label: "Boarding", icon: icon(BedDouble), component: view(<Boarding schoolCode={schoolCode} currentUser={currentUser} />) }]
      : []),
    { id: "inventory", label: "Inventory", icon: icon(Package), component: view(<Inventory schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "library", label: "Library", icon: icon(Library), component: view(<LibraryModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "announcements", label: "Announcements", icon: icon(Bell), component: view(<AnnouncementsModule schoolCode={schoolCode} userId={uid} userName={displayName} />) },
    { id: "calendar", label: "School Calendar", icon: icon(CalendarDays), component: view(<CalendarModule schoolCode={schoolCode} currentUser={currentUser} />) },
    { id: "audit", label: "Audit Log", icon: icon(ShieldCheck), component: view(<AuditLog schoolCode={schoolCode} />) },
    {
      id: "billing", label: "Subscription", icon: icon(CreditCard),
      component: <Billing schoolData={schoolData} schoolCode={schoolCode} canPay />,
    },
  ];

  // Tag each item with its sidebar group; anything not listed stays top-level.
  const groupOf = Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.ids.map((id) => [id, g.title])));
  const sortedNav = [
    ...navItems.filter((i) => !groupOf[i.id]),
    ...MODULE_GROUPS.flatMap((g) => g.ids.map((id) => navItems.find((i) => i.id === id)).filter(Boolean)),
  ].map((i) => (groupOf[i.id] ? { ...i, group: groupOf[i.id] } : i));
  // Subscription belongs after the groups, not before; keep the order the
  // sidebar renders: loose items first, then each group.
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
      navItems={sortedNav}
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
          navItems={navItems}
          moduleGroups={MODULE_GROUPS}
          moduleHints={MODULE_HINTS}
        />
      ) : (
        currentNavItem?.component || null
      )}
    </DashboardShell>
  );
}
