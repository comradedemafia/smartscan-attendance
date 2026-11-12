import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, CalendarCheck, Percent, FileDown, FileSpreadsheet, User, Building2, BookOpen, GraduationCap, CalendarRange, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportToPDF, exportToExcel } from "@/lib/exportReports";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Reports() {
  const { t, localeCode } = useI18n();
  const { user, role } = useAuth();
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedLevelModule, setSelectedLevelModule] = useState<string>("");
  const [activeTab, setActiveTab] = useState(role === "admin" ? "department" : "level");
  // Date range filter (applied to course & student tabs)
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  // Verification filters (applied to course tab)
  const [onlyLocationVerified, setOnlyLocationVerified] = useState(false);
  const [onlyQrVerified, setOnlyQrVerified] = useState(false);
  // Lecturer filter (admin only) — narrows the module dropdown
  const [selectedLecturer, setSelectedLecturer] = useState<string>("");

  // Departments (admin only)
  const { data: departments = [] } = useQuery({
    queryKey: ["report-departments"],
    enabled: !!user && role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["report-courses", user?.id, role],
    enabled: !!user && (role === "lecturer" || role === "admin"),
    queryFn: async () => {
      let q = supabase.from("courses").select("id, name, code, created_by, department_id, level_id");
      if (role === "lecturer") q = q.eq("created_by", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Lecturers list (admin only) for lecturer filter
  const { data: lecturers = [] } = useQuery({
    queryKey: ["report-lecturers"],
    enabled: !!user && role === "admin",
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles").select("user_id").eq("role", "lecturer");
      const ids = (roleRows || []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles").select("id, full_name, university_id").in("id", ids).order("full_name");
      return data || [];
    },
  });

  // Filter modules dropdown by selected lecturer (admin only)
  const filteredCourses = (courses || []).filter((c: any) =>
    !selectedLecturer || c.created_by === selectedLecturer
  );

  // Levels
  const { data: levels = [] } = useQuery({
    queryKey: ["report-levels"],
    enabled: !!user && (role === "admin" || role === "lecturer"),
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("id, name, code, sort_order, department_id").order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  // Modules filtered by selected level
  const levelModules = (courses || []).filter((c: any) => c.level_id === selectedLevel);

  // Department report
  const { data: deptReport, isLoading: deptLoading } = useQuery({
    queryKey: ["dept-report", selectedDepartment],
    enabled: !!selectedDepartment && activeTab === "department" && role === "admin",
    queryFn: async () => {
      // Get courses in this department
      const { data: deptCourses } = await supabase.from("courses")
        .select("id, name, code, department_id").eq("department_id", selectedDepartment);
      if (!deptCourses?.length) return { courses: [], lecturers: [], students: 0, totalSessions: 0, avgRate: 0 };

      const courseIds = deptCourses.map(c => c.id);

      // Get lecturers via course_lecturers
      const { data: clData } = await supabase.from("course_lecturers")
        .select("lecturer_id, course_id, profiles(full_name, university_id)")
        .in("course_id", courseIds);

      const lecturerMap = new Map<string, { name: string; uid: string; courses: string[] }>();
      (clData || []).forEach((cl: any) => {
        if (!lecturerMap.has(cl.lecturer_id)) {
          lecturerMap.set(cl.lecturer_id, { name: cl.profiles?.full_name || "", uid: cl.profiles?.university_id || "", courses: [] });
        }
        const course = deptCourses.find(c => c.id === cl.course_id);
        if (course) lecturerMap.get(cl.lecturer_id)!.courses.push(course.code);
      });

      // Get enrollments
      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("user_id").in("course_id", courseIds);
      const uniqueStudents = new Set((enrollments || []).map(e => e.user_id));

      // Get sessions and attendance
      const { data: sessions } = await supabase.from("sessions")
        .select("id").in("course_id", courseIds).eq("status", "completed");
      const sessionIds = (sessions || []).map(s => s.id);
      let totalRecords = 0;
      if (sessionIds.length > 0) {
        const { data: records } = await supabase.from("attendance_records")
          .select("id").in("session_id", sessionIds);
        totalRecords = (records || []).length;
      }
      const totalPossible = sessionIds.length * uniqueStudents.size;
      const avgRate = totalPossible > 0 ? Math.round((totalRecords / totalPossible) * 100) : 0;

      // Course stats
      const courseStats = await Promise.all(deptCourses.map(async (course) => {
        const { data: cSessions } = await supabase.from("sessions")
          .select("id").eq("course_id", course.id).eq("status", "completed");
        const cSessionIds = (cSessions || []).map(s => s.id);
        const { data: cEnrollments } = await supabase.from("course_enrollments")
          .select("user_id").eq("course_id", course.id);
        const cStudents = (cEnrollments || []).length;
        let cRecords = 0;
        if (cSessionIds.length > 0) {
          const { data: recs } = await supabase.from("attendance_records")
            .select("id").in("session_id", cSessionIds);
          cRecords = (recs || []).length;
        }
        const cPossible = cSessionIds.length * cStudents;
        return {
          ...course,
          totalSessions: cSessionIds.length,
          totalStudents: cStudents,
          avgRate: cPossible > 0 ? Math.round((cRecords / cPossible) * 100) : 0,
        };
      }));

      return {
        courses: courseStats,
        lecturers: Array.from(lecturerMap.values()),
        students: uniqueStudents.size,
        totalSessions: sessionIds.length,
        avgRate,
      };
    },
  });

  // Course report data
  const { data: reportData, isLoading } = useQuery({
    queryKey: ["course-report", selectedCourse, dateFrom, dateTo, onlyLocationVerified, onlyQrVerified],
    enabled: !!selectedCourse && activeTab === "course",
    queryFn: async () => {
      let sq = supabase
        .from("sessions").select("id, title, session_date, latitude, longitude, qr_code_secret, qr_expires_at")
        .eq("course_id", selectedCourse).eq("status", "completed");
      if (dateFrom) sq = sq.gte("session_date", dateFrom);
      if (dateTo) sq = sq.lte("session_date", dateTo);
      if (onlyLocationVerified) {
        sq = sq.not("latitude", "is", null).not("longitude", "is", null);
      }
      if (onlyQrVerified) {
        sq = sq.not("qr_code_secret", "is", null);
      }
      const { data: sessions } = await sq.order("session_date", { ascending: true });

      if (!sessions?.length) return { sessions: [], students: [], chartData: [] };

      const sessionIds = sessions.map((s) => s.id);
      const { data: records } = await supabase.from("attendance_records")
        .select("session_id, user_id, status, scanned_at").in("session_id", sessionIds);

      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("user_id").eq("course_id", selectedCourse);

      // Fetch approved excuses for these sessions
      const { data: excuses } = await supabase.from("excuses")
        .select("session_id, user_id, status")
        .in("session_id", sessionIds)
        .eq("status", "approved");

      const excuseSet = new Set((excuses || []).map((e) => `${e.user_id}_${e.session_id}`));

      const allUserIds = [...new Set([
        ...(enrollments || []).map((e) => e.user_id),
        ...(records || []).map((r) => r.user_id),
      ])];

      // Filter to only students (exclude lecturers and admins)
      const { data: studentRoles } = await supabase.from("user_roles")
        .select("user_id").in("user_id", allUserIds).eq("role", "student");
      const studentIds = (studentRoles || []).map((r) => r.user_id);

      const { data: profiles } = studentIds.length > 0
        ? await supabase.from("profiles")
          .select("id, full_name, university_id, gender").in("id", studentIds)
        : { data: [] };

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      const studentAttendance = studentIds.map((uid) => {
        const attended = (records || []).filter((r) => r.user_id === uid).length;
        const excused = sessions.filter((s) => excuseSet.has(`${uid}_${s.id}`)).length;
        const profile = profileMap[uid];
        return {
          userId: uid, name: profile?.full_name || t("common.unknown"),
          universityId: profile?.university_id || "—", gender: profile?.gender || "—",
          attended, excused, total: sessions.length,
          percentage: sessions.length > 0 ? Math.round((attended / sessions.length) * 100) : 0,
        };
      });

      const chartData = sessions.map((s) => ({
        name: s.title.length > 15 ? s.title.slice(0, 15) + "…" : s.title,
        attendance: (records || []).filter((r) => r.session_id === s.id).length,
        date: s.session_date,
      }));

      return {
        sessions, students: studentAttendance.sort((a, b) => b.percentage - a.percentage),
        chartData, totalRecords: (records || []).length,
      };
    },
  });

  // Individual student report
  const { data: studentReport, isLoading: studentLoading } = useQuery({
    queryKey: ["student-report", selectedStudent, dateFrom, dateTo],
    enabled: !!selectedStudent && activeTab === "student",
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles")
        .select("id, full_name, university_id, gender, email").eq("id", selectedStudent).single();

      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("course_id, courses(id, name, code)").eq("user_id", selectedStudent);

      const courseResults = await Promise.all((enrollments || []).map(async (e: any) => {
        let sq = supabase.from("sessions")
          .select("id, title, session_date").eq("course_id", e.course_id).eq("status", "completed");
        if (dateFrom) sq = sq.gte("session_date", dateFrom);
        if (dateTo) sq = sq.lte("session_date", dateTo);
        const { data: sessions } = await sq;
        const sessionIds = (sessions || []).map((s) => s.id);
        const { data: records } = sessionIds.length > 0
          ? await supabase.from("attendance_records").select("session_id")
              .eq("user_id", selectedStudent).in("session_id", sessionIds)
          : { data: [] };
        return {
          courseId: e.course_id, courseName: e.courses?.name || "", courseCode: e.courses?.code || "",
          totalSessions: (sessions || []).length, attended: (records || []).length,
          percentage: (sessions || []).length > 0 ? Math.round(((records || []).length / (sessions || []).length) * 100) : 0,
        };
      }));

      return { profile, courses: courseResults };
    },
  });

  // All students list for individual report dropdown
  const { data: allStudents = [] } = useQuery({
    queryKey: ["report-all-students", user?.id, role],
    enabled: !!user && (role === "lecturer" || role === "admin") && activeTab === "student",
    queryFn: async () => {
      if (role === "admin") {
        // Only show students, not lecturers or admins
        const { data: studentRoleIds } = await supabase.from("user_roles").select("user_id").eq("role", "student");
        const sIds = (studentRoleIds || []).map((r) => r.user_id);
        if (!sIds.length) return [];
        const { data } = await supabase.from("profiles").select("id, full_name, university_id").in("id", sIds).order("full_name");
        return data || [];
      }
      const { data: myCourses } = await supabase.from("courses").select("id").eq("created_by", user!.id);
      if (!myCourses?.length) return [];
      const courseIds = myCourses.map((c) => c.id);
      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("user_id").in("course_id", courseIds);
      const userIds = [...new Set((enrollments || []).map((e) => e.user_id))];
      if (!userIds.length) return [];
      const { data: profiles } = await supabase.from("profiles")
        .select("id, full_name, university_id").in("id", userIds).order("full_name");
      return profiles || [];
    },
  });

  // All courses report data
  const { data: allCoursesReport } = useQuery({
    queryKey: ["all-courses-report", user?.id, role],
    enabled: !!user && (role === "lecturer" || role === "admin") && activeTab === "all",
    queryFn: async () => {
      let q = supabase.from("courses").select("id, name, code, created_by");
      if (role === "lecturer") q = q.eq("created_by", user!.id);
      const { data: myCourses } = await q;
      if (!myCourses?.length) return [];

      return Promise.all(myCourses.map(async (course) => {
        const { data: sessions } = await supabase.from("sessions")
          .select("id").eq("course_id", course.id).eq("status", "completed");
        const sessionIds = (sessions || []).map((s) => s.id);
        const { data: enrollments } = await supabase.from("course_enrollments")
          .select("user_id").eq("course_id", course.id);
        const totalStudents = (enrollments || []).length;

        let avgRate = 0;
        if (sessionIds.length > 0 && totalStudents > 0) {
          const { data: records } = await supabase.from("attendance_records")
            .select("id").in("session_id", sessionIds);
          const totalPossible = sessionIds.length * totalStudents;
          avgRate = Math.round(((records || []).length / totalPossible) * 100);
        }

        const { data: lecturerProfile } = await supabase.from("profiles")
          .select("full_name").eq("id", course.created_by).single();

        return { ...course, lecturerName: lecturerProfile?.full_name || "—", totalSessions: sessionIds.length, totalStudents, avgRate };
      }));
    },
  });

  if (role === "student") {
    return <StudentReportView t={t} localeCode={localeCode} userId={user!.id} />;
  }

  const chartConfig = { attendance: { label: t("attendance.attended"), color: "hsl(var(--primary))" } };

  const handleExport = (format: "pdf" | "excel") => {
    const run = format === "pdf" ? exportToPDF : exportToExcel;
    const fn = (data: Parameters<typeof run>[0]) => run({
      ...data,
      locale: localeCode,
      labels: {
        filters: t("reports.filters"),
        generated: t("reports.generated"),
        period: t("reports.period"),
        sheet: t("reports.report"),
      },
    });
    const dateRange = (dateFrom || dateTo) ? { from: dateFrom, to: dateTo } : undefined;
    const courseFilters: string[] = [];
    if (activeTab === "course") {
      if (onlyLocationVerified) courseFilters.push(t("reports.locationVerifiedOnly"));
      if (onlyQrVerified) courseFilters.push(t("reports.qrVerifiedOnly"));
      if (selectedLecturer) {
        const lec = lecturers.find((l: any) => l.id === selectedLecturer);
        if (lec) courseFilters.push(`${t("auth.lecturer")}: ${lec.full_name}`);
      }
    }

    if (activeTab === "department" && deptReport) {
      fn({
        title: t("reports.byDepartment"),
        subtitle: departments.find((d) => d.id === selectedDepartment)?.name,
        columns: [
          { header: t("courses.code"), key: "code" },
          { header: t("courses.name"), key: "name" },
          { header: t("reports.totalSessions"), key: "totalSessions" },
          { header: t("courses.students"), key: "totalStudents" },
          { header: t("reports.averageRate"), key: "avgRate" },
        ],
        rows: deptReport.courses.map((c: any) => ({ ...c, avgRate: `${c.avgRate}%` })),
      });
    } else if (activeTab === "course" && reportData?.students) {
      const courseName = courses?.find((c) => c.id === selectedCourse);
      fn({
        title: t("reports.byCourse"),
        subtitle: courseName ? `${courseName.code} — ${courseName.name}` : undefined,
        dateRange,
        filters: courseFilters,
        columns: [
          { header: t("reports.studentName"), key: "name" },
          { header: t("reports.universityId"), key: "universityId" },
          { header: t("reports.gender"), key: "gender" },
          { header: t("reports.sessionsAttended"), key: "sessions" },
          { header: t("reports.excused"), key: "excused" },
          { header: t("reports.percentage"), key: "percentage" },
        ],
        rows: reportData.students.map((s) => ({
          ...s, sessions: `${s.attended}/${s.total}`, excused: s.excused || 0, percentage: `${s.percentage}%`,
        })),
      });
    } else if (activeTab === "student" && studentReport) {
      fn({
        title: t("reports.studentReport"),
        subtitle: `${studentReport.profile?.full_name} (${studentReport.profile?.university_id})`,
        dateRange,
        columns: [
          { header: t("courses.code"), key: "courseCode" },
          { header: t("courses.name"), key: "courseName" },
          { header: t("reports.sessionsAttended"), key: "sessions" },
          { header: t("reports.percentage"), key: "percentage" },
        ],
        rows: studentReport.courses.map((c: any) => ({
          ...c, sessions: `${c.attended}/${c.totalSessions}`, percentage: `${c.percentage}%`,
        })),
      });
    } else if (activeTab === "all" && allCoursesReport) {
      fn({
        title: t("reports.exportAll"),
        columns: [
          { header: t("courses.code"), key: "code" },
          { header: t("courses.name"), key: "name" },
          { header: t("auth.lecturer"), key: "lecturerName" },
          { header: t("reports.totalSessions"), key: "totalSessions" },
          { header: t("courses.students"), key: "totalStudents" },
          { header: t("reports.averageRate"), key: "avgRate" },
        ],
        rows: allCoursesReport.map((c) => ({ ...c, avgRate: `${c.avgRate}%` })),
      });
    }
  };

  return (
    <div className="space-y-6 print-report">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.title")}</h1>
        <div className="flex gap-2 no-print">
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FileDown className="h-4 w-4 mr-2" />{t("reports.exportPdf")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />{t("reports.exportExcel")}
          </Button>
        </div>
      </div>

      {/* Date range filter — applies to Course & Student tabs */}
      {(activeTab === "course" || activeTab === "student") && (
        <Card className="no-print">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 mr-2 text-sm font-medium">
                <CalendarRange className="h-4 w-4 text-primary" />
                {t("reports.dateRange")}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.from")}</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[170px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.to")}</Label>
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[170px]"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  {t("reports.clearDates")}
                </Button>
              )}
              {(dateFrom || dateTo) && (
                <Badge variant="secondary" className="ml-auto">
                  {t("reports.filteredBy")}: {dateFrom || "…"} → {dateTo || "…"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="no-print">
        <TabsList className="flex-wrap">
          {role === "admin" && <TabsTrigger value="department">{t("reports.byDepartment")}</TabsTrigger>}
          <TabsTrigger value="level">{t("reports.byLevel")}</TabsTrigger>
          <TabsTrigger value="course">{t("reports.byCourse")}</TabsTrigger>
          <TabsTrigger value="student">{t("reports.individualReport")}</TabsTrigger>
          <TabsTrigger value="all">{t("reports.exportAll")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Department Report Tab (Admin only) ── */}
      {activeTab === "department" && role === "admin" && (
        <>
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-full max-w-xs no-print">
              <SelectValue placeholder={t("reports.selectDepartment")} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {deptLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

          {selectedDepartment && deptReport && !deptLoading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <BookOpen className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{deptReport.courses.length}</p>
                    <p className="text-xs text-muted-foreground">{t("reports.deptCourses")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{deptReport.lecturers.length}</p>
                    <p className="text-xs text-muted-foreground">{t("reports.deptLecturers")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{deptReport.students}</p>
                    <p className="text-xs text-muted-foreground">{t("reports.deptStudents")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Percent className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{deptReport.avgRate}%</p>
                    <p className="text-xs text-muted-foreground">{t("reports.averageRate")}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Lecturers in department */}
              {deptReport.lecturers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t("reports.deptLecturers")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("reports.studentName")}</TableHead>
                            <TableHead>{t("reports.universityId")}</TableHead>
                            <TableHead>{t("dept.courses")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deptReport.lecturers.map((l, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{l.name}</TableCell>
                              <TableCell>{l.uid}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {l.courses.map((c, j) => (
                                    <Badge key={j} variant="outline" className="text-xs">{c}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Courses in department */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("reports.deptCourses")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {deptReport.courses.length === 0 ? (
                    <p className="text-muted-foreground">{t("reports.noData")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("courses.code")}</TableHead>
                            <TableHead>{t("courses.name")}</TableHead>
                            <TableHead className="text-center">{t("reports.totalSessions")}</TableHead>
                            <TableHead className="text-center">{t("courses.students")}</TableHead>
                            <TableHead className="text-center">{t("reports.averageRate")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deptReport.courses.map((c: any) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono text-sm">{c.code}</TableCell>
                              <TableCell className="font-medium">{c.name}</TableCell>
                              <TableCell className="text-center">{c.totalSessions}</TableCell>
                              <TableCell className="text-center">{c.totalStudents}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={c.avgRate >= 75 ? "default" : c.avgRate >= 50 ? "secondary" : "destructive"}>
                                  {c.avgRate}%
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
        </>
      )}

      {/* ── Level/Programme Report Tab ── */}
      {activeTab === "level" && (
        <>
          <div className="flex flex-wrap gap-3">
            <Select value={selectedLevel} onValueChange={(v) => { setSelectedLevel(v); setSelectedLevelModule(""); }}>
              <SelectTrigger className="w-full max-w-xs no-print">
                <SelectValue placeholder={t("reports.selectLevel")} />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      {l.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedLevel && levelModules.length > 0 && (
              <Select value={selectedLevelModule} onValueChange={setSelectedLevelModule}>
                <SelectTrigger className="w-full max-w-xs no-print">
                  <SelectValue placeholder={t("reports.selectModule")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-modules">{t("reports.levelModules")}</SelectItem>
                  {levelModules.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedLevel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  {t("reports.levelModules")} — {levels.find(l => l.id === selectedLevel)?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {levelModules.length === 0 ? (
                  <p className="text-muted-foreground">{t("reports.noData")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("courses.code")}</TableHead>
                          <TableHead>{t("courses.name")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {levelModules.map((c: any) => (
                          <TableRow
                            key={c.id}
                            className={selectedLevelModule === c.id ? "bg-primary/5" : "cursor-pointer hover:bg-muted/50"}
                            onClick={() => setSelectedLevelModule(c.id)}
                          >
                            <TableCell className="font-mono text-sm">{c.code}</TableCell>
                            <TableCell className="font-medium">{c.name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedLevelModule && selectedLevelModule !== "all-modules" && (
            <p className="text-sm text-muted-foreground">
              {t("reports.byCourse")}: {levelModules.find((c: any) => c.id === selectedLevelModule)?.name} —{" "}
              <Button variant="link" className="h-auto p-0 ml-1" onClick={() => { setActiveTab("course"); setSelectedCourse(selectedLevelModule); }}>
                {t("reports.courseReport")} →
              </Button>
            </p>
          )}
        </>
      )}

      {/* ── Course Report Tab ── */}
      {activeTab === "course" && (
        <>
          <Card className="no-print">
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                {role === "admin" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("auth.lecturer")}</Label>
                    <Select
                      value={selectedLecturer || "all"}
                      onValueChange={(v) => {
                        setSelectedLecturer(v === "all" ? "" : v);
                        setSelectedCourse("");
                      }}
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder={t("reports.selectLecturer")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("reports.allLecturers")}</SelectItem>
                        {lecturers.map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.full_name} ({l.university_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("reports.selectCourse")}</Label>
                  <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder={t("reports.selectCourse")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCourses.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {t("reports.noData")}
                        </div>
                      )}
                      {filteredCourses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("reports.verificationFilters")}:
                </span>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyLocationVerified}
                    onChange={(e) => setOnlyLocationVerified(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t("reports.locationVerifiedOnly")}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyQrVerified}
                    onChange={(e) => setOnlyQrVerified(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t("reports.qrVerifiedOnly")}
                </label>
                {(onlyLocationVerified || onlyQrVerified) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setOnlyLocationVerified(false); setOnlyQrVerified(false); }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />{t("reports.clearFilters")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

          {selectedCourse && reportData && !isLoading && (
            <>
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
                        return Math.round(studs.reduce((a, b) => a + b.percentage, 0) / studs.length);
                      })()}%
                    </p>
                    <p className="text-xs text-muted-foreground">{t("reports.averageRate")}</p>
                  </CardContent>
                </Card>
              </div>

              {reportData.chartData && reportData.chartData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BarChart3 className="h-5 w-5" />{t("reports.trend")}
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
                            <TableHead>{t("reports.gender")}</TableHead>
                            <TableHead className="text-center">{t("reports.sessionsAttended")}</TableHead>
                            <TableHead className="text-center">{t("reports.excused")}</TableHead>
                            <TableHead className="text-center">{t("reports.percentage")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.students.map((s) => (
                            <TableRow key={s.userId}>
                              <TableCell className="font-medium">{s.name}</TableCell>
                              <TableCell>{s.universityId}</TableCell>
                              <TableCell>
                                <Badge variant={s.gender === "M" ? "default" : s.gender === "F" ? "secondary" : "outline"}>
                                  {s.gender === "M" ? t("auth.male") : s.gender === "F" ? t("auth.female") : "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">{s.attended}/{s.total}</TableCell>
                              <TableCell className="text-center">
                                {s.excused > 0 ? (
                                  <Badge variant="secondary">{s.excused}</Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={s.percentage >= 75 ? "default" : s.percentage >= 50 ? "secondary" : "destructive"}>
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
        </>
      )}

      {/* ── Individual Student Report Tab ── */}
      {activeTab === "student" && (
        <>
          <Select value={selectedStudent} onValueChange={setSelectedStudent}>
            <SelectTrigger className="w-full max-w-xs no-print">
              <SelectValue placeholder={t("reports.selectStudent")} />
            </SelectTrigger>
            <SelectContent>
              {allStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.university_id})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {studentLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

          {selectedStudent && studentReport && !studentLoading && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />{t("reports.studentReport")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p><strong>{t("reports.studentName")}:</strong> {studentReport.profile?.full_name}</p>
                  <p><strong>{t("reports.universityId")}:</strong> {studentReport.profile?.university_id}</p>
                  <p><strong>{t("auth.email")}:</strong> {studentReport.profile?.email || "—"}</p>
                  <p><strong>{t("reports.gender")}:</strong> {studentReport.profile?.gender === "M" ? t("auth.male") : studentReport.profile?.gender === "F" ? t("auth.female") : "—"}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("reports.byCourse")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {studentReport.courses.length === 0 ? (
                    <p className="text-muted-foreground">{t("reports.noData")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("courses.code")}</TableHead>
                            <TableHead>{t("courses.name")}</TableHead>
                            <TableHead className="text-center">{t("reports.sessionsAttended")}</TableHead>
                            <TableHead className="text-center">{t("reports.percentage")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentReport.courses.map((c: any) => (
                            <TableRow key={c.courseId}>
                              <TableCell className="font-mono text-sm">{c.courseCode}</TableCell>
                              <TableCell className="font-medium">{c.courseName}</TableCell>
                              <TableCell className="text-center">{c.attended}/{c.totalSessions}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={c.percentage >= 75 ? "default" : c.percentage >= 50 ? "secondary" : "destructive"}>
                                  {c.percentage}%
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
        </>
      )}

      {/* ── All Courses Report Tab ── */}
      {activeTab === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("reports.exportAll")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!allCoursesReport?.length ? (
              <p className="text-muted-foreground">{t("reports.noData")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("courses.code")}</TableHead>
                      <TableHead>{t("courses.name")}</TableHead>
                      <TableHead>{t("auth.lecturer")}</TableHead>
                      <TableHead className="text-center">{t("reports.totalSessions")}</TableHead>
                      <TableHead className="text-center">{t("courses.students")}</TableHead>
                      <TableHead className="text-center">{t("reports.averageRate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCoursesReport.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-sm">{c.code}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.lecturerName}</TableCell>
                        <TableCell className="text-center">{c.totalSessions}</TableCell>
                        <TableCell className="text-center">{c.totalStudents}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.avgRate >= 75 ? "default" : c.avgRate >= 50 ? "secondary" : "destructive"}>
                            {c.avgRate}%
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
      )}
    </div>
  );
}

// ============================================================================
// Student Report View — per-module + general summary + daily sessions
// ============================================================================
function StudentReportView({ t, localeCode, userId }: { t: (k: string) => string; localeCode: string; userId: string }) {
  const [tab, setTab] = useState<string>("modules");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Profile
  const { data: profile } = useQuery({
    queryKey: ["student-self-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("full_name, university_id, email").eq("id", userId).maybeSingle();
      return data;
    },
  });

  // Enrollments → courses
  const { data: enrollments = [] } = useQuery({
    queryKey: ["student-self-enrollments", userId],
    queryFn: async () => {
      const { data } = await supabase.from("course_enrollments")
        .select("course_id, enrolled_at, courses(id, name, code)").eq("user_id", userId);
      return data || [];
    },
  });

  const courseIds = enrollments.map((e: any) => e.course_id);
  const enrolledAtMap: Record<string, string> = Object.fromEntries(
    enrollments.map((e: any) => [e.course_id, e.enrolled_at])
  );

  // Sessions for enrolled courses
  const { data: sessions = [] } = useQuery({
    queryKey: ["student-self-sessions", courseIds, JSON.stringify(enrolledAtMap), dateFrom, dateTo],
    enabled: courseIds.length > 0,
    queryFn: async () => {
      let q = supabase.from("sessions")
        .select("id, title, course_id, session_date, status, venue_name")
        .in("course_id", courseIds)
        .in("status", ["completed", "active"]);
      if (dateFrom) q = q.gte("session_date", dateFrom);
      if (dateTo) q = q.lte("session_date", dateTo);
      const { data } = await q.order("session_date", { ascending: false });
      // Restrict to sessions on/after the student's enrollment (join) date per course
      return (data || []).filter((s: any) => {
        const enrolledAt = enrolledAtMap[s.course_id];
        if (!enrolledAt) return true;
        const enrolledDay = enrolledAt.slice(0, 10);
        return s.session_date >= enrolledDay;
      });
    },
  });

  // My attendance records
  const { data: records = [] } = useQuery({
    queryKey: ["student-self-records", userId, sessions.length],
    enabled: sessions.length > 0,
    queryFn: async () => {
      const sIds = sessions.map((s: any) => s.id);
      const { data } = await supabase.from("attendance_records")
        .select("session_id, scanned_at, status").eq("user_id", userId).in("session_id", sIds);
      return data || [];
    },
  });

  // Approved excuses
  const { data: excuses = [] } = useQuery({
    queryKey: ["student-self-excuses", userId, sessions.length],
    enabled: sessions.length > 0,
    queryFn: async () => {
      const sIds = sessions.map((s: any) => s.id);
      const { data } = await supabase.from("excuses")
        .select("session_id, status, reason").eq("user_id", userId).in("session_id", sIds);
      return data || [];
    },
  });

  const attendedSet = new Set(records.map((r: any) => r.session_id));
  const excuseMap = new Map(excuses.map((e: any) => [e.session_id, e]));
  const courseMap = Object.fromEntries(enrollments.map((e: any) => [e.course_id, e.courses]));

  // Per-module stats
  const perModule = enrollments.map((e: any) => {
    const cSessions = sessions.filter((s: any) => s.course_id === e.course_id);
    const attended = cSessions.filter((s: any) => attendedSet.has(s.id)).length;
    const total = cSessions.length;
    const missed = total - attended;
    const excused = cSessions.filter((s: any) => !attendedSet.has(s.id) && (excuseMap.get(s.id) as any)?.status === "approved").length;
    return {
      courseId: e.course_id,
      code: e.courses?.code || "—",
      name: e.courses?.name || "—",
      total, attended, missed, excused,
      pct: total > 0 ? Math.round((attended / total) * 100) : 0,
    };
  });

  // General summary totals
  const totals = perModule.reduce((acc, m) => ({
    total: acc.total + m.total, attended: acc.attended + m.attended,
    missed: acc.missed + m.missed, excused: acc.excused + m.excused,
  }), { total: 0, attended: 0, missed: 0, excused: 0 });
  const overallPct = totals.total > 0 ? Math.round((totals.attended / totals.total) * 100) : 0;

  // Daily sessions list
  const daily = sessions.map((s: any) => {
    const attended = attendedSet.has(s.id);
    const excuse = excuseMap.get(s.id) as any;
    const status = attended ? "present" : (excuse?.status === "approved" ? "excused" : "absent");
    return {
      id: s.id, title: s.title, date: s.session_date, venue: s.venue_name,
      module: courseMap[s.course_id]?.code || "—", status,
      excuseReason: excuse?.reason || null,
    };
  });

  const handleExport = (fmt: "pdf" | "excel") => {
    const run = fmt === "pdf" ? exportToPDF : exportToExcel;
    const fn = (data: Parameters<typeof run>[0]) => run({
      ...data,
      locale: localeCode,
      labels: {
        filters: t("reports.filters"),
        generated: t("reports.generated"),
        period: t("reports.period"),
        sheet: t("reports.report"),
      },
    });
    if (tab === "modules") {
      fn({
        title: t("reports.byModule"),
        subtitle: profile ? `${profile.full_name} (${profile.university_id})` : undefined,
        columns: [
          { header: t("courses.code"), key: "code" },
          { header: t("courses.name"), key: "name" },
          { header: t("reports.totalSessions"), key: "total" },
          { header: t("reports.attendedSessions"), key: "attended" },
          { header: t("reports.missedSessions"), key: "missed" },
          { header: t("reports.missedWithExcuse"), key: "excused" },
          { header: t("reports.percentage"), key: "pct" },
        ],
        rows: perModule.map((m) => ({ ...m, pct: `${m.pct}%` })),
      });
    } else if (tab === "general") {
      fn({
        title: t("reports.generalSummary"),
        subtitle: profile ? `${profile.full_name} (${profile.university_id})` : undefined,
        columns: [
          { header: t("reports.studentName"), key: "name" },
          { header: t("reports.universityId"), key: "uid" },
          { header: t("attendance.course"), key: "module" },
          { header: t("reports.totalSessions"), key: "total" },
          { header: t("reports.attendedSessions"), key: "attended" },
          { header: t("reports.missedSessions"), key: "missed" },
          { header: t("reports.missedWithExcuse"), key: "excused" },
          { header: t("reports.excusePermission"), key: "excuseReasons" },
        ],
        rows: perModule.map((m) => {
          const reasons = sessions
            .filter((s: any) => s.course_id === m.courseId && !attendedSet.has(s.id))
            .map((s: any) => (excuseMap.get(s.id) as any)?.reason)
            .filter(Boolean);
          return {
            name: profile?.full_name || "—",
            uid: profile?.university_id || "—",
            module: `${m.code} — ${m.name}`,
            total: m.total, attended: m.attended, missed: m.missed, excused: m.excused,
            excuseReasons: reasons.length ? reasons.join("; ") : "—",
          };
        }),
      });
    } else {
      fn({
        title: t("reports.dailyReport"),
        subtitle: profile ? `${profile.full_name} (${profile.university_id})` : undefined,
        dateRange: (dateFrom || dateTo) ? { from: dateFrom, to: dateTo } : undefined,
        columns: [
          { header: t("attendance.date"), key: "date" },
          { header: t("attendance.course"), key: "module" },
          { header: t("attendance.session"), key: "title" },
          { header: t("sessions.venue"), key: "venue" },
          { header: t("sessions.status"), key: "status" },
          { header: t("reports.excusePermission"), key: "excuseReason" },
        ],
        rows: daily.map((d) => ({
          ...d,
          status: d.status === "present" ? t("attendance.present") : d.status === "excused" ? t("reports.missedWithExcuse") : t("attendance.absent"),
          excuseReason: d.excuseReason || "—",
        })),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.studentMyReport")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FileDown className="h-4 w-4 mr-2" />{t("reports.exportPdf")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />{t("reports.exportExcel")}
          </Button>
        </div>
      </div>

      {/* Date range filter */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            {t("reports.dateRange")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("reports.from")}</Label>
            <Input type="date" value={dateFrom} max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("reports.to")}</Label>
            <Input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5 mr-1" />{t("reports.clearDates")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Overall summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center">
          <CalendarCheck className="h-6 w-6 mx-auto mb-2 text-primary" />
          <p className="text-2xl font-bold">{totals.attended}</p>
          <p className="text-xs text-muted-foreground">{t("reports.attendedSessions")}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <BarChart3 className="h-6 w-6 mx-auto mb-2 text-destructive" />
          <p className="text-2xl font-bold">{totals.missed}</p>
          <p className="text-xs text-muted-foreground">{t("reports.missedSessions")}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <Users className="h-6 w-6 mx-auto mb-2 text-accent-foreground" />
          <p className="text-2xl font-bold">{totals.excused}</p>
          <p className="text-xs text-muted-foreground">{t("reports.missedWithExcuse")}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <Percent className="h-6 w-6 mx-auto mb-2 text-primary" />
          <p className={`text-2xl font-bold ${overallPct >= 75 ? "text-primary" : overallPct >= 50 ? "text-accent-foreground" : "text-destructive"}`}>{overallPct}%</p>
          <p className="text-xs text-muted-foreground">{t("reports.averageRate")}</p>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="modules">{t("reports.byModule")}</TabsTrigger>
          <TabsTrigger value="general">{t("reports.generalSummary")}</TabsTrigger>
          <TabsTrigger value="daily">{t("reports.dailyReport")}</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("reports.byModule")}</CardTitle></CardHeader>
            <CardContent>
              {perModule.length === 0 ? (
                <p className="text-muted-foreground">{t("reports.noData")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("courses.code")}</TableHead>
                      <TableHead>{t("courses.name")}</TableHead>
                      <TableHead className="text-center">{t("reports.totalSessions")}</TableHead>
                      <TableHead className="text-center">{t("reports.attendedSessions")}</TableHead>
                      <TableHead className="text-center">{t("reports.missedSessions")}</TableHead>
                      <TableHead className="text-center">{t("reports.missedWithExcuse")}</TableHead>
                      <TableHead className="text-center">{t("reports.percentage")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {perModule.map((m) => (
                        <TableRow key={m.courseId}>
                          <TableCell className="font-mono text-sm">{m.code}</TableCell>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="text-center">{m.total}</TableCell>
                          <TableCell className="text-center"><Badge variant="default">{m.attended}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="destructive">{m.missed}</Badge></TableCell>
                          <TableCell className="text-center"><Badge variant="secondary">{m.excused}</Badge></TableCell>
                          <TableCell className="text-center">
                            <Badge variant={m.pct >= 75 ? "default" : m.pct >= 50 ? "secondary" : "destructive"}>{m.pct}%</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("reports.generalSummary")}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{t("reports.studentName")}</TableHead>
                    <TableHead>{t("reports.universityId")}</TableHead>
                    <TableHead>{t("attendance.course")}</TableHead>
                    <TableHead className="text-center">{t("common.total")}</TableHead>
                    <TableHead className="text-center">{t("attendance.attended")}</TableHead>
                    <TableHead className="text-center">{t("reports.missed")}</TableHead>
                    <TableHead className="text-center">{t("reports.excused")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {perModule.map((m) => (
                      <TableRow key={m.courseId}>
                        <TableCell>{profile?.full_name || "—"}</TableCell>
                        <TableCell>{profile?.university_id || "—"}</TableCell>
                        <TableCell>{m.code} — {m.name}</TableCell>
                        <TableCell className="text-center">{m.total}</TableCell>
                        <TableCell className="text-center">{m.attended}</TableCell>
                        <TableCell className="text-center">{m.missed}</TableCell>
                        <TableCell className="text-center">{m.excused}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("reports.dailyReport")}</CardTitle></CardHeader>
            <CardContent>
              {daily.length === 0 ? (
                <p className="text-muted-foreground">{t("reports.noData")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("attendance.date")}</TableHead>
                      <TableHead>{t("attendance.course")}</TableHead>
                      <TableHead>{t("attendance.session")}</TableHead>
                      <TableHead>{t("sessions.venue")}</TableHead>
                      <TableHead>{t("sessions.status")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {daily.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm">{d.date}</TableCell>
                          <TableCell className="font-mono text-xs">{d.module}</TableCell>
                          <TableCell>{d.title}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.venue || "—"}</TableCell>
                          <TableCell>
                            {d.status === "present" && <Badge variant="default">{t("attendance.present")}</Badge>}
                            {d.status === "absent" && <Badge variant="destructive">{t("attendance.absent")}</Badge>}
                            {d.status === "excused" && <Badge variant="secondary" title={d.excuseReason || ""}>{t("reports.missedWithExcuse")}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
