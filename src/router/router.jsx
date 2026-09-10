import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import Registration from "../pages/registration";
import SignIn from "../pages/signin";
import AcademixLanding from "../pages/landing";

// The four dashboards are the bulk of the bundle, and nobody loads more than
// one of them — a bursar never pulls in the head teacher's modules. Splitting
// here means the landing and sign-in pages, which is all a first-time visitor
// sees, no longer wait on code for portals they may never open.
const AdminDashboard = lazy(() => import("../pages/admin/admin_dashboard"));
const TeacherDashboard = lazy(() => import("../pages/teacher/teacherdashboard"));
const HeadteacherDashboard = lazy(() => import("../pages/headteacher/dashboard"));
const BursarDashboard = lazy(() => import("../pages/burser/burser"));
const DirectorDashboard = lazy(() => import("../pages/director/dashboard"));

// Where PayChangu returns the payer's browser. Split out too: it is reached
// once per payment, from an external redirect, and has nothing to do with the
// portal chunk the payer happened to start from.
const PayReturn = lazy(() => import("../pages/PayReturn"));

// Matches the loading state the dashboards render themselves while they check
// auth, so a split chunk arriving is visually indistinguishable from the auth
// round-trip that follows it.
function PortalFallback() {
  return (
    <div className="page-loading">
      <div className="page-loading__spinner" />
      <p className="page-loading__text">Loading your dashboard…</p>
    </div>
  );
}

const portal = (element) => (
  <Suspense fallback={<PortalFallback />}>{element}</Suspense>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AcademixLanding />,
  },
  {
    path: "/register",
    element: <Registration />,
  },
  {
    path: "/signin",
    element: <SignIn />,
  },
  {
    path: "/admin",
    element: portal(<AdminDashboard />),
  },
  {
    path: "/teacher",
    element: portal(<TeacherDashboard />),
  },
  {
    path: "/head",
    element: portal(<HeadteacherDashboard />),
  },
  {
    path: "/bursar",
    element: portal(<BursarDashboard />),
  },
  {
    path: "/director",
    element: portal(<DirectorDashboard />),
  },
  {
    path: "/pay/return",
    element: portal(<PayReturn />),
  },
]);

export default router;
