import { useState } from "react";

// Your original getWeather (called on each render, just like before)
function getWeather() {
  const now = new Date();
  const temp = 18 + Math.floor(Math.random() * 6);
  const conditions = ["Clear", "Partly Cloudy", "Sunny", "Mild"];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return { temp, condition, time, date };
}

// Not used in your original component, but kept for completeness
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
  // Original weather call – re‑evaluates on every render (no state, no timer)
  const weather = getWeather();

  return (
    <>
      {/* Original CSS – exactly as you had, no changes */}
      <style>{`
        /* Sidebar container */
        .sidebar {
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
          .sidebar::-webkit-scrollbar {
            width: 4px;
          }
          .sidebar::-webkit-scrollbar-track {
            background: var(--primary-dim);
          }
          .sidebar::-webkit-scrollbar-thumb {
            background: var(--primary-pale);
            border-radius: 10px;
          }
          
          /* Mobile off-canvas */
          @media (max-width: 768px) {
            .sidebar {
              position: fixed;
              top: 0;
              left: 0;
              transform: translateX(-100%);
              box-shadow: var(--shadow-lg);
              z-index: 200;
            }
            .sidebar--open {
              transform: translateX(0);
            }
          }
          
          /* Overlay */
          .sidebar-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            z-index: 150;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s ease, visibility 0.2s ease;
          }
          .sidebar-overlay--visible {
            opacity: 1;
            visibility: visible;
          }
          
          /* Header */
          .sidebar__header {
            padding: 24px 20px 16px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid var(--border-color);
          }
          .sidebar__logo-mark {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, var(--primary), var(--primary-light));
            border-radius: var(--radius-lg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: var(--shadow-accent);
          }
          .sidebar__logo-mark svg {
            width: 22px;
            height: 22px;
            stroke: white;
          }
          .sidebar__brand-name {
            font-family: var(--font-display);
            font-size: 1.5rem;
            background: linear-gradient(135deg, var(--primary), var(--primary-light));
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
          }
          .sidebar__brand-sub {
            font-family: var(--font-mono);
            font-size: 0.65rem;
            letter-spacing: 1.5px;
            color: var(--text-muted);
          }
          
          /* User info */
          .sidebar__user-info {
            padding: 16px 20px 12px 20px;
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }
          .sidebar__user-role {
            color: var(--primary-light);
          }
          .sidebar__user-divider {
            color: var(--text-muted);
          }
          .sidebar__user-school {
            color: var(--text-primary);
            font-weight: 600;
          }
          
          /* Navigation */
          .sidebar__nav {
            flex: 1;
            padding: 20px 16px;
          }
          .sidebar__nav-label {
            font-family: var(--font-mono);
            font-size: 0.65rem;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: var(--text-muted);
            margin-bottom: 16px;
            padding-left: 12px;
            display: block;
          }
          .sidebar__nav-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .sidebar__nav-item {
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
          .sidebar__nav-icon svg {
            width: 20px;
            height: 20px;
            stroke: currentColor;
          }
          .sidebar__nav-text {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sidebar__nav-item:hover {
            background: var(--primary-pale);
            color: var(--primary-light);
          }
          .sidebar__nav-item--active {
            background: var(--primary-dim);
            color: var(--primary);
            border-left: 3px solid var(--primary);
          }
          .sidebar__nav-badge {
            margin-left: auto;
            background: var(--primary);
            color: white;
            font-size: 0.6rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 40px;
          }
          
          /* Footer */
          .sidebar__footer {
            margin-top: auto;
            padding: 20px 16px 24px;
            border-top: 1px solid var(--border-color);
          }
          .sidebar__weather {
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
          .sidebar__weather-temp {
            font-weight: 700;
            color: var(--primary-light);
          }
          .sidebar__weather-condition::before {
            content: "☀️";
            margin-right: 4px;
          }
          .sidebar__signout {
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
          .sidebar__signout svg {
            width: 18px;
            height: 18px;
          }
          .sidebar__signout:hover {
            background: var(--danger-pale);
            border-color: var(--danger);
            color: var(--danger);
          }
          
          /* Responsive adjustments */
          @media (max-width: 640px) {
            .sidebar {
              width: 260px;
            }
            .sidebar__weather {
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
            <span className="sidebar__weather-condition">{weather.condition}</span>
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
    </>
  );
}