import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Courses from "@/pages/Courses";

import CourseStudents from "@/pages/CourseStudents";
import Sessions from "@/pages/Sessions";
import Attendance from "@/pages/Attendance";
import Reports from "@/pages/Reports";
import ScanQR from "@/pages/ScanQR";
import SessionQR from "@/pages/SessionQR";
import UsersAdmin from "@/pages/UsersAdmin";
import StudentRegistry from "@/pages/StudentRegistry";
import CourseEnrollments from "@/pages/CourseEnrollments";
import SettingsPage from "@/pages/SettingsPage";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import StudentDepartment from "@/pages/StudentDepartment";
import AdminDepartments from "@/pages/AdminDepartments";
import Notifications from "@/pages/Notifications";
import Excuses from "@/pages/Excuses";
import AdminOtpAuditLog from "@/pages/AdminOtpAuditLog";
import AdminAuditLog from "@/pages/AdminAuditLog";
import MustChangePassword from "@/pages/MustChangePassword";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.must_change_password && window.location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

function RequireRole({
  roles,
  children,
}: {
  roles: Array<"admin" | "lecturer" | "student">;
  children: React.ReactNode;
}) {
  const { role, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">{t("common.loading")}</div>;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<AuthRoute />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route
                  path="/change-password"
                  element={
                    <ProtectedRoute>
                      <MustChangePassword />
                    </ProtectedRoute>
                  }
                />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/courses" element={<RequireRole roles={["admin", "lecturer"]}><Courses /></RequireRole>} />
                  
                  <Route path="/courses/:courseId/students" element={<RequireRole roles={["admin", "lecturer"]}><CourseStudents /></RequireRole>} />
                  <Route path="/sessions" element={<Sessions />} />
                  <Route path="/scan" element={<RequireRole roles={["student"]}><ScanQR /></RequireRole>} />
                  <Route path="/sessions/:sessionId/qr" element={<SessionQR />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/users" element={<RequireRole roles={["admin"]}><UsersAdmin /></RequireRole>} />
                  <Route path="/student-registry" element={<RequireRole roles={["admin"]}><StudentRegistry /></RequireRole>} />
                  <Route path="/enrollments" element={<RequireRole roles={["admin"]}><CourseEnrollments /></RequireRole>} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/my-department" element={<RequireRole roles={["student"]}><StudentDepartment /></RequireRole>} />
                  <Route path="/departments" element={<RequireRole roles={["admin"]}><AdminDepartments /></RequireRole>} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/excuses" element={<Excuses />} />
                  <Route path="/otp-audit" element={<RequireRole roles={["admin"]}><AdminOtpAuditLog /></RequireRole>} />
                  <Route path="/audit-log" element={<RequireRole roles={["admin"]}><AdminAuditLog /></RequireRole>} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

