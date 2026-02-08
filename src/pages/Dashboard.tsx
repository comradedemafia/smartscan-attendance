import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, Users, TrendingUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";

export default function Dashboard() {
  const { role, profile, user } = useAuth();
  const { t } = useI18n();

  const { data: courses = [] } = useQuery({
    queryKey: ["dashboard-courses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dashboard-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, courses(name, code)")
        .order("session_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: enrollmentCounts = {} } = useQuery({
    queryKey: ["dashboard-enrollments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("course_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((e) => {
        counts[e.course_id] = (counts[e.course_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  const activeSessions = sessions.filter((s) => s.status === "active").length;
  const totalStudents = Object.values(enrollmentCounts).reduce((a, b) => a + b, 0);
  const upcomingSessions = sessions.filter(
    (s) => s.status === "scheduled" && new Date(s.session_date) >= new Date(new Date().toDateString())
  );

  const stats = [
    { label: t("dashboard.activeSessions"), value: String(activeSessions), icon: Calendar, color: "text-primary" },
    { label: t("dashboard.totalCourses"), value: String(courses.length), icon: BookOpen, color: "text-accent-foreground" },
    { label: t("dashboard.totalStudents"), value: String(totalStudents), icon: Users, color: "text-primary" },
    { label: t("dashboard.attendanceRate"), value: "—", icon: TrendingUp, color: "text-primary" },
  ];

  const sessionCountByCourse = (courseId: string) =>
    sessions.filter((s) => s.course_id === courseId).length;

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

      {/* Courses */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{t("nav.courses")}</h2>
          <Link to="/courses" className="text-sm text-primary hover:underline">
            {t("common.actions")} →
          </Link>
        </div>
        {courses.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <p className="text-muted-foreground text-sm text-center">{t("courses.empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Card key={course.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">{course.code}</Badge>
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base mt-1">{course.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {course.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {enrollmentCounts[course.id] || 0} {t("courses.students")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {sessionCountByCourse(course.id)} {t("courses.sessions")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Sessions & Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("dashboard.upcomingSessions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingSessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("dashboard.noSessions")}</p>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.slice(0, 5).map((session) => (
                  <div key={session.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(session as any).courses?.code} • {format(new Date(session.session_date), "dd MMM yyyy")}
                      </p>
                    </div>
                    <Badge variant={session.status === "active" ? "default" : "secondary"} className="text-xs shrink-0">
                      {session.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
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
