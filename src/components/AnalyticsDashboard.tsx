import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, BarChart3, Users } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

interface AnalyticsDashboardProps {
  courses: any[];
  sessions: any[];
}

export default function AnalyticsDashboard({ courses, sessions }: AnalyticsDashboardProps) {
  const { user, role } = useAuth();
  const { t } = useI18n();

  const courseIds = useMemo(() => courses.map((c: any) => c.id), [courses]);

  // Fetch all attendance records for relevant sessions
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["analytics-attendance", courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];
      const sessionIds = sessions.filter((s) => courseIds.includes(s.course_id)).map((s) => s.id);
      if (sessionIds.length === 0) return [];
      // Batch in chunks of 100
      const allRecords: any[] = [];
      for (let i = 0; i < sessionIds.length; i += 100) {
        const chunk = sessionIds.slice(i, i + 100);
        const { data } = await supabase
          .from("attendance_records")
          .select("session_id, user_id")
          .in("session_id", chunk);
        if (data) allRecords.push(...data);
      }
      return allRecords;
    },
    enabled: courseIds.length > 0 && sessions.length > 0,
  });

  // Fetch enrollment counts per course
  const { data: enrollments = [] } = useQuery({
    queryKey: ["analytics-enrollments", courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];
      const { data } = await supabase
        .from("course_enrollments")
        .select("course_id, user_id")
        .in("course_id", courseIds);
      return data || [];
    },
    enabled: courseIds.length > 0,
  });

  // Per-module attendance rate
  const moduleStats = useMemo(() => {
    return courses.map((course: any) => {
      const courseSessions = sessions.filter((s) => s.course_id === course.id && s.status !== "scheduled");
      const enrolledCount = enrollments.filter((e) => e.course_id === course.id).length;
      const totalSlots = courseSessions.length * enrolledCount;
      const attended = attendanceRecords.filter((r) =>
        courseSessions.some((s) => s.id === r.session_id)
      ).length;
      const rate = totalSlots > 0 ? Math.round((attended / totalSlots) * 100) : 0;
      return {
        name: course.code,
        fullName: course.name,
        rate,
        sessions: courseSessions.length,
        enrolled: enrolledCount,
        attended,
      };
    }).filter((m) => m.sessions > 0).sort((a, b) => a.rate - b.rate);
  }, [courses, sessions, attendanceRecords, enrollments]);

  // At-risk students (below 75% attendance)
  const atRiskStudents = useMemo(() => {
    if (role === "student") return []; // Students don't see this
    const studentMap = new Map<string, { total: number; attended: number; name?: string; uid?: string }>();
    
    courses.forEach((course: any) => {
      const courseSessions = sessions.filter((s) => s.course_id === course.id && s.status !== "scheduled");
      const enrolledStudents = enrollments.filter((e) => e.course_id === course.id);
      
      enrolledStudents.forEach((e) => {
        if (!studentMap.has(e.user_id)) {
          studentMap.set(e.user_id, { total: 0, attended: 0 });
        }
        const entry = studentMap.get(e.user_id)!;
        entry.total += courseSessions.length;
        entry.attended += attendanceRecords.filter(
          (r) => r.user_id === e.user_id && courseSessions.some((s) => s.id === r.session_id)
        ).length;
      });
    });

    return Array.from(studentMap.entries())
      .map(([userId, data]) => ({
        userId,
        rate: data.total > 0 ? Math.round((data.attended / data.total) * 100) : 0,
        total: data.total,
        attended: data.attended,
      }))
      .filter((s) => s.total > 0 && s.rate < 75)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 10);
  }, [courses, sessions, attendanceRecords, enrollments, role]);

  // Fetch profiles for at-risk students
  const atRiskIds = useMemo(() => atRiskStudents.map((s) => s.userId), [atRiskStudents]);
  const { data: atRiskProfiles = {} } = useQuery({
    queryKey: ["at-risk-profiles", atRiskIds],
    queryFn: async () => {
      if (atRiskIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, university_id")
        .in("id", atRiskIds);
      return Object.fromEntries((data || []).map((p) => [p.id, p]));
    },
    enabled: atRiskIds.length > 0,
  });

  // Weekly trend (last 4 weeks)
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    const weeks: { label: string; rate: number; attended: number; total: number }[] = [];
    
    for (let w = 3; w >= 0; w--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);
      
      const weekSessions = sessions.filter((s) => {
        const d = new Date(s.session_date);
        return d >= weekStart && d < weekEnd && s.status !== "scheduled";
      });
      
      const enrolledPerSession = weekSessions.map((s) =>
        enrollments.filter((e) => e.course_id === s.course_id).length
      );
      const totalSlots = enrolledPerSession.reduce((a, b) => a + b, 0);
      const attended = attendanceRecords.filter((r) =>
        weekSessions.some((s) => s.id === r.session_id)
      ).length;
      
      const rate = totalSlots > 0 ? Math.round((attended / totalSlots) * 100) : 0;
      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ label, rate, attended, total: totalSlots });
    }
    return weeks;
  }, [sessions, attendanceRecords, enrollments]);

  const overallRate = useMemo(() => {
    const totalSlots = moduleStats.reduce((a, m) => a + m.sessions * m.enrolled, 0);
    const totalAttended = moduleStats.reduce((a, m) => a + m.attended, 0);
    return totalSlots > 0 ? Math.round((totalAttended / totalSlots) * 100) : 0;
  }, [moduleStats]);

  if (moduleStats.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        {t("analytics.title")}
      </h2>

      {/* Overall rate + Weekly trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("analytics.overallRate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold">{overallRate}%</div>
              <div className="flex-1">
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${overallRate >= 75 ? "bg-primary" : "bg-destructive"}`}
                    style={{ width: `${overallRate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {moduleStats.reduce((a, m) => a + m.attended, 0)} / {moduleStats.reduce((a, m) => a + m.sessions * m.enrolled, 0)} {t("analytics.slots")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("analytics.weeklyTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={30} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(value: number) => [`${value}%`, t("analytics.rate")]}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {weeklyTrend.map((entry, i) => (
                    <Cell key={i} fill={entry.rate >= 75 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Per-module attendance rates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {t("analytics.perModule")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {moduleStats.map((m) => (
              <div key={m.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate flex-1">{m.name} — {m.fullName}</span>
                  <Badge variant={m.rate >= 75 ? "default" : "destructive"} className="text-xs ml-2">
                    {m.rate}%
                  </Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${m.rate >= 75 ? "bg-primary" : "bg-destructive"}`}
                    style={{ width: `${m.rate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.sessions} {t("analytics.sessions")} · {m.enrolled} {t("courses.students")}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* At-risk students */}
      {role !== "student" && atRiskStudents.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t("analytics.atRisk")} ({atRiskStudents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {atRiskStudents.map((s) => {
                const profile = atRiskProfiles[s.userId];
                return (
                  <div key={s.userId} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">{profile?.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{profile?.university_id || "—"}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="destructive" className="text-xs">{s.rate}%</Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.attended}/{s.total}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
