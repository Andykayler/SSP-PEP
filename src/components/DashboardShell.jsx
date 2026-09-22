import { useState, useEffect, useCallback } from "react";
import Sidebar from "../pages/admin/side_bar";
import { getInitialTheme, toggleTheme as flipTheme } from "../utils/theme";
import NotificationProvider from "./notifications/NotificationProvider";
import { NotificationBell, NotificationToasts } from "./notifications/NotificationBell";
import GuidedTour, { TourHelpButton } from "./tour/GuidedTour";
import { buildTourSteps, hasSeenTour } from "./tour/tourSteps";
import AccountPanel from "./account/AccountPanel";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { onUpdateAvailable, applyUpdate } from "../services/pwa";
import useSchoolAccess from "./subscription/useSchoolAccess";
import AccessBlocked from "./subscription/AccessBlocked";
import SubscriptionBanner from "./subscription/SubscriptionBanner";

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

export default function DashboardShell({
  navItems: allNavItems,
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
  // Notification wiring: `notificationRecipientId` is the signed-in user's uid
  // (or `parent:<phone>` for a guardian). Omitting it renders the shell with
  // no bell, which keeps the component usable outside an auth context.
  notificationRecipientId = "",
  // Optional override for what a notification click does. The default just
  // switches tabs; a portal that can deep-link into a record (opening one
  // conversation, say) supplies its own.
  onNotificationNavigate,
  // Which dashboard this is ("teacher", "head", "bursar", "director"). Picks
  // the wording the guided tour uses for each module.
  tourRole = "",
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [tourOpen, setTourOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const online = useOnlineStatus();
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => { onUpdateAvailable(() => setUpdateReady(true)); }, []);
  const [tourSeen, setTourSeen] = useState(() => hasSeenTour(tourRole));

  // Whether this school may use the platform right now (approval, trial,
  // subscription). Live, so approval or renewal lets people in without a
  // refresh. The platform owner has no school, so nothing is gated for them.
  const { school, access } = useSchoolAccess(schoolCode);
  // The director can pay; when the subscription has lapsed they get the
  // Billing page and nothing else. Everyone else is stopped at a screen that
  // says who to ask.
  const canPay = tourRole === "director";
  const lockedToBilling = access.restricted && canPay;
  const navItems = lockedToBilling ? allNavItems.filter((i) => i.id === "billing") : allNavItems;
  useEffect(() => {
    if (lockedToBilling && currentTab !== "billing") onTabChange("billing");
  }, [lockedToBilling, currentTab, onTabChange]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Pressing Back after Sign Out can restore this dashboard straight from
  // the browser's back-forward cache (bfcache) — a frozen snapshot of the
  // DOM from before sign-out, painted instantly without re-running any
  // auth check. `pageshow` with `event.persisted === true` is how a bfcache
  // restore is detected; forcing a reload re-runs the parent dashboard's
  // onAuthStateChanged listener, which redirects to "/" for a signed-out
  // user instead of leaving the stale authenticated page on screen.
  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Close sidebar on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Prevent body scroll when mobile tray is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleToggleTheme = () => setTheme((t) => flipTheme(t));
  const handleTabChange = useCallback((tab) => {
    onTabChange(tab);
    setSidebarOpen(false);
  }, [onTabChange]);

  const currentNavItem = navItems.find((item) => item.id === currentTab);
  const displayTitle = title ?? (currentTab === "overview" ? "Dashboard" : currentNavItem?.label);

  // Clicking a notification jumps to the tab it points at. `navItems` is the
  // authority on which tabs this portal actually has, so a notification aimed
  // at a module this role cannot see is ignored rather than blanking the page.
  const handleNotificationNavigate = useCallback((tab, notification) => {
    if (onNotificationNavigate) {
      onNotificationNavigate(tab, notification);
      return;
    }
    if (tab && navItems.some((item) => item.id === tab)) onTabChange(tab);
  }, [navItems, onTabChange, onNotificationNavigate]);

  const tourSteps = buildTourSteps({
    role: tourRole,
    navItems,
    userName,
    roleLabel,
    hasBell: Boolean(notificationRecipientId),
  });

  if (access.blocked || (access.restricted && !canPay)) {
    return <AccessBlocked access={access} school={school} onSignOut={onSignOut} />;
  }

  return (
    <NotificationProvider
      recipientId={notificationRecipientId}
      schoolCode={schoolCode}
      onNavigate={handleNotificationNavigate}
    >
    <div className="dashboard-shell">
      {/*
        Sidebar handles its OWN overlay (.sidebar-overlay) internally.
        DashboardShell does NOT render a second backdrop.
        On desktop:  sidebar is sticky, in-flow, takes 280px — main-area fills the rest.
        On mobile:   sidebar is fixed, out-of-flow — main-area fills 100% width.
      */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentTab={currentTab}
        onTabChange={handleTabChange}
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
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? THEME_ICONS.close : THEME_ICONS.menu}
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="topbar__title">{displayTitle}</div>
              {subtitle && <div className="topbar__subtitle">{subtitle}</div>}
            </div>
          </div>

          <div className="topbar__right">
            {updateReady && (
              <button
                type="button"
                onClick={applyUpdate}
                className="topbar__status"
                style={{ cursor: "pointer", background: "var(--primary-pale)", border: "1px solid var(--border-color)" }}
                title="A new version of Acalink is ready"
              >
                <span className="topbar__status-text">Update ready — tap to reload</span>
              </button>
            )}
            <div className="topbar__status" aria-label={online ? "System status online" : "No internet connection — your work is saved on this device"} title={online ? undefined : "No connection. Your work is saved here and will sync when you're back online."}>
              <span className="topbar__status-dot" style={online ? undefined : { background: "var(--warning-light)" }} />
              <span className="topbar__status-text">{online ? "Online" : "Offline"}</span>
            </div>

            {notificationRecipientId && (
              <span data-tour="notifications" style={{ display: "inline-flex" }}>
                <NotificationBell />
              </span>
            )}

            <TourHelpButton onClick={() => setTourOpen(true)} seen={tourSeen} />

            <button
              type="button"
              data-tour="theme"
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
            <div
              className="topbar__avatar"
              role="button"
              tabIndex={0}
              title="Your account: WhatsApp alerts and two-step sign-in"
              aria-label="Your account"
              data-tour="profile"
              style={{ cursor: "pointer" }}
              onClick={() => setAccountOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAccountOpen(true); } }}
            >
              {initials(userName) || "??"}
            </div>
          </div>
        </header>

        <main className="page-content">
          <SubscriptionBanner
            access={access}
            canPay={canPay}
            onSubscribe={() => onTabChange("billing")}
          />
          {children}
        </main>

        <footer className="dashboard-footer">
          <span>© 2026 Acalink</span>
          <span>{footerVersion}</span>
        </footer>
      </div>

      <NotificationToasts />

      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} name={userName} roleLabel={roleLabel} />

      <GuidedTour
        open={tourOpen}
        steps={tourSteps}
        role={tourRole}
        startTab={currentTab}
        onTabChange={onTabChange}
        setSidebarOpen={setSidebarOpen}
        onClose={() => { setTourOpen(false); setTourSeen(true); }}
      />
    </div>
    </NotificationProvider>
  );
}