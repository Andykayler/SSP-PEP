// The administrator's landing page: is the school set up, who has access,
// and is the subscription in order.
import { useEffect, useState } from "react";
import { collection, getDocs, getCountFromServer, query, where } from "firebase/firestore";
import {
  Users, GraduationCap, LayoutGrid, CreditCard, UserPlus, Megaphone, Settings, AlertTriangle,
  School, Hash, ShieldCheck, MapPin,
} from "lucide-react";
import { db } from "../../../firebase";
import useSchoolAccess from "../../../components/subscription/useSchoolAccess";
import { subscribeTransferRequests, TRANSFER_PENDING } from "../../../services/campuses";
import { fetchSchoolClasses, registeredSubjects } from "../../../services/staffAssignments";
import { isDeactivated } from "../../../services/staffAccountCore";
import { toMs } from "../../../services/subscriptionState";
import { plural } from "../../../components/overview/overviewText";
import {
  OverviewHero, TodoSheet, SectionTitle, StatGrid, QuickActions, Banner, ModuleDirectory,
} from "../../../components/overview/OverviewKit";

const MODULE_GROUPS = [
  { title: "People", ids: ["users", "students", "campuses", "transfers"] },
  { title: "School", ids: ["settings", "billing"] },
  { title: "Records & communication", ids: ["announcements", "audit", "backup"] },
];

const MODULE_HINTS = {
  users: "Staff accounts and access",
  students: "Register and manage learners",
  campuses: "The school's sites",
  transfers: "Students moving between campuses",
  settings: "Profile, classes and subjects",
  billing: "Your Acalink subscription",
  announcements: "Notices to staff and parents",
  audit: "Every administrative action",
  backup: "Export the school's data",
};

const quickActions = [
  { label: "Add a Staff Member", hint: "Credentials by email & SMS", icon: <UserPlus size={22} />, tab: "users", tone: "green" },
  { label: "Register a Student", hint: "Guardian is notified", icon: <GraduationCap size={22} />, tab: "students", tone: "" },
  { label: "Post a Notice", hint: "To staff and parents", icon: <Megaphone size={22} />, tab: "announcements", tone: "gold" },
  { label: "School Settings", hint: "Profile, classes, subjects", icon: <Settings size={22} />, tab: "settings", tone: "teal" },
];

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** One line on the plan, the way a school office would say it. */
function planSummary(school, access) {
  if (!school) return { value: "—", sub: "" };
  if (access.state === "legacy") return { value: "Legacy", sub: "No expiry set" };
  if (school.subscription_status === "active") {
    const pt = toMs(school.paidThrough);
    return { value: "Paid", sub: pt ? `Until ${fmtDate(pt)}` : "Subscription active" };
  }
  if (access.state === "trial") {
    return { value: "Trial", sub: access.daysLeft != null ? `${plural(access.daysLeft, "day")} left` : "On trial" };
  }
  return { value: access.restricted ? "Lapsed" : "Trial", sub: access.title || "" };
}

