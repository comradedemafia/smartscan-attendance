import NotificationBell from "@/components/NotificationBell";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  ClipboardList,
  BarChart3,
  QrCode,
  Settings,
  LogOut,
  Users,
  Menu,
  X,
  Sun,
  Moon,
  Building2,
  GraduationCap,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const { role, profile, signOut } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard"), roles: ["admin", "lecturer", "student"] },
    { to: "/my-department", icon: GraduationCap, label: t("dept.myDepartment"), roles: ["student"] },
    { to: "/departments", icon: Building2, label: t("dept.departments"), roles: ["admin"] },
    { to: "/courses", icon: BookOpen, label: t("nav.courses"), roles: ["admin", "lecturer"] },
    { to: "/subjects", icon: FileText, label: t("subjects.title"), roles: ["admin", "lecturer"] },
    { to: "/sessions", icon: Calendar, label: t("nav.sessions"), roles: ["admin", "lecturer", "student"] },
    { to: "/scan", icon: QrCode, label: t("nav.scanQr"), roles: ["student"] },
    { to: "/attendance", icon: ClipboardList, label: t("nav.attendance"), roles: ["admin", "lecturer", "student"] },
    { to: "/reports", icon: BarChart3, label: t("nav.reports"), roles: ["admin", "lecturer"] },
    { to: "/enrollments", icon: Users, label: t("courses.enroll"), roles: ["admin"] },
    { to: "/users", icon: Users, label: t("nav.users"), roles: ["admin"] },
    { to: "/settings", icon: Settings, label: t("nav.settings"), roles: ["admin", "lecturer", "student"] },
  ];

  const filteredNav = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar-background text-sidebar-foreground flex flex-col transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
          <QrCode className="h-7 w-7 text-sidebar-primary" />
          <span className="font-bold text-lg font-['Space_Grotesk'] text-sidebar-primary-foreground">
            AAS
          </span>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-sidebar-foreground/70">EN / SW</Label>
            <Switch
              checked={language === "sw"}
              onCheckedChange={(checked) => setLanguage(checked ? "sw" : "en")}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-sidebar-foreground/70">{t("settings.appearance")}</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
          <div className="text-xs text-sidebar-foreground/60 truncate">
            {profile?.full_name} • {role}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("auth.logout")}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background lg:px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          {role === "student" && <NotificationBell />}
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
