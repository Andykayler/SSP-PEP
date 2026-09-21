// Tour plumbing that is not a component: which steps a dashboard gets, and
// whether this browser has already seen the tour. Kept out of GuidedTour.jsx so
// that file only exports components (fast refresh needs that).
import { ROLE_INTRO, TOUR_CONTENT } from "./tourContent";

const seenKey = (role) => `acalink-tour-seen-${role || "generic"}`;

// Storage can throw (private windows, blocked site data). The tour must still
// run, so every access is guarded and "unknown" reads as "not seen".
export function hasSeenTour(role) {
  try { return localStorage.getItem(seenKey(role)) === "1"; } catch { return false; }
}
export function markTourSeen(role) {
  try { localStorage.setItem(seenKey(role), "1"); } catch { /* not persisted, still works */ }
}

/* ── Steps ──────────────────────────────────────────────────────────────── */

export function buildTourSteps({ role, navItems = [], userName = "", roleLabel = "", hasBell = false }) {
  const content = TOUR_CONTENT[role] || {};
  const first = userName.trim().split(/\s+/)[0];
  const intro = ROLE_INTRO[role];

  const steps = [
    {
      id: "welcome",
      title: first ? `Welcome, ${first}!` : "Welcome!",
      body: `This is a quick tour of your ${roleLabel ? `${roleLabel} ` : ""}dashboard${intro ? `, where you ${intro}` : ""}. We'll go through the modules one at a time.`,
      note: "Use Next or the → key to move on. Press Esc to leave whenever you like.",
      sidebar: false,
    },
    {
      id: "menu",
      target: '[data-tour="sidebar-nav"]',
      title: "Your menu",
      body: "Every module lives in this menu. Pick one and it opens in the workspace to the right. We'll visit them in order.",
      sidebar: true,
    },
  ];

  navItems.forEach((item) => {
    const c = content[item.id] || {};
    steps.push({
      id: `nav-${item.id}`,
      target: `[data-tour="nav-${item.id}"]`,
      tab: item.id,
      sidebar: true,
      title: item.label,
      body: c.body || `Opens ${item.label}.`,
      pressLabel: item.label,
      press: c.press || "when you need it.",
    });
  });

  if (hasBell) {
    steps.push({
      id: "notifications",
      target: '[data-tour="notifications"]',
      sidebar: false,
      title: "Notifications",
      body: "New messages, approvals and reminders land here. Press one to jump straight to the module it is about.",
    });
  }
  steps.push(
    {
      id: "theme",
      target: '[data-tour="theme"]',
      sidebar: false,
      title: "Light or dark",
      body: "Switch between a light and a dark screen, whichever is easier on your eyes.",
    },
    {
      id: "help",
      target: '[data-tour="help"]',
      sidebar: false,
      title: "Need this again?",
      body: "Press this question mark any time to run the tour again.",
    },
    {
      id: "done",
      title: "You're all set",
      body: "That's every module. Explore at your own pace. The tour is one press away if you get lost.",
      sidebar: false,
    },
  );
  return steps;
}

