import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, CheckCircle2, XCircle, Clock, Building2, Users } from "lucide-react";
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
      const { data: sessions } = await supabase.from("sessions").select("id, title, session_date, course_id").in("id", sessionIds);
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

  // All lecturers with department info
  const { data: allLecturers = [] } = useQuery({
    queryKey: ["all-lecturers-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles(id, full_name, university_id, department_id)")
        .eq("role", "lecturer");
      if (error) throw error;
      return (data || []).map((r: any) => r.profiles).filter(Boolean);
    },
    enabled: isAdmin,
  });

  // Course lecturers assignments
  const { data: courseLecturerAssignments = [] } = useQuery({
    queryKey: ["course-lecturer-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_lecturers")
        .select("lecturer_id, course_id, courses(id, name, code, department_id)");
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  // Lecturer/Admin: attendance for their courses
  const { data: courseAttendance, isLoading: loadingCourseAtt } = useQuery({
    queryKey: ["course-attendance-overview", user?.id, role],
    enabled: (role === "lecturer" || role === "admin") && !!user,
    queryFn: async () => {
      let coursesQuery = supabase.from("courses").select("id, name, code, department_id");
      if (role === "lecturer") {
        coursesQuery = coursesQuery.eq("created_by", user!.id);
      }
      const { data: courses, error: cErr } = await coursesQuery;
      if (cErr) throw cErr;
      if (!courses?.length) return [];

      const courseIds = courses.map((c) => c.id);
      const { data: sessions } = await supabase.from("sessions")
        .select("id, title, session_date, course_id, status, created_by")
        .in("course_id", courseIds)
        .eq("status", "completed")
        .order("session_date", { ascending: false });

      if (!sessions?.length) return courses.map((c) => ({ ...c, sessions: [] as any[], totalAttendance: 0, completedSessions: 0 }));

      const sessionIds = sessions.map((s) => s.id);
      const { data: records } = await supabase.from("attendance_records").select("session_id, user_id").in("session_id", sessionIds);

      const sessionMap = new Map<string, typeof sessions>();
      for (const s of sessions) {
        const arr = sessionMap.get(s.course_id) || [];
        arr.push(s);
        sessionMap.set(s.course_id, arr);
      }

      const attendanceBySession = new Map<string, number>();
      for (const r of records || []) {
        attendanceBySession.set(r.session_id, (attendanceBySession.get(r.session_id) || 0) + 1);
      }

      return courses.map((c) => {
        const courseSessions = sessionMap.get(c.id) || [];
        const totalAtt = courseSessions.reduce((sum, s) => sum + (attendanceBySession.get(s.id) || 0), 0);
        return { ...c, sessions: courseSessions, totalAttendance: totalAtt, completedSessions: courseSessions.length };
      });
    },
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

  const loading = isLoading || loadingCourseAtt;

  // Admin: build lecturer attendance overview grouped by department
  const filteredCourseAttendance = isAdmin && selectedDeptId !== "all"
    ? (courseAttendance || []).filter((c: any) => c.department_id === selectedDeptId)
    : courseAttendance;

  // Build registered vs unregistered lecturers per department
  const getLecturersByDept = (deptId: string) => {
    const assignedLecturerIds = new Set(
      courseLecturerAssignments
        .filter((a: any) => a.courses?.department_id === deptId)
        .map((a: any) => a.lecturer_id)
    );

    const registered = allLecturers.filter((l: any) => assignedLecturerIds.has(l.id));
    const unregistered = allLecturers.filter((l: any) => l.department_id === deptId && !assignedLecturerIds.has(l.id));

    return { registered, unregistered };
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

      {/* Admin View - with department grouping and lecturer status */}
      {isAdmin && !loading && (
        <div className="space-y-6">
          {/* Lecturer Registration Status by Department */}
          {selectedDeptId !== "all" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t("admin.lecturerStatus")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const { registered, unregistered } = getLecturersByDept(selectedDeptId);
                  return (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-medium text-primary mb-2 flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          {t("admin.registeredLecturers")} ({registered.length})
                        </h4>
                        {registered.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("reports.noData")}</p>
                        ) : (
                          <div className="space-y-1">
                            {registered.map((l: any) => (
                              <div key={l.id} className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/10">
                                <span className="text-sm font-medium">{l.full_name}</span>
                                <span className="text-xs text-muted-foreground">{l.university_id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-destructive mb-2 flex items-center gap-1">
                          <XCircle className="h-4 w-4" />
                          {t("admin.unregisteredLecturers")} ({unregistered.length})
                        </h4>
                        {unregistered.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("reports.noData")}</p>
                        ) : (
                          <div className="space-y-1">
                            {unregistered.map((l: any) => (
                              <div key={l.id} className="flex items-center gap-2 p-2 rounded-md bg-destructive/5 border border-destructive/10">
                                <span className="text-sm font-medium">{l.full_name}</span>
                                <span className="text-xs text-muted-foreground">{l.university_id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Course attendance */}
          {!filteredCourseAttendance?.length ? (
            <p className="text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            filteredCourseAttendance.map((c: any) => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{c.code} — {c.name}</span>
                    <Badge variant="outline">{c.completedSessions} {t("attendance.totalSessions")}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{c.completedSessions}</p>
                      <p className="text-xs text-muted-foreground">{t("reports.totalSessions")}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{c.totalAttendance}</p>
                      <p className="text-xs text-muted-foreground">{t("reports.totalAttendance")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Lecturer View */}
      {role === "lecturer" && !loading && (
        <div className="space-y-4">
          {!courseAttendance?.length ? (
            <p className="text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            courseAttendance.map((c: any) => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{c.code} — {c.name}</span>
                    <Badge variant="outline">{c.completedSessions} {t("attendance.totalSessions")}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{c.completedSessions}</p>
                      <p className="text-xs text-muted-foreground">{t("reports.totalSessions")}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-2xl font-bold">{c.totalAttendance}</p>
                      <p className="text-xs text-muted-foreground">{t("reports.totalAttendance")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