export default function Overview({ userData, schoolData, schoolCode, settings, navItems, setTab }) {
  const displayName = userData?.name || "Admin";
  const schoolName = schoolData?.name || schoolCode;
  const { school, access } = useSchoolAccess(schoolCode);

  const [pulse, setPulse] = useState(null);
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!schoolCode) return undefined;
    return subscribeTransferRequests(schoolCode, (rows) =>
      setPendingTransfers(rows.filter((r) => r.status === TRANSFER_PENDING).length));
  }, [schoolCode]);

  useEffect(() => {
    if (!schoolCode) return undefined;
    let alive = true;
    (async () => {
      try {
        const [usersSnap, studentCount, classes] = await Promise.all([
          getDocs(query(collection(db, "users"), where("schoolCode", "==", schoolCode))),
          getCountFromServer(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
          fetchSchoolClasses(schoolCode),
        ]);
        const staff = usersSnap.docs.map((d) => d.data()).filter((u) => u.role !== "admin" && u.role !== "student");
        const active = staff.filter((u) => !isDeactivated(u));
        if (!alive) return;
        setPulse({
          staff: active.length,
          deactivated: staff.length - active.length,
          heads: active.filter((u) => u.role === "head_teacher").length,
          teachers: active.filter((u) => u.role === "class_teacher").length,
          students: studentCount.data().count,
          classes: classes.length,
          subjects: registeredSubjects(classes).length,
        });
      } catch (err) {
        console.error("[admin] overview failed:", err);
        if (alive) { setError("Some numbers couldn't be loaded. Please refresh."); setPulse(null); }
      }
    })();
    return () => { alive = false; };
  }, [schoolCode]);

  const loading = pulse === null && !error;
  const p = pulse;
  const plan = planSummary(school, access);

  const stats = [
    {
      label: "Staff Accounts", value: p ? String(p.staff) : "—",
      sub: p ? `${plural(p.teachers, "teacher")}${p.deactivated ? ` · ${p.deactivated} deactivated` : ""}` : "",
      icon: <Users size={17} />,
    },
    {
      label: "Students", value: p ? p.students.toLocaleString("en-GB") : "—",
      sub: "On the school roll", icon: <GraduationCap size={17} />, tone: "teal",
    },
    {
      label: "Classes", value: p ? String(p.classes) : "—",
      sub: p ? `${plural(p.subjects, "subject")} offered` : "", icon: <LayoutGrid size={17} />, tone: "gold",
    },
    { label: "Subscription", value: plan.value, sub: plan.sub, icon: <CreditCard size={17} />, tone: access.restricted ? "red" : "green" },
  ];

  const todos = !p ? [] : [
    {
      key: "term", tab: "settings", done: Boolean(settings?.currentTerm),
      text: settings?.currentTerm ? `Recording against ${settings.currentTerm}` : "Set the current term",
    },
    {
      key: "classes", tab: "settings", done: p.classes > 0, urgent: p.classes === 0,
      text: p.classes > 0 ? `${plural(p.classes, "class", "es")} registered` : "Register your classes",
    },
    {
      key: "head", tab: "users", done: p.heads > 0, urgent: p.heads === 0,
      text: p.heads > 0 ? "Head teacher account set up" : "Add a head teacher account",
    },
    {
      key: "transfers", tab: "transfers", done: pendingTransfers === 0, urgent: pendingTransfers > 0,
      text: pendingTransfers === 0 ? "No campus transfers waiting" : `Decide ${plural(pendingTransfers, "campus transfer")}`,
    },
    {
      key: "plan", tab: "billing", done: !access.warn && !access.restricted, urgent: access.restricted,
      text: access.warn || access.restricted ? access.title || "Check the subscription" : "Subscription in good standing",
    },
  ];

  return (
    <div className="tp">
      <OverviewHero
        name={displayName.split(" ")[0]}
        lead={
          loading ? "Checking the school's set-up…" : !p ? "Your school's administration at a glance." : (
            <>
              <strong>{schoolName}</strong> has <strong>{plural(p.staff, "staff account")}</strong>,{" "}
              <strong>{plural(p.students, "student")}</strong> and <strong>{plural(p.classes, "class", "es")}</strong> on Acalink.
            </>
          )
        }
        chips={[
          { label: "Administrator", icon: <ShieldCheck size={14} aria-hidden="true" /> },
          { label: schoolName, icon: <School size={14} aria-hidden="true" /> },
          schoolData?.district && { label: schoolData.district, icon: <MapPin size={14} aria-hidden="true" /> },
          schoolCode && { label: schoolCode, icon: <Hash size={13} aria-hidden="true" />, mono: true, title: "School code" },
        ]}
        aside={<TodoSheet title="School set-up" todos={todos} loading={loading} emptyText="" onOpen={setTab} />}
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
