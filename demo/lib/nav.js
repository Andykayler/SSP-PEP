// demo/lib/nav.js
// Every role dashboard (teacher/head/bursar) shares the same DashboardShell +
// Sidebar (src/pages/admin/side_bar.jsx), whose nav buttons are
// `button.sb-nav-btn` containing the item's label text — one helper for all.
import { humanClick, beat } from "./humanize.js";

export async function goToTab(page, label) {
  const btn = page.locator("button.sb-nav-btn", { hasText: label }).first();
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  await humanClick(btn, { pauseAfter: 500 });
  // Not "networkidle" — Firestore's open socket means it never fires.
  await beat(page, 900);
}

// ── Mobile (vertical/CostWorth) navigation ───────────────────────────────────
// Below the app's 1024px responsive breakpoint the sidebar is off-canvas
// (`.sidebar { transform: translateX(-100%) }` — src/pages/admin/side_bar.css)
// until the topbar hamburger opens it. Its nav buttons exist in the DOM the
// whole time but sit off-screen, so clicking them without opening the tray
// first would fail (or, worse, silently "click" at an off-viewport point).
// This is the actual mechanical difference a vertical reshoot is driving —
// not a viewport number, a different real interaction.
export async function openMobileMenu(page) {
  const menuBtn = page.locator(".topbar__menu-btn");
  await menuBtn.waitFor({ state: "visible", timeout: 15_000 });
  await humanClick(menuBtn, { pauseAfter: 400 });
}

/** Opens the hamburger tray, then taps a nav item — DashboardShell closes the
 * tray itself on tab change (see handleTabChange), so no explicit close step. */
export async function goToTabMobile(page, label) {
  await openMobileMenu(page);
  const btn = page.locator("button.sb-nav-btn", { hasText: label }).first();
  await btn.waitFor({ state: "visible", timeout: 15_000 });
  await humanClick(btn, { pauseAfter: 500 });
  await beat(page, 900);
}
