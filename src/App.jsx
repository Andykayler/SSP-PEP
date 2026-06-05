import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AcademixLanding    from "./pages/AcademixLanding";
import SignIn             from "./pages/SignIn";
import SchoolRegistration from "./pages/SchoolRegistration";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page */}
        <Route path="/"                 element={<AcademixLanding />} />

        {/* Auth */}
        <Route path="/signin"           element={<SignIn />} />
        <Route path="/register-school"  element={<SchoolRegistration />} />

        {/* Catch-all → back to home */}
        <Route path="*"                 element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}