import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, CalendarCheck, Percent, FileDown, User, Building2, BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Reports() {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [activeTab, setActiveTab] = useState(role === "admin" ? "department" : "course");

  // Departments (admin only)
  const { data: departments = [] } = useQuery({
    queryKey: ["report-departments"],
    enabled: !!user && role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["report-courses", user?.id, role],
    enabled: !!user && (role === "lecturer" || role === "admin"),
    queryFn: async () => {
      let q = supabase.from("courses").select("id, name, code, created_by, department_id");
      if (role === "lecturer") q = q.eq("created_by", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

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
    queryKey: ["course-report", selectedCourse],
    enabled: !!selectedCourse && activeTab === "course",
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from("sessions").select("id, title, session_date")
        .eq("course_id", selectedCourse).eq("status", "completed")
        .order("session_date", { ascending: true });

      if (!sessions?.length) return { sessions: [], students: [], chartData: [] };

      const sessionIds = sessions.map((s) => s.id);
      const { data: records } = await supabase.from("attendance_records")
        .select("session_id, user_id, status, scanned_at").in("session_id", sessionIds);

      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("user_id").eq("course_id", selectedCourse);

      const studentIds = [...new Set([
        ...(enrollments || []).map((e) => e.user_id),
        ...(records || []).map((r) => r.user_id),
      ])];

      const { data: profiles } = await supabase.from("profiles")
        .select("id, full_name, university_id, gender").in("id", studentIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      const studentAttendance = studentIds.map((uid) => {
        const attended = (records || []).filter((r) => r.user_id === uid).length;
        const profile = profileMap[uid];
        return {
          userId: uid, name: profile?.full_name || "Unknown",
          universityId: profile?.university_id || "—", gender: profile?.gender || "—",
          attended, total: sessions.length,
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
    queryKey: ["student-report", selectedStudent],
    enabled: !!selectedStudent && activeTab === "student",
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles")
        .select("id, full_name, university_id, gender, email").eq("id", selectedStudent).single();

      const { data: enrollments } = await supabase.from("course_enrollments")
        .select("course_id, courses(id, name, code)").eq("user_id", selectedStudent);

      const courseResults = await Promise.all((enrollments || []).map(async (e: any) => {
        const { data: sessions } = await supabase.from("sessions")
          .select("id, title, session_date").eq("course_id", e.course_id).eq("status", "completed");
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
        const { data } = await supabase.from("profiles").select("id, full_name, university_id").order("full_name");
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
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.title")}</h1>
        <p className="text-muted-foreground">{t("reports.noData")}</p>
      </div>
    );
  }

  const chartConfig = { attendance: { label: t("attendance.attended"), color: "hsl(var(--primary))" } };

  return (
    <div className="space-y-6 print-report">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.title")}</h1>
        <Button variant="outline" className="no-print" onClick={() => window.print()}>
          <FileDown className="h-4 w-4 mr-2" />{t("reports.exportPdf")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="no-print">
        <TabsList>
          {role === "admin" && <TabsTrigger value="department">{t("reports.byDepartment")}</TabsTrigger>}
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
                <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
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

      {/* ── Course Report Tab ── */}
      {activeTab === "course" && (
        <>
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="w-full max-w-xs no-print">
              <SelectValue placeholder={t("reports.selectCourse")} />
            </SelectTrigger>
            <SelectContent>
              {courses?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

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
