import { IC } from "./icons";
import { greeting } from "./helpers";

// ─── Overview ─────────────────────────────────────────────────────────────────
export default function Overview({ userData, schoolData, schoolCode, setTab }) {
  const displayName  = userData?.name || "Admin";
  const schoolName   = schoolData?.name || schoolCode;
  const subscription = schoolData?.subscription_status || "trial";

  const quickActions = [
    { label: "Add Staff User",   icon: IC.users,    tab: "users",         color: "quick-action-btn--navy"   },
    { label: "Register Student", icon: IC.students, tab: "students",      color: "quick-action-btn--teal"   },
    { label: "Post Notice",      icon: IC.bell,     tab: "announcements", color: "quick-action-btn--gold"   },
    { label: "School Settings",  icon: IC.school,   tab: "settings",      color: "quick-action-btn--purple" },
  ];

  const moduleCards = [
    { tab: "users",         icon: IC.users,    title: "User Management",    desc: "Create and manage staff accounts. Credentials sent via email + SMS." },
    { tab: "students",      icon: IC.students, title: "Student Management", desc: "Register students with unique codes. Guardian notified via SMS + email." },
    { tab: "settings",      icon: IC.school,   title: "School Settings",    desc: "Update school profile, classes, subjects, and contact information." },
    { tab: "billing",       icon: IC.billing,  title: "Subscription",       desc: "View your current plan and upgrade options." },
    { tab: "announcements", icon: IC.bell,     title: "Announcements",      desc: "Broadcast notices to staff, teachers, and parents." },
    { tab: "audit",         icon: IC.audit,    title: "Audit Log",          desc: "Track all administrative actions with timestamps." },
  ];

  return (
    <div className="space-y-8">
      <div className="overview-hero">
        <div>
          <p className="overview-hero__greeting">{greeting()}</p>
          <h2 className="overview-hero__name">
            <span className="overview-hero__name-gradient">{displayName.split(" ")[0]}</span>
          </h2>
          <p className="overview-hero__school">{schoolName}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <span className={`overview-hero__plan overview-hero__plan--${subscription === "trial" ? "trial" : "active"}`}>
            {subscription} plan
          </span>
          {schoolCode && <span className="overview-hero__code">{schoolCode}</span>}
        </div>
      </div>

      <div>
        <p className="sec-eyebrow">Quick Actions</p>
        <div className="quick-actions-grid">
          {quickActions.map(a => (
            <button key={a.tab} onClick={() => setTab(a.tab)} className={`quick-action-btn ${a.color}`}>
              <div className="quick-action-btn__icon">{a.icon}</div>
              <span className="quick-action-btn__label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="sec-eyebrow">Admin Modules</p>
        <div className="modules-grid">
          {moduleCards.map(m => (
            <button key={m.tab} onClick={() => setTab(m.tab)} className="module-card">
              <div className="module-card__icon">{m.icon}</div>
              <p className="module-card__title">{m.title}</p>
              <p className="module-card__desc">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
