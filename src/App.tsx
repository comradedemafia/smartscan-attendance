import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n";
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
import CourseEnrollments from "@/pages/CourseEnrollments";
import SettingsPage from "@/pages/SettingsPage";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import StudentDepartment from "@/pages/StudentDepartment";
import AdminDepartments from "@/pages/AdminDepartments";
import Notifications from "@/pages/Notifications";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
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
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/courses" element={<Courses />} />
                  
                  <Route path="/courses/:courseId/students" element={<CourseStudents />} />
                  <Route path="/sessions" element={<Sessions />} />
                  <Route path="/scan" element={<ScanQR />} />
                  <Route path="/sessions/:sessionId/qr" element={<SessionQR />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/users" element={<UsersAdmin />} />
                  <Route path="/enrollments" element={<CourseEnrollments />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/my-department" element={<StudentDepartment />} />
                  <Route path="/departments" element={<AdminDepartments />} />
                  <Route path="/notifications" element={<Notifications />} />
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

