import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart3, Users, CalendarCheck, Percent, FileDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Reports() {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const [selectedCourse, setSelectedCourse] = useState<string>("");

  // Get courses (lecturer's own or all for admin)
  const { data: courses } = useQuery({
    queryKey: ["report-courses", user?.id, role],
    enabled: !!user && (role === "lecturer" || role === "admin"),
    queryFn: async () => {
      let q = supabase.from("courses").select("id, name, code");
      if (role === "lecturer") q = q.eq("created_by", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Get report data for selected course
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["course-report", selectedCourse],
    enabled: !!selectedCourse,
    queryFn: async () => {
      // Get completed sessions
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title, session_date")
        .eq("course_id", selectedCourse)
        .eq("status", "completed")
        .order("session_date", { ascending: true });

      if (!sessions?.length) return { sessions: [], students: [], chartData: [] };

      const sessionIds = sessions.map((s) => s.id);

      // Get all attendance records
      const { data: records } = await supabase
        .from("attendance_records")
        .select("session_id, user_id, status, scanned_at")
        .in("session_id", sessionIds);

      // Get enrolled students
      const { data: enrollments } = await supabase
        .from("course_enrollments")
        .select("user_id")
        .eq("course_id", selectedCourse);

      const studentIds = [...new Set([
        ...(enrollments || []).map((e) => e.user_id),
        ...(records || []).map((r) => r.user_id),
      ])];

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, university_id")
        .in("id", studentIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      // Student attendance summary
      const studentAttendance = studentIds.map((uid) => {
        const attended = (records || []).filter((r) => r.user_id === uid).length;
        const profile = profileMap[uid];
        return {
          userId: uid,
          name: profile?.full_name || "Unknown",
          universityId: profile?.university_id || "—",
          attended,
          total: sessions.length,
          percentage: sessions.length > 0 ? Math.round((attended / sessions.length) * 100) : 0,
        };
      });

      // Chart data: attendance count per session
      const chartData = sessions.map((s) => ({
        name: s.title.length > 15 ? s.title.slice(0, 15) + "…" : s.title,
        attendance: (records || []).filter((r) => r.session_id === s.id).length,
        date: s.session_date,
      }));

      return {
        sessions,
        students: studentAttendance.sort((a, b) => b.percentage - a.percentage),
        chartData,
        totalRecords: (records || []).length,
      };
    },
  });

  if (role === "student") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.title")}</h1>
        <p className="text-muted-foreground">{t("reports.noData")}</p>
      </div>
    );
  }

  const chartConfig = {
    attendance: { label: t("attendance.attended"), color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6 print-report">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.title")}</h1>
        {selectedCourse && reportData && (
          <Button variant="outline" className="no-print" onClick={() => window.print()}>
            <FileDown className="h-4 w-4 mr-2" />
            {t("reports.exportPdf")}
          </Button>
        )}
      </div>

      {/* Course selector */}
      <Select value={selectedCourse} onValueChange={setSelectedCourse}>
        <SelectTrigger className="w-full max-w-xs">
          <SelectValue placeholder={t("reports.selectCourse")} />
        </SelectTrigger>
        <SelectContent>
          {courses?.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.code} — {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {selectedCourse && reportData && !isLoading && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <CalendarCheck className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{reportData.sessions?.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t("reports.totalSessions")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{reportData.students?.length || 0}</p>
                <p className="text-xs text-muted-foreground">{t("courses.students")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Percent className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">
                  {(() => {
                    const studs = reportData.students || [];
                    if (!studs.length) return 0;
                    const total = studs.map(s => s.percentage).reduce((a, b) => a + b, 0);
                    return Math.round(total / studs.length);
                  })()}
                  %
                </p>
                <p className="text-xs text-muted-foreground">{t("reports.averageRate")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {reportData.chartData && reportData.chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  {t("reports.trend")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                  <BarChart data={reportData.chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="attendance" fill="var(--color-attendance)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Student table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("reports.byStudent")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!reportData.students?.length ? (
                <p className="text-muted-foreground">{t("reports.noData")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("reports.studentName")}</TableHead>
                        <TableHead>{t("reports.universityId")}</TableHead>
                        <TableHead className="text-center">{t("reports.sessionsAttended")}</TableHead>
                        <TableHead className="text-center">{t("reports.percentage")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.students.map((s) => (
                        <TableRow key={s.userId}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.universityId}</TableCell>
                          <TableCell className="text-center">
                            {s.attended}/{s.total}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={s.percentage >= 75 ? "default" : s.percentage >= 50 ? "secondary" : "destructive"}
                            >
                              {s.percentage}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
