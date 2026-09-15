// demo/lib/webAuth.js
// Logs into the real /signin page as a given staff role, human-speed, and
// waits for the redirect to that role's dashboard. No shortcuts — this drives
// the actual Firebase Auth + Firestore role check in src/pages/signin.jsx.
import { env } from "./env.js";
import { humanType, humanClick, beat } from "./humanize.js";

const DASHBOARD_PATH = {
  admin: "/admin", headteacher: "/head", teacher: "/teacher", bursar: "/bursar",
};

/**
 * `mobile: true` (the vertical/CostWorth profile) changes only the
 * "logged in and ready" signal: below the 1024px breakpoint the sidebar's
 * nav buttons are off-canvas until the hamburger opens them (see nav.js), so
 * waiting on `button.sb-nav-btn` would hang. The topbar hamburger button
 * itself is the mobile-layout equivalent — it only exists/is visible in that
 * layout — so it's what proves the dashboard shell rendered.
 */
export async function signInAs(page, roleKey, { mobile = false } = {}) {
  const creds = env[roleKey];
  // Not "networkidle": Firestore holds its socket open indefinitely, so that
  // event never fires. Wait for the actual form instead.
  await page.goto(`${env.baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  await beat(page, 500);

  const emailField = page.getByPlaceholder("your@school.mw");
  const pwField = page.getByPlaceholder("Enter your password");
  await emailField.waitFor({ state: "visible", timeout: 20_000 });

  await humanType(emailField, creds.email);
  await beat(page, 300);
  await humanType(pwField, creds.password);
  await beat(page, 400);

  const submit = page.locator("button.submit-btn[type='submit']");
  await humanClick(submit, { pauseAfter: 200 });

  await page.waitForURL(`**${DASHBOARD_PATH[roleKey]}**`, { timeout: 20_000 });
  // The dashboard shell rendering is "logged in and ready", not idle network
  // — the same Firestore-socket reason as above.
  const readySelector = mobile ? ".topbar__menu-btn" : "button.sb-nav-btn";
  await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 20_000 });
  await beat(page, 800);
}
