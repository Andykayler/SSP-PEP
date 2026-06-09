import { useState, useEffect } from "react";
import Sidebar from "../pages/admin/side_bar";
import { getInitialTheme, toggleTheme as flipTheme } from "../utils/theme";

const THEME_ICONS = {
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

/**
 * Shared dashboard shell for all role-based portals.
 */
export default function DashboardShell({
  navItems,
  currentTab,
  onTabChange,
  title,
  subtitle,
  roleLabel,
  userName = "User",
  schoolName = "",
  schoolDistrict = "",
  schoolCode = "",
  portalLabel = "Portal",
  navSectionLabel = "Navigation",
  footerVersion = "v1.4.0",
  onSignOut,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleToggleTheme = () => setTheme((t) => flipTheme(t));
  const currentNavItem = navItems.find((item) => item.id === currentTab);
  const displayTitle = title ?? (currentTab === "overview" ? "Dashboard" : currentNavItem?.label);

  return (
    <div className="dashboard-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentTab={currentTab}
        onTabChange={(tab) => {
          onTabChange(tab);
          setSidebarOpen(false);
        }}
        navItems={navItems}
        navSectionLabel={navSectionLabel}
        portalLabel={portalLabel}
        schoolName={schoolName}
        schoolDistrict={schoolDistrict}
        schoolCode={schoolCode}
        onSignOut={onSignOut}
      />

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__left">
            <button
              type="button"
              className="topbar__menu-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            >
              {sidebarOpen ? THEME_ICONS.close : THEME_ICONS.menu}
            </button>
            <div>
              <div className="topbar__title">{displayTitle}</div>
              {subtitle && <div className="topbar__subtitle">{subtitle}</div>}
            </div>
          </div>

          <div className="topbar__right">
            <div className="topbar__status" aria-label="System status online">
              <span className="topbar__status-dot" />
              <span className="topbar__status-text">Online</span>
            </div>

            <button
              type="button"
              onClick={handleToggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="theme-toggle-btn"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? THEME_ICONS.sun : THEME_ICONS.moon}
            </button>

            <div style={{ textAlign: "right" }}>
              <div className="topbar__user-name">{userName}</div>
              {roleLabel && <div className="topbar__user-role">{roleLabel}</div>}
            </div>
            <div className="topbar__avatar" aria-hidden="true">
              {initials(userName) || "??"}
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>

        <footer className="dashboard-footer">
          <span>© 2026 SSP-PEP · Ministry of Education, Malawi</span>
          <span>{footerVersion}</span>
        </footer>
      </div>
    </div>
  );
}
