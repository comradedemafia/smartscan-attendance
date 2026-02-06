import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Calendar, Users, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { role, profile } = useAuth();
  const { t } = useI18n();

  const stats = [
    { label: t("dashboard.activeSessions"), value: "—", icon: Calendar, color: "text-primary" },
    { label: t("dashboard.totalCourses"), value: "—", icon: BookOpen, color: "text-accent-foreground" },
    { label: t("dashboard.totalStudents"), value: "—", icon: Users, color: "text-primary" },
    { label: t("dashboard.attendanceRate"), value: "—", icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
          {t("dashboard.welcome")}, {profile?.full_name || "User"}
        </h1>
        <p className="text-muted-foreground capitalize">{role} {t("nav.dashboard")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("dashboard.upcomingSessions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{t("dashboard.noSessions")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("dashboard.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">—</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
