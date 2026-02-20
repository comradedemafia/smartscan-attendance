import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, CheckCircle2, XCircle, Clock, Building2, Users, BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function Attendance() {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");

  // Departments for admin
  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Student: own attendance history
  const { data: myRecords, isLoading } = useQuery({
    queryKey: ["my-attendance", user?.id],
    enabled: role === "student" && !!user,
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", user!.id)
        .order("scanned_at", { ascending: false });
      if (error) throw error;
      if (!records?.length) return [];

      const sessionIds = [...new Set(records.map((r) => r.session_id))];
      const { data: sessions } = await supabase.from("sessions").select("id, title, session_date, course_id, subject_id").in("id", sessionIds);
      const courseIds = [...new Set((sessions || []).map((s) => s.course_id))];
      const { data: courses } = await supabase.from("courses").select("id, name, code").in("id", courseIds);

      const sessionMap = Object.fromEntries((sessions || []).map((s) => [s.id, s]));
      const courseMap = Object.fromEntries((courses || []).map((c) => [c.id, c]));

      return records.map((r) => {
        const session = sessionMap[r.session_id];
        const course = session ? courseMap[session.course_id] : null;
        return { ...r, session, course };
      });
    },
  });

  // Admin/Lecturer: courses with department info
  const { data: allCourses = [] } = useQuery({
    queryKey: ["attendance-courses", role],
    queryFn: async () => {
      let q = supabase.from("courses").select("id, name, code, department_id");
      if (role === "lecturer") {
        const { data: assignments } = await supabase.from("course_lecturers").select("course_id").eq("lecturer_id", user!.id);
        const courseIds = (assignments || []).map((a) => a.course_id);
        if (!courseIds.length) return [];
        q = q.in("id", courseIds);
      }
      const { data, error } = await q.order("name");
      if (error) throw error;
      return data;
    },
    enabled: (isAdmin || role === "lecturer") && !!user,
  });

  // Subjects
  const { data: allSubjects = [] } = useQuery({
    queryKey: ["attendance-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name, code, course_id").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin || role === "lecturer",
  });

  // Sessions
  const { data: allSessions = [] } = useQuery({
    queryKey: ["attendance-sessions", role],
    queryFn: async () => {
      const courseIds = allCourses.map((c) => c.id);
      if (!courseIds.length) return [];
      const { data, error } = await supabase.from("sessions").select("id, title, session_date, course_id, subject_id, status, created_by").in("course_id", courseIds).order("session_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: allCourses.length > 0,
  });

  // Attendance records for all sessions
  const { data: allRecords = [] } = useQuery({
    queryKey: ["attendance-records-all", allSessions.length],
    queryFn: async () => {
      const sessionIds = allSessions.map((s) => s.id);
      if (!sessionIds.length) return [];
      const { data, error } = await supabase.from("attendance_records").select("id, session_id, user_id, status").in("session_id", sessionIds);
      if (error) throw error;
      return data;
    },
    enabled: allSessions.length > 0,
  });

  // Enrolled students per course
  const { data: courseEnrollments = [] } = useQuery({
    queryKey: ["attendance-enrollments", allCourses.length],
    queryFn: async () => {
      const courseIds = allCourses.map((c) => c.id);
      if (!courseIds.length) return [];
      const { data, error } = await supabase.from("course_enrollments").select("course_id, user_id").in("course_id", courseIds);
      if (error) throw error;
      return data;
    },
    enabled: allCourses.length > 0,
  });

  // Subject enrollments
  const { data: subjectEnrollments = [] } = useQuery({
    queryKey: ["attendance-subject-enrollments"],
    queryFn: async () => {
      const subjectIds = allSubjects.map((s) => s.id);
      if (!subjectIds.length) return [];
      const { data, error } = await supabase.from("subject_enrollments").select("subject_id, user_id").in("subject_id", subjectIds);
      if (error) throw error;
      return data;
    },
    enabled: allSubjects.length > 0,
  });

  // Student profiles
  const { data: studentProfiles = {} } = useQuery({
    queryKey: ["attendance-student-profiles", courseEnrollments.length],
    queryFn: async () => {
      const userIds = [...new Set(courseEnrollments.map((e) => e.user_id))];
      if (!userIds.length) return {};
      const { data } = await supabase.from("profiles").select("id, full_name, university_id").in("id", userIds);
      return Object.fromEntries((data || []).map((p) => [p.id, p]));
    },
    enabled: courseEnrollments.length > 0,
  });

  // Lecturer profiles
  const { data: lecturerProfiles = {} } = useQuery({
    queryKey: ["attendance-lecturer-profiles"],
    queryFn: async () => {
      const lecturerIds = [...new Set(allSessions.map((s: any) => s.created_by))];
      if (!lecturerIds.length) return {};
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", lecturerIds);
      return Object.fromEntries((data || []).map((p) => [p.id, p.full_name]));
    },
    enabled: isAdmin && allSessions.length > 0,
  });

  const statusIcon = (status: string) => {
    if (status === "present") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (status === "late") return <Clock className="h-4 w-4 text-accent-foreground" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const statusBadge = (status: string) => {
    const variant = status === "present" ? "default" : status === "late" ? "secondary" : "destructive";
    const label = status === "present" ? t("attendance.present") : status === "late" ? t("attendance.late") : t("attendance.absent");
    return <Badge variant={variant}>{label}</Badge>;
  };

  const loading = isLoading;

  // Filter courses by department
  const filteredCourses = isAdmin && selectedDeptId !== "all"
    ? allCourses.filter((c) => c.department_id === selectedDeptId)
    : allCourses;

  // Build attendance summary per course → subject → session
  const buildAttendanceSummary = (courseId: string) => {
    const subjects = allSubjects.filter((s) => s.course_id === courseId);
    const courseSessions = allSessions.filter((s) => s.course_id === courseId);
    const enrolledStudents = courseEnrollments.filter((e) => e.course_id === courseId).map((e) => e.user_id);

    // Records indexed by session_id -> Set of user_ids
    const recordsBySession = new Map<string, Set<string>>();
    allRecords.forEach((r) => {
      if (!recordsBySession.has(r.session_id)) recordsBySession.set(r.session_id, new Set());
      recordsBySession.get(r.session_id)!.add(r.user_id);
    });

    if (subjects.length > 0) {
      return subjects.map((subject) => {
        const subSessions = courseSessions.filter((s) => s.subject_id === subject.id);
        const subEnrolled = subjectEnrollments.filter((e) => e.subject_id === subject.id).map((e) => e.user_id);
        const effectiveStudents = subEnrolled.length > 0 ? subEnrolled : enrolledStudents;

        return {
          subject,
          sessions: subSessions,
          students: effectiveStudents.map((userId) => {
            const presentCount = subSessions.filter((s) => recordsBySession.get(s.id)?.has(userId)).length;
            const absentCount = subSessions.length - presentCount;
            return { userId, presentCount, absentCount, totalSessions: subSessions.length };
          }),
        };
      });
    }

    // No subjects - show course-level
    return [{
      subject: null,
      sessions: courseSessions,
      students: enrolledStudents.map((userId) => {
        const presentCount = courseSessions.filter((s) => recordsBySession.get(s.id)?.has(userId)).length;
        const absentCount = courseSessions.length - presentCount;
        return { userId, presentCount, absentCount, totalSessions: courseSessions.length };
      }),
    }];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("attendance.title")}</h1>
        {isAdmin && (
          <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("auth.department")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.allDepartments")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {/* Student View */}
      {role === "student" && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5" />
              {t("attendance.myHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!myRecords?.length ? (
              <p className="text-muted-foreground">{t("attendance.noRecords")}</p>
            ) : (
              <div className="space-y-3">
                {myRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      {statusIcon(r.status)}
                      <div>
                        <p className="font-medium text-sm">{r.course?.code} — {r.session?.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.session?.session_date && format(new Date(r.session.session_date), "dd MMM yyyy")}
                          {" · "}{format(new Date(r.scanned_at), "HH:mm")}
                        </p>
                      </div>
                    </div>
                    {statusBadge(r.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin / Lecturer View */}
      {(isAdmin || role === "lecturer") && (
        <div className="space-y-4">
          {filteredCourses.length === 0 ? (
            <p className="text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            filteredCourses.map((course) => {
              const summaries = buildAttendanceSummary(course.id);
              const dept = isAdmin ? departments.find((d) => d.id === course.department_id) : null;

              return (
                <Card key={course.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <span>{course.code} — {course.name}</span>
                      </div>
                      {dept && <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />{dept.code}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summaries.map((summary, idx) => (
                      <div key={summary.subject?.id || idx} className="space-y-2">
                        {summary.subject && (
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground border-b pb-1">
                            <span className="font-mono">{summary.subject.code}</span>
                            <span>{summary.subject.name}</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {summary.sessions.length} {t("attendance.totalSessions")}
                            </Badge>
                          </div>
                        )}
                        {!summary.subject && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {summary.sessions.length} {t("attendance.totalSessions")}
                            </Badge>
                          </div>
                        )}

                        {summary.students.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">{t("reports.noData")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground border-b">
                                  <th className="text-left py-1 pr-2">{t("reports.studentName")}</th>
                                  <th className="text-left py-1 pr-2">{t("reports.universityId")}</th>
                                  <th className="text-center py-1 px-2">{t("attendance.present")}</th>
                                  <th className="text-center py-1 px-2">{t("attendance.absent")}</th>
                                  <th className="text-center py-1 px-2">{t("reports.percentage")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {summary.students.map((student) => {
                                  const profile = studentProfiles[student.userId];
                                  const pct = student.totalSessions > 0
                                    ? Math.round((student.presentCount / student.totalSessions) * 100)
                                    : 0;
                                  return (
                                    <tr key={student.userId} className="border-b last:border-0">
                                      <td className="py-1.5 pr-2 text-sm">{profile?.full_name || "—"}</td>
                                      <td className="py-1.5 pr-2 text-xs text-muted-foreground">{profile?.university_id || "—"}</td>
                                      <td className="py-1.5 px-2 text-center">
                                        <Badge variant="default" className="text-[10px]">{student.presentCount}</Badge>
                                      </td>
                                      <td className="py-1.5 px-2 text-center">
                                        <Badge variant="destructive" className="text-[10px]">{student.absentCount}</Badge>
                                      </td>
                                      <td className="py-1.5 px-2 text-center">
                                        <span className={`text-xs font-medium ${pct >= 75 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive"}`}>
                                          {student.totalSessions > 0 ? `${pct}%` : "—"}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
