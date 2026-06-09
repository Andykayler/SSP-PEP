import "./admin_dashboard.css";

// ─── Icons ───────────────────────────────────────────────────────────────────
const IC = {
  home:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>,
  users:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
  students:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  school:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>,
  billing:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
  bell:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>,
  audit:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>,
  logout:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>,
};

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "overview",      label: "Overview",        icon: IC.home     },
  { id: "users",         label: "User Management", icon: IC.users    },
  { id: "students",      label: "Students",        icon: IC.students, badge: "NEW" },
  { id: "settings",      label: "School Settings", icon: IC.school   },
  { id: "billing",       label: "Subscription",    icon: IC.billing  },
  { id: "announcements", label: "Announcements",   icon: IC.bell     },
  { id: "audit",         label: "Audit Log",       icon: IC.audit    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

// ─── Sidebar Component ────────────────────────────────────────────────────────
/**
 * Props:
 *   isOpen        {boolean}   – controls mobile visibility
 *   onClose       {function}  – called when overlay is clicked
 *   currentTab    {string}    – active nav id
 *   onTabChange   {function}  – (tabId: string) => void
 *   schoolName    {string}
 *   schoolDistrict{string}
 *   schoolCode    {string}
 *   onSignOut     {function}
 */
export default function Sidebar({
  isOpen,
  onClose,
  currentTab,
  onTabChange,
  schoolName   = "Your School",
  schoolDistrict = "",
  schoolCode   = "",
  onSignOut,
}) {
  const schoolAbbr = initials(schoolName).slice(0, 2) || "SC";

  function handleNavClick(tabId) {
    onTabChange(tabId);
    onClose?.();
  }

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${isOpen ? " sidebar-overlay--visible" : ""}`}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <aside className={`sidebar${isOpen ? " sidebar--open" : " sidebar--closed"}`}>

        {/* ── Brand header ── */}
        <div className="sidebar__header">
          <div className="sidebar__logo-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#fff" />
              <path d="M2 13l10 5 10-5" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="sidebar__brand-name">SSP-PEP</div>
            <div className="sidebar__brand-sub">System Admin</div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="sidebar__nav">
          <span className="sidebar__nav-label">Admin Modules</span>

          {NAV_ITEMS.map(item => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`sidebar__nav-item${active ? " sidebar__nav-item--active" : ""}`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span className="sidebar__nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── School card + sign out ── */}
        <div className="sidebar__footer">
          <div className="sidebar__school-card">
            <div className="sidebar__school-info">
              <div className="sidebar__school-avatar">{schoolAbbr}</div>
              <div style={{ minWidth: 0 }}>
                <div className="sidebar__school-name truncate">{schoolName}</div>
                {schoolDistrict && (
                  <div className="sidebar__school-meta truncate">{schoolDistrict}</div>
                )}
                {schoolCode && (
                  <div
                    className="sidebar__school-meta"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, color: "rgba(255,255,255,0.2)" }}
                  >
                    {schoolCode}
                  </div>
                )}
              </div>
            </div>

            <button className="sidebar__signout" onClick={onSignOut}>
              {IC.logout}
              <span>Sign Out</span>
            </button>
          </div>
        </div>

      </aside>
    </>
  );
}

export { NAV_ITEMS };