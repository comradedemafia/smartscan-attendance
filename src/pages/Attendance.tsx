import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, CheckCircle2, XCircle, Clock, Building2, Users, BookOpen, ChevronDown, ChevronRight, CalendarDays, GraduationCap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatIntlDate } from "@/lib/dates";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Level = { id: string; name: string; code: string; department_id: string; sort_order: number };

export default function Attendance() {
  const { t, localeCode } = useI18n();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Departments for admin
  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch all levels
  const { data: allLevels = [] } = useQuery<Level[]>({
    queryKey: ["levels-for-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("*").order("sort_order");
      if (error) throw error;
      return data as Level[];
    },
    enabled: !!user,
  });

  // ==================== STUDENT VIEW DATA ====================
  const { data: myEnrollments = [] } = useQuery({
    queryKey: ["my-enrollments", user?.id],
    enabled: role === "student" && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("course_enrollments").select("course_id").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: myCourseSessions = [] } = useQuery({
    queryKey: ["my-course-sessions", myEnrollments.length],
    enabled: role === "student" && myEnrollments.length > 0,
    queryFn: async () => {
      const courseIds = myEnrollments.map((e) => e.course_id);
      const { data, error } = await supabase
        .from("sessions")
        .select("id, title, session_date, course_id, status, venue_name, duration_minutes")
        .in("course_id", courseIds)
        .in("status", ["completed", "active"])
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: myCourses = [] } = useQuery({
    queryKey: ["my-courses-info", myEnrollments.length],
    enabled: role === "student" && myEnrollments.length > 0,
    queryFn: async () => {
      const courseIds = myEnrollments.map((e) => e.course_id);
      const { data, error } = await supabase.from("courses").select("id, name, code, level_id").in("id", courseIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: myRecords = [], isLoading } = useQuery({
    queryKey: ["my-attendance", user?.id],
    enabled: role === "student" && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, session_id, scanned_at, status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  // Build student view grouped by level
  const studentLevelHistory = (() => {
    if (role !== "student") return [];
    const courseMap = Object.fromEntries(myCourses.map((c) => [c.id, c]));
    const attendedSessionIds = new Set(myRecords.map((r) => r.session_id));
    const recordBySession = Object.fromEntries(myRecords.map((r) => [r.session_id, r]));

    // Group sessions by course
    const courseGroups = new Map<string, { course: any; sessions: any[] }>();
    myCourseSessions.forEach((s) => {
      if (!courseGroups.has(s.course_id)) {
        courseGroups.set(s.course_id, { course: courseMap[s.course_id], sessions: [] });
      }
      courseGroups.get(s.course_id)!.sessions.push({
        ...s,
        attended: attendedSessionIds.has(s.id),
        record: recordBySession[s.id] || null,
      });
    });

    const courseGroupsArr = Array.from(courseGroups.values()).filter((g) => g.course);

    // Group by level
    const levelMap = new Map<string, { level: Level | null; courses: typeof courseGroupsArr }>();
    courseGroupsArr.forEach((cg) => {
      const levelId = cg.course.level_id || "unassigned";
      if (!levelMap.has(levelId)) {
        const level = allLevels.find((l) => l.id === levelId) || null;
        levelMap.set(levelId, { level, courses: [] });
      }
      levelMap.get(levelId)!.courses.push(cg);
    });

    return Array.from(levelMap.values());
  })();

  // ==================== LECTURER/ADMIN VIEW DATA ====================
  const { data: allCourses = [] } = useQuery({
    queryKey: ["attendance-courses", role, user?.id],
    queryFn: async () => {
      if (role === "lecturer") {
        const [assignmentsRes, createdRes] = await Promise.all([
          supabase.from("course_lecturers").select("course_id").eq("lecturer_id", user!.id),
          supabase.from("courses").select("id").eq("created_by", user!.id),
        ]);
        const assignedIds = (assignmentsRes.data || []).map((a) => a.course_id);
        const createdIds = (createdRes.data || []).map((c) => c.id);
        const courseIds = [...new Set([...assignedIds, ...createdIds])];
        if (!courseIds.length) return [];
        const { data, error } = await supabase.from("courses").select("id, name, code, department_id, level_id").in("id", courseIds).order("name");
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("courses").select("id, name, code, department_id, level_id").order("name");
      if (error) throw error;
      return data;
    },
    enabled: (isAdmin || role === "lecturer") && !!user,
  });

  const courseIds = allCourses.map((c) => c.id);

  const { data: allSessions = [] } = useQuery({
    queryKey: ["attendance-sessions", courseIds],
    queryFn: async () => {
      if (!courseIds.length) return [];
      const { data, error } = await supabase.from("sessions")
        .select("id, title, session_date, course_id, status, created_by, venue_name, duration_minutes")
        .in("course_id", courseIds)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: courseIds.length > 0,
  });

  const sessionIds = allSessions.map((s) => s.id);

  const { data: allRecords = [] } = useQuery({
    queryKey: ["attendance-records-all", sessionIds],
    queryFn: async () => {
      if (!sessionIds.length) return [];
      const { data, error } = await supabase.from("attendance_records").select("id, session_id, user_id, status, scanned_at").in("session_id", sessionIds);
      if (error) throw error;
      return data;
    },
    enabled: sessionIds.length > 0,
  });

  const { data: courseEnrollments = [] } = useQuery({
    queryKey: ["attendance-enrollments", courseIds],
    queryFn: async () => {
      if (!courseIds.length) return [];
      const { data, error } = await supabase.from("course_enrollments").select("course_id, user_id").in("course_id", courseIds);
      if (error) throw error;
      return data;
    },
    enabled: courseIds.length > 0,
  });

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

  const statusBadge = (status: string) => {
    const variant = status === "present" ? "default" : status === "late" ? "secondary" : "destructive";
    const label = status === "present" ? t("attendance.present") : status === "late" ? t("attendance.late") : t("attendance.absent");
    return <Badge variant={variant}>{label}</Badge>;
  };

  // Filter courses by department
  const filteredCourses = isAdmin && selectedDeptId !== "all"
    ? allCourses.filter((c) => c.department_id === selectedDeptId)
    : allCourses;

  // Apply date range to sessions used in lecturer/admin overall stats
  const dateFilteredSessions = (() => {
    if (!dateFrom && !dateTo) return allSessions;
    return allSessions.filter((s: any) => {
      if (!s.session_date) return false;
      if (dateFrom && s.session_date < dateFrom) return false;
      if (dateTo && s.session_date > dateTo) return false;
      return true;
    });
  })();

  // Lecturer/Admin: overall present/absent across ALL filtered modules
  const overallSummary = (() => {
    if (role !== "lecturer" && !isAdmin) return null;
    const filteredCourseIds = new Set(filteredCourses.map((c) => c.id));
    const consideredSessions = dateFilteredSessions.filter(
      (s: any) => filteredCourseIds.has(s.course_id) && (s.status === "completed" || s.status === "active")
    );
    const consideredSessionIds = new Set(consideredSessions.map((s: any) => s.id));
    const enrolledByCourse = new Map<string, string[]>();
    courseEnrollments.forEach((e: any) => {
      if (!enrolledByCourse.has(e.course_id)) enrolledByCourse.set(e.course_id, []);
      enrolledByCourse.get(e.course_id)!.push(e.user_id);
    });
    let totalSlots = 0;
    consideredSessions.forEach((s: any) => {
      totalSlots += (enrolledByCourse.get(s.course_id) || []).length;
    });
    const totalPresent = allRecords.filter((r: any) => consideredSessionIds.has(r.session_id)).length;
    const totalAbsent = Math.max(0, totalSlots - totalPresent);
    const rate = totalSlots > 0 ? Math.round((totalPresent / totalSlots) * 100) : 0;
    return { totalPresent, totalAbsent, totalSlots, rate, sessionCount: consideredSessions.length };
  })();

  // Group filtered courses by level for lecturer/admin
  const coursesGroupedByLevel = (() => {
    const levelMap = new Map<string, { level: Level | null; courses: typeof filteredCourses }>();
    filteredCourses.forEach((c) => {
      const levelId = c.level_id || "unassigned";
      if (!levelMap.has(levelId)) {
        const level = allLevels.find((l) => l.id === levelId) || null;
        levelMap.set(levelId, { level, courses: [] });
      }
      levelMap.get(levelId)!.courses.push(c);
    });
    // Sort: levels with sort_order first, unassigned last
    return Array.from(levelMap.values()).sort((a, b) => {
      if (!a.level) return 1;
      if (!b.level) return -1;
      return a.level.sort_order - b.level.sort_order;
    });
  })();

  const buildSessionHistory = (courseId: string) => {
    const courseSessions = allSessions.filter((s: any) => s.course_id === courseId && (s.status === "completed" || s.status === "active"));
    const enrolledStudentIds = courseEnrollments.filter((e: any) => e.course_id === courseId).map((e: any) => e.user_id);
    const recordsBySession = new Map<string, Map<string, any>>();
    allRecords.forEach((r: any) => {
      if (!recordsBySession.has(r.session_id)) recordsBySession.set(r.session_id, new Map());
      recordsBySession.get(r.session_id)!.set(r.user_id, r);
    });
    return courseSessions.map((session: any) => {
      const sessionRecords = recordsBySession.get(session.id) || new Map();
      const presentStudents = enrolledStudentIds.filter((uid: string) => sessionRecords.has(uid));
      const absentStudents = enrolledStudentIds.filter((uid: string) => !sessionRecords.has(uid));
      return {
        session,
        presentStudents: presentStudents.map((uid: string) => ({ userId: uid, record: sessionRecords.get(uid) })),
        absentStudents,
        totalEnrolled: enrolledStudentIds.length,
      };
    });
  };

  const buildOverallStats = (courseId: string) => {
    const courseSessions = allSessions.filter((s: any) => s.course_id === courseId && (s.status === "completed" || s.status === "active"));
    const enrolledStudentIds = courseEnrollments.filter((e: any) => e.course_id === courseId).map((e: any) => e.user_id);
    const recordsBySession = new Map<string, Set<string>>();
    allRecords.forEach((r: any) => {
      if (!recordsBySession.has(r.session_id)) recordsBySession.set(r.session_id, new Set());
      recordsBySession.get(r.session_id)!.add(r.user_id);
    });
    return enrolledStudentIds.map((userId: string) => {
      const presentCount = courseSessions.filter((s: any) => recordsBySession.get(s.id)?.has(userId)).length;
      return { userId, presentCount, absentCount: courseSessions.length - presentCount, totalSessions: courseSessions.length };
    });
  };

  const renderCourseAttendance = (course: any) => {
    const sessionHistory = buildSessionHistory(course.id);
    const overallStats = buildOverallStats(course.id);

    return (
      <Card key={course.id}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span>{course.code} — {course.name}</span>
            </div>
            <Badge variant="secondary" className="text-xs">{sessionHistory.length} {t("courses.sessions")}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {overallStats.length > 0 && (
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
                  {overallStats.map((student) => {
                    const profile = (studentProfiles as any)[student.userId];
                    const pct = student.totalSessions > 0 ? Math.round((student.presentCount / student.totalSessions) * 100) : 0;
                    return (
                      <tr key={student.userId} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 text-sm">{profile?.full_name || "—"}</td>
                        <td className="py-1.5 pr-2 text-xs text-muted-foreground">{profile?.university_id || "—"}</td>
                        <td className="py-1.5 px-2 text-center"><Badge variant="default" className="text-[10px]">{student.presentCount}</Badge></td>
                        <td className="py-1.5 px-2 text-center"><Badge variant="destructive" className="text-[10px]">{student.absentCount}</Badge></td>
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
          {sessionHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {t("attendance.myHistory")}
              </p>
              {sessionHistory.map((sh) => (
                <SessionHistoryItem key={sh.session.id} sessionData={sh} studentProfiles={studentProfiles} t={t} />
              ))}
            </div>
          )}
          {sessionHistory.length === 0 && overallStats.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">{t("reports.noData")}</p>
          )}
        </CardContent>
      </Card>
    );
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
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {/* ==================== STUDENT VIEW ==================== */}
      {role === "student" && !isLoading && (
        <div className="space-y-4">
          {studentLevelHistory.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground text-center">{t("attendance.noRecords")}</p>
              </CardContent>
            </Card>
          ) : (
            studentLevelHistory.map((levelGroup, idx) => (
              <div key={levelGroup.level?.id || `unassigned-${idx}`} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">
                    {levelGroup.level ? levelGroup.level.name : t("dept.unassignedCourses")}
                  </h2>
                  {levelGroup.level && <Badge variant="outline" className="text-xs">{levelGroup.level.code}</Badge>}
                </div>
                {levelGroup.courses.map((group) => {
                  const attended = group.sessions.filter((s) => s.attended).length;
                  const total = group.sessions.length;
                  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
                  return (
                    <Card key={group.course.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-primary" />
                            <span>{group.course.code} — {group.course.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default">{attended}/{total}</Badge>
                            <span className={`text-sm font-medium ${pct >= 75 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive"}`}>
                              {pct}%
                            </span>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {group.sessions.map((s) => (
                            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                              <div className="flex items-center gap-3">
                                {s.attended ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                                <div>
                                  <p className="font-medium text-sm">{s.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatIntlDate(s.session_date, localeCode, { day: "2-digit", month: "short", year: "numeric" })}
                                    {s.venue_name && ` · 📍 ${s.venue_name}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {s.attended && s.record ? (
                                  <>
                                    <span className="text-xs text-muted-foreground">{formatIntlDate(s.record.scanned_at, localeCode, { hour: "2-digit", minute: "2-digit" })}</span>
                                    {statusBadge(s.record.status)}
                                  </>
                                ) : (
                                  <Badge variant="destructive">{t("attendance.absent")}</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      {/* ==================== LECTURER / ADMIN VIEW ==================== */}
      {(isAdmin || role === "lecturer") && (
        <div className="space-y-4">
          {/* Date range filter */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {t("attendance.dateRange")}
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
                    {t("reports.clearDates")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Overall summary across all modules */}
          {overallSummary && overallSummary.totalSlots > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  {t("attendance.summary")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("attendance.totalPresent")}</p>
                    <p className="text-2xl font-bold text-primary">{overallSummary.totalPresent}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("attendance.totalAbsent")}</p>
                    <p className="text-2xl font-bold text-destructive">{overallSummary.totalAbsent}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("sessions.title")}</p>
                    <p className="text-2xl font-bold">{overallSummary.sessionCount}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("attendance.overallRate")}</p>
                    <p className={`text-2xl font-bold ${overallSummary.rate >= 75 ? "text-primary" : overallSummary.rate >= 50 ? "text-accent-foreground" : "text-destructive"}`}>
                      {overallSummary.rate}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {coursesGroupedByLevel.length === 0 ? (
            <p className="text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            coursesGroupedByLevel.map((levelGroup, idx) => (
              <div key={levelGroup.level?.id || `unassigned-${idx}`} className="space-y-3">
                <div
                  className="flex items-center justify-between cursor-pointer px-1 py-2 hover:bg-muted/50 rounded-lg"
                  onClick={() => setExpandedLevel(expandedLevel === (levelGroup.level?.id || "unassigned") ? null : (levelGroup.level?.id || "unassigned"))}
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold">
                      {levelGroup.level ? levelGroup.level.name : t("dept.unassignedCourses")}
                    </h2>
                    {levelGroup.level && <Badge variant="outline" className="text-xs">{levelGroup.level.code}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{levelGroup.courses.length} {t("dept.courses")}</Badge>
                    {expandedLevel === (levelGroup.level?.id || "unassigned") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </div>
                {expandedLevel === (levelGroup.level?.id || "unassigned") && (
                  <div className="space-y-4 pl-2">
                    {levelGroup.courses.map((course) => renderCourseAttendance(course))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SessionHistoryItem({ sessionData, studentProfiles, t }: {
  sessionData: { session: any; presentStudents: any[]; absentStudents: string[]; totalEnrolled: number };
  studentProfiles: Record<string, any>;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const { localeCode } = useI18n();
  const { session, presentStudents, absentStudents, totalEnrolled } = sessionData;
  const pct = totalEnrolled > 0 ? Math.round((presentStudents.length / totalEnrolled) * 100) : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto">
          <div className="flex items-center gap-3 text-left">
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <div>
              <p className="text-sm font-medium">{session.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatIntlDate(session.session_date, localeCode, { day: "2-digit", month: "short", year: "numeric" })}
                {session.venue_name && ` · 📍 ${session.venue_name}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-[10px]">{presentStudents.length}</Badge>
            <Badge variant="destructive" className="text-[10px]">{absentStudents.length}</Badge>
            <span className={`text-xs font-medium ${pct >= 75 ? "text-primary" : pct >= 50 ? "text-accent-foreground" : "text-destructive"}`}>{pct}%</span>
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">
        <div className="rounded-lg border divide-y divide-border mt-1">
          {presentStudents.map(({ userId, record }) => {
            const profile = studentProfiles[userId];
            return (
              <div key={userId} className="flex items-center justify-between py-2 px-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm">{profile?.full_name || "—"}</span>
                  <span className="text-xs text-muted-foreground">{profile?.university_id}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {record?.scanned_at && formatIntlDate(record.scanned_at, localeCode, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          {absentStudents.map((userId) => {
            const profile = studentProfiles[userId];
            return (
              <div key={userId} className="flex items-center justify-between py-2 px-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-sm text-muted-foreground">{profile?.full_name || "—"}</span>
                  <span className="text-xs text-muted-foreground">{profile?.university_id}</span>
                </div>
                <Badge variant="destructive" className="text-[10px]">{t("attendance.absent")}</Badge>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
