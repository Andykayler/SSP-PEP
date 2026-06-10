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
/**
 * Returns a random weather condition (static once mounted)
 * Includes temperature, condition, time, and date.
 */
function getInitialWeather() {
  const now = new Date();
  const temp = 18 + Math.floor(Math.random() * 6);
  const conditions = ["Clear", "Partly Cloudy", "Sunny", "Mild"];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return { temp, condition, time, date };
}

/** Map weather condition to a relevant emoji */
function getWeatherEmoji(condition) {
  const map = {
    Clear: "☀️",
    "Partly Cloudy": "⛅",
    Sunny: "☀️",
    Mild: "🌤️",
  };
  return map[condition] || "🌡️";
}

/** Generate initials from a name (max 2 letters) */
function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export default function HeadTeacherSidebar({
  isOpen,
  onClose,
  currentTab,
  onTabChange,
  navItems,
  navSectionLabel = "School Leadership",
  portalLabel = "Head Teacher Portal",
  roleName = "Head Teacher",
  schoolName = "Your School",
  schoolDistrict = "",
  schoolCode = "",
  onSignOut,
}) {
  // Weather state: computed once at mount (improves stability across re-renders)
  const [weather, setWeather] = useState(getInitialWeather);

  // Optional: refresh time & date every minute, while preserving temp/condition
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

  return (
    <div className="ht-sidebar-root">
      {/* Inline styles — scoped to this component via the wrapper class */}
      <style>{`
        /* ----- CSS variables (scoped fallbacks) ----- */
        .ht-sidebar-root {
          --primary: #3b82f6;
          --primary-light: #60a5fa;
          --primary-dim: #eff6ff;
          --primary-pale: #dbeafe;
          --danger: #ef4444;
          --danger-pale: #fee2e2;
          --bg-secondary: #ffffff;
          --surface: #f8fafc;
          --border-color: #e2e8f0;
          --text-primary: #0f172a;
          --text-secondary: #334155;
          --text-muted: #64748b;
          --font-display: system-ui, 'Segoe UI', 'Inter', sans-serif;
          --font-body: system-ui, 'Segoe UI', 'Inter', sans-serif;
          --font-mono: 'SF Mono', 'Fira Code', monospace;
          --radius-lg: 12px;
          --radius-xl: 16px;
          --shadow-lg: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
          --shadow-accent: 0 4px 8px rgba(59, 130, 246, 0.2);
          --transition-base: 0.2s ease;
        }

        /* Sidebar container */
        .ht-sidebar-root .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          width: 280px;
          flex-shrink: 0;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          transition: transform 0.25s ease, background var(--transition-base);
          z-index: 100;
          overflow-y: auto;
        }

        /* Custom scrollbar */
        .ht-sidebar-root .sidebar::-webkit-scrollbar {
          width: 4px;
        }
        .ht-sidebar-root .sidebar::-webkit-scrollbar-track {
          background: var(--primary-dim);
        }
        .ht-sidebar-root .sidebar::-webkit-scrollbar-thumb {
          background: var(--primary-pale);
          border-radius: 10px;
        }

        /* Mobile off-canvas */
        @media (max-width: 768px) {
          .ht-sidebar-root .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            transform: translateX(-100%);
            box-shadow: var(--shadow-lg);
            z-index: 200;
          }
          .ht-sidebar-root .sidebar--open {
            transform: translateX(0);
          }
        }

        /* Overlay */
        .ht-sidebar-root .sidebar-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          z-index: 150;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        .ht-sidebar-root .sidebar-overlay--visible {
          opacity: 1;
          visibility: visible;
        }

        /* Header */
        .ht-sidebar-root .sidebar__header {
          padding: 24px 20px 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .ht-sidebar-root .sidebar__logo-mark {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--primary), var(--primary-light));
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-accent);
        }
        .ht-sidebar-root .sidebar__logo-mark svg {
          width: 22px;
          height: 22px;
          stroke: white;
        }
        .ht-sidebar-root .sidebar__brand-name {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--primary), var(--primary-light));
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }
        .ht-sidebar-root .sidebar__brand-sub {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 1.5px;
          color: var(--text-muted);
        }

        /* User info */
        .ht-sidebar-root .sidebar__user-info {
          padding: 16px 20px 12px 20px;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ht-sidebar-root .sidebar__user-role {
          color: var(--primary-light);
        }
        .ht-sidebar-root .sidebar__user-divider {
          color: var(--text-muted);
        }
        .ht-sidebar-root .sidebar__user-school {
          color: var(--text-primary);
          font-weight: 600;
        }

        /* Navigation */
        .ht-sidebar-root .sidebar__nav {
          flex: 1;
          padding: 20px 16px;
        }
        .ht-sidebar-root .sidebar__nav-label {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 16px;
          padding-left: 12px;
          display: block;
        }
        .ht-sidebar-root .sidebar__nav-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ht-sidebar-root .sidebar__nav-item {
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          padding: 10px 16px;
          border-radius: var(--radius-lg);
          color: var(--text-secondary);
          background: transparent;
          border: none;
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all var(--transition-base);
          text-align: left;
        }
        .ht-sidebar-root .sidebar__nav-icon svg {
          width: 20px;
          height: 20px;
          stroke: currentColor;
        }
        .ht-sidebar-root .sidebar__nav-text {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ht-sidebar-root .sidebar__nav-item:hover {
          background: var(--primary-pale);
          color: var(--primary-light);
        }
        .ht-sidebar-root .sidebar__nav-item--active {
          background: var(--primary-dim);
          color: var(--primary);
          border-left: 3px solid var(--primary);
        }
        .ht-sidebar-root .sidebar__nav-badge {
          margin-left: auto;
          background: var(--primary);
          color: white;
          font-size: 0.6rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 40px;
        }

        /* Footer */
        .ht-sidebar-root .sidebar__footer {
          margin-top: auto;
          padding: 20px 16px 24px;
          border-top: 1px solid var(--border-color);
        }
        .ht-sidebar-root .sidebar__weather {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: space-between;
          background: var(--surface);
          border-radius: var(--radius-xl);
          padding: 12px 16px;
          margin-bottom: 16px;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .ht-sidebar-root .sidebar__weather-temp {
          font-weight: 700;
          color: var(--primary-light);
        }
        .ht-sidebar-root .sidebar__weather-emoji {
          margin-right: 4px;
          font-size: 0.85rem;
        }
        .ht-sidebar-root .sidebar__signout {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 10px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          font-family: var(--font-body);
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-base);
        }
        .ht-sidebar-root .sidebar__signout svg {
          width: 18px;
          height: 18px;
        }
        .ht-sidebar-root .sidebar__signout:hover {
          background: var(--danger-pale);
          border-color: var(--danger);
          color: var(--danger);
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .ht-sidebar-root .sidebar {
            width: 260px;
          }
          .ht-sidebar-root .sidebar__weather {
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 6px;
          }
        }
      `}</style>

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${isOpen ? " sidebar-overlay--visible" : ""}`}
        onClick={onClose}
      />

      <aside className={`sidebar${isOpen ? " sidebar--open" : ""}`}>
        {/* Brand header */}
        <div className="sidebar__header">
          <div className="sidebar__logo-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3L2 8l10 5 10-5-10-5z" fill="#fff" />
              <path d="M2 13l10 5 10-5" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="sidebar__brand-name">SSP-PEP</div>
            <div className="sidebar__brand-sub">{portalLabel}</div>
          </div>
        </div>

        {/* User info line */}
        <div className="sidebar__user-info">
          <span className="sidebar__user-role">{roleName}</span>
          <span className="sidebar__user-divider">·</span>
          <span className="sidebar__user-school">{schoolName}</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav">
          <span className="sidebar__nav-label">{navSectionLabel}</span>
          <ul className="sidebar__nav-list">
            {navItems.map((item) => {
              const active = currentTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      onTabChange(item.id);
                      onClose?.();
                    }}
                    className={`sidebar__nav-item${active ? " sidebar__nav-item--active" : ""}`}
                  >
                    <span className="sidebar__nav-icon">{item.icon}</span>
                    <span className="sidebar__nav-text">{item.label}</span>
                    {item.badge && <span className="sidebar__nav-badge">{item.badge}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="sidebar__footer">
          <div className="sidebar__weather">
            <span className="sidebar__weather-temp">{weather.temp}°C</span>
            <span className="sidebar__weather-condition">
              <span className="sidebar__weather-emoji">{getWeatherEmoji(weather.condition)}</span>
              {weather.condition}
            </span>
            <span className="sidebar__weather-time">{weather.time}</span>
            <span className="sidebar__weather-date">{weather.date}</span>
          </div>
          <button className="sidebar__signout" onClick={onSignOut}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </div>
  );
}