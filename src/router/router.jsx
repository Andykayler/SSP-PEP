import { createBrowserRouter } from "react-router-dom";
import Registration from "../pages/registration";
import SignIn from "../pages/signin";
import AcademixLanding from "../pages/landing";
import AdminDashboard from "../pages/admin/admin_dashboard";
import TeacherDashboard from "../pages/teacher/teacherdashboard";
const router = createBrowserRouter([
                {
                    path: "/",
                    element: <AcademixLanding />
                },
                {
                    path: "/register",
                    element: <Registration />
                },
            {
                path:"/signin",
                element: <SignIn />
            },
            {
                path: "/admin",
                element: <AdminDashboard />
            },
            {
                path: "/teacher",
                element: <TeacherDashboard />
            }
            
]);
export default router;