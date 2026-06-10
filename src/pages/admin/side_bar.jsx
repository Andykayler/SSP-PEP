import { useState, useEffect } from "react";

export const NAV_ITEMS = [
  { id: "overview",      label: "Overview",        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg> },
  { id: "users",         label: "User Management", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg> },
  { id: "students",      label: "Students",        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg> },
  { id: "settings",      label: "School Settings", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  { id: "billing",       label: "Billing",         icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg> },
  { id: "announcements", label: "Announcements",   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg> },
  { id: "audit",         label: "Audit Log",       icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg> },
];

function getInitialWeather() {
  const now = new Date();
  const temp = 18 + Math.floor(Math.random() * 6);
  const conditions = ["Clear", "Partly Cloudy", "Sunny", "Mild"];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return { temp, condition, time, date };
}

function getWeatherEmoji(condition) {
  const map = { Clear: "☀️", "Partly Cloudy": "⛅", Sunny: "☀️", Mild: "🌤️" };
  return map[condition] || "🌡️";
}

/* ─── media query helper ─────────────────────────────── */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function HeadTeacherSidebar({
  isOpen,
  onClose,
  currentTab,
  onTabChange,
  navItems,
  navSectionLabel = "School Leadership",
  portalLabel = "Admin Portal",
  roleName = "System Admin",
  schoolName = "Your School",
  schoolDistrict = "",
  schoolCode = "",
  onSignOut,
}) {
  const [weather, setWeather] = useState(getInitialWeather);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setWeather((prev) => ({
        ...prev,
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }),
      }));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  /* ── derived visibility ── */
  const visible = isDesktop || isOpen;

  return (
    <>
      <style>{`
        /* scrollbar */
        .sidebar-inner::-webkit-scrollbar       { width: 4px; }
        .sidebar-inner::-webkit-scrollbar-track { background: var(--primary-dim); }
        .sidebar-inner::-webkit-scrollbar-thumb { background: var(--primary-pale); border-radius: 10px; }

        /* nav item hover / active */
        .sb-nav-btn:hover {
          background: var(--primary-pale) !important;
          color: var(--primary-light) !important;
        }
        .sb-nav-btn--active {
          background: var(--primary-dim) !important;
          color: var(--primary) !important;
          border-left-color: var(--primary) !important;
        }

        /* sign-out hover */
        .sb-signout:hover {
          background: var(--danger-pale) !important;
          border-color: var(--danger-light) !important;
          color: var(--danger-light) !important;
        }
      `}</style>

      {/* ── Mobile overlay ── */}
      {!isDesktop && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            zIndex: 250,
            opacity: isOpen ? 1 : 0,
            visibility: isOpen ? "visible" : "hidden",
            transition: "opacity 0.25s ease, visibility 0.25s ease",
            pointerEvents: isOpen ? "auto" : "none",
          }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className="sidebar-inner"
        style={{
          /* positioning */
          position: isDesktop ? "sticky" : "fixed",
          top: 0,
          left: 0,
          height: isDesktop ? "100vh" : "100%",
          width: 280,
          zIndex: isDesktop ? 100 : 300,
          flexShrink: 0,

          /* appearance */
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--border-color)",
          boxShadow: isDesktop ? "none" : "4px 0 24px rgba(0,0,0,0.4)",

          /* layout */
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overflowX: "hidden",

          /* slide animation — only on mobile */
          transform: isDesktop ? "none" : (isOpen ? "translateX(0)" : "translateX(-100%)"),
          visibility: visible ? "visible" : "hidden",
          transition: isDesktop
            ? "background-color var(--transition-base), border-color var(--transition-base)"
            : "transform 0.28s cubic-bezier(0.4,0,0.2,1), visibility 0.28s, background-color var(--transition-base)",
        }}
      >
        {/* ── Brand header ── */}
        <div style={{
          padding: "24px 20px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}>
          <div style={{
            width: 40, height: 40, flexShrink: 0,
            background: "linear-gradient(135deg, var(--primary), var(--primary-light))",
            borderRadius: "var(--radius-lg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 3px 14px rgba(79,110,247,0.4)",
          }}>
            <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#fff" />
              <path d="M2 13l10 5 10-5" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              lineHeight: 1.2,
              background: "linear-gradient(135deg, var(--primary), var(--primary-light))",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}>SSP-PEP</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              letterSpacing: "1.5px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}>{portalLabel}</div>
          </div>
        </div>

        {/* ── User info ── */}
        <div style={{
          padding: "14px 20px 12px",
          fontSize: "0.75rem",
          fontWeight: 500,
          color: "var(--text-secondary)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          flexShrink: 0,
        }}>
          <span style={{ color: "var(--primary-light)" }}>{roleName}</span>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{schoolName}</span>
          {schoolDistrict && (
            <>
              <span style={{ color: "var(--text-muted)" }}>·</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{schoolDistrict}</span>
            </>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex: 1, padding: "20px 16px", overflowY: "auto" }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 16,
            paddingLeft: 12,
            display: "block",
          }}>{navSectionLabel}</span>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {navItems.map((item) => {
              const active = currentTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => { onTabChange(item.id); onClose?.(); }}
                    className={`sb-nav-btn${active ? " sb-nav-btn--active" : ""}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      width: "100%",
                      padding: "10px 16px",
                      borderRadius: "var(--radius-lg)",
                      color: active ? "var(--primary)" : "var(--text-secondary)",
                      background: active ? "var(--primary-dim)" : "transparent",
                      border: "none",
                      borderLeft: `3px solid ${active ? "var(--primary)" : "transparent"}`,
                      fontFamily: "var(--font-body)",
                      fontWeight: 500,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      transition: "all var(--transition-base)",
                      textAlign: "left",
                      minHeight: 42,
                    }}
                  >
                    <span style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {item.icon}
                    </span>
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span style={{
                        marginLeft: "auto",
                        background: "var(--primary)",
                        color: "#fff",
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 40,
                        flexShrink: 0,
                      }}>{item.badge}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Footer ── */}
        <div style={{
          marginTop: "auto",
          padding: "16px 16px 20px",
          borderTop: "1px solid var(--border-color)",
          flexShrink: 0,
        }}>
          {/* Weather widget */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 12px",
            justifyContent: "space-between",
            background: "var(--surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-xl)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}>
            <span style={{ fontWeight: 700, color: "var(--primary-light)" }}>{weather.temp}°C</span>
            <span>
              <span style={{ marginRight: 4, fontSize: "0.85rem" }}>{getWeatherEmoji(weather.condition)}</span>
              {weather.condition}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {weather.time}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {weather.date}
            </span>
          </div>

          {/* Sign out */}
          <button
            className="sb-signout"
            onClick={onSignOut}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 10,
              background: "transparent",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-lg)",
              fontFamily: "var(--font-body)",
              fontSize: "0.8rem",
              fontWeight: 500,
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all var(--transition-base)",
              minHeight: 40,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}