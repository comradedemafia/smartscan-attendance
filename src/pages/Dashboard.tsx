import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen, Calendar, Users, TrendingUp, Clock, Building2, Plus, GraduationCap, ChevronDown, ChevronRight, CalendarPlus, ArrowRight, Shield, ShieldCheck, ShieldOff, AlertTriangle, Star, Lock } from "lucide-react";
import SendNotification from "@/components/SendNotification";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatIntlDate } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { role, profile, user } = useAuth();
  const { t, localeCode } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const roleLabel = role === "admin" ? t("common.admin") : role === "lecturer" ? t("auth.lecturer") : role === "student" ? t("auth.student") : "";
  const sessionStatusLabel = (status: string) => {
    switch (status) {
      case "active": return t("sessions.active");
      case "scheduled": return t("sessions.scheduled");
      case "completed": return t("sessions.completed");
      case "terminated": return t("sessions.statusTerminated");
      default: return status;
    }
  };

  const isLecturer = role === "lecturer";
  const isStudent = role === "student";
  const isAdmin = role === "admin";

  const [open, setOpen] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [courseDeptId, setCourseDeptId] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  // Session creation state
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionCourseId, setSessionCourseId] = useState("");
  const [sessionLevelId, setSessionLevelId] = useState("");
  const [sessionVenue, setSessionVenue] = useState("");
  const [sessionDuration, setSessionDuration] = useState("30");

  const { data: userProfile } = useQuery({
    queryKey: ["user-profile-dept", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("department_id").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: userDepartment } = useQuery({
    queryKey: ["user-department", userProfile?.department_id],
    queryFn: async () => {
      if (!userProfile?.department_id) return null;
      const { data } = await supabase.from("departments").select("name").eq("id", userProfile.department_id).single();
      return data;
    },
    enabled: !!userProfile?.department_id && !isAdmin,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isLecturer,
  });

  // Courses: role-specific
  const { data: courses = [] } = useQuery({
    queryKey: ["dashboard-courses", user?.id, role],
    queryFn: async () => {
      if (isLecturer) {
        // Lecturer sees only modules they created
        const { data, error } = await supabase
          .from("courses")
          .select("id, code, name, description, created_by, department_id, level_id, is_core, selection_deadline, departments(name)")
          .eq("created_by", user!.id);
        if (error) throw error;
        return data || [];
      }
      if (isStudent) {
        const { data, error } = await supabase
          .from("course_enrollments")
          .select("course_id, courses(id, code, name, description, level_id, is_core, selection_deadline, departments(name))")
          .eq("user_id", user!.id);
        if (error) throw error;
        return (data || []).map((r: any) => r.courses).filter(Boolean);
      }
      const { data, error } = await supabase.from("courses").select("*, departments(name)");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allLevels = [] } = useQuery({
    queryKey: ["dashboard-levels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("id, name, code, sort_order").order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  // Student-only: fetch all OPTIONAL modules in their department so we can show "not selected" status
  const { data: studentOptionalModules = [] } = useQuery({
    queryKey: ["student-optional-modules", userProfile?.department_id],
    queryFn: async () => {
      if (!userProfile?.department_id) return [];
      const { data, error } = await supabase
        .from("courses")
        .select("id, code, name, level_id, selection_deadline, is_core")
        .eq("department_id", userProfile.department_id)
        .eq("is_core", false);
      if (error) throw error;
      return data || [];
    },
    enabled: isStudent && !!userProfile?.department_id,
  });

  // Fetch ALL courses for session creation (not filtered by lecturer assignment)
  const { data: allCoursesForSession = [] } = useQuery({
    queryKey: ["all-courses-for-session", userProfile?.department_id],
    queryFn: async () => {
      let query = supabase.from("courses").select("id, code, name, level_id, department_id");
      if (!isAdmin && userProfile?.department_id) {
        query = query.eq("department_id", userProfile.department_id);
      }
      const { data, error } = await query.order("code");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isLecturer,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dashboard-sessions", user?.id, role],
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
      const { data, error } = await supabase.from("course_enrollments").select("course_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((e) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1; });
      return counts;
    },
    enabled: !!user,
  });

  const { data: twoFaStats } = useQuery({
    queryKey: ["2fa-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_2fa_stats");
      if (error) throw error;
      return data?.[0] || { total_students: 0, totp_enabled: 0, phone_set: 0 };
    },
    enabled: isAdmin,
  });

  const createCourseMutation = useMutation({
    mutationFn: async () => {
      const deptId = courseDeptId || userProfile?.department_id || null;
      const { data: newCourse, error } = await supabase.from("courses").insert({
        code: courseCode.toUpperCase(), name: courseName, description: courseDesc || null,
        department_id: deptId, created_by: user!.id,
      }).select("id").single();
      if (error) throw error;
      if (newCourse) {
        await supabase.from("course_lecturers").insert({ course_id: newCourse.id, lecturer_id: user!.id, assigned_by: user!.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: t("dept.courseCreated") });
      setOpen(false); setCourseCode(""); setCourseName(""); setCourseDesc(""); setCourseDeptId("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Session creation: filter ALL courses (not just assigned ones) by selected level
  const sessionFilteredCourses = useMemo(() => {
    if (!sessionLevelId) return [];
    return allCoursesForSession.filter((c: any) => c.level_id === sessionLevelId);
  }, [allCoursesForSession, sessionLevelId]);

  const sessionAvailableLevels = useMemo(() => {
    const levelIds = new Set(allCoursesForSession.map((c: any) => c.level_id).filter(Boolean));
    return allLevels.filter((l) => levelIds.has(l.id));
  }, [allCoursesForSession, allLevels]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").insert({
        title: sessionTitle, course_id: sessionCourseId, venue_name: sessionVenue || null,
        duration_minutes: parseInt(sessionDuration), created_by: user!.id, status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      try {
        const { data: newSessions } = await supabase
          .from("sessions").select("id").eq("created_by", user!.id)
          .order("created_at", { ascending: false }).limit(1);
        if (newSessions?.[0]) {
          await supabase.rpc("notify_enrolled_students", {
            _session_id: newSessions[0].id,
            _title: t("notify.newSessionTitle"),
            _message: t("notify.newSessionMessage", { title: sessionTitle }),
            _type: "session",
          });
        }
      } catch { /* ignore notification failure */ }
      toast({ title: t("common.success"), description: t("common.sessionCreated") });
      setSessionOpen(false); setSessionTitle(""); setSessionCourseId(""); setSessionLevelId(""); setSessionVenue(""); setSessionDuration("30");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const activeSessions = sessions.filter((s) => s.status === "active").length;
  const totalStudents = Object.values(enrollmentCounts).reduce((a, b) => a + b, 0);
  const upcomingSessions = sessions.filter(
    (s) => s.status === "scheduled" && new Date(s.session_date) >= new Date(new Date().toDateString())
  );

  const stats = [
    { label: t("dashboard.activeSessions"), value: String(activeSessions), icon: Calendar, color: "text-primary" },
    { label: t("dashboard.totalCourses"), value: String(courses.length), icon: BookOpen, color: "text-accent-foreground" },
    ...(isStudent ? [] : [{ label: t("dashboard.totalStudents"), value: String(totalStudents), icon: Users, color: "text-primary" }]),
    { label: t("dashboard.attendanceRate"), value: "—", icon: TrendingUp, color: "text-primary" },
  ];

  // Group courses by level
  const coursesGroupedByLevel = useMemo(() => {
    const levelMap = new Map<string, { level: any; courses: any[] }>();
    const filtered = filterLevel === "all" ? courses : courses.filter((c: any) => c.level_id === filterLevel);
    filtered.forEach((c: any) => {
      const lid = c.level_id || "unassigned";
      if (!levelMap.has(lid)) {
        levelMap.set(lid, { level: allLevels.find((l) => l.id === lid) || null, courses: [] });
      }
      levelMap.get(lid)!.courses.push(c);
    });
    return Array.from(levelMap.values()).sort((a, b) => (a.level?.sort_order || 999) - (b.level?.sort_order || 999));
  }, [courses, allLevels, filterLevel]);

  const sessionCountByCourse = (courseId: string) => sessions.filter((s) => s.course_id === courseId).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
          {t("dashboard.welcome")}, {profile?.full_name || t("common.user")}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground capitalize">{roleLabel} {t("nav.dashboard")}</p>
          {!isAdmin && userDepartment && (
            <Badge variant="outline" className="flex items-center gap-1"><Building2 className="h-3 w-3" />{userDepartment.name}</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{stat.value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* 2FA Stats (admin only) */}
      {isAdmin && twoFaStats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {t("otp.twoFactorAuth")} — {t("admin.students")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{twoFaStats.total_students}</p>
                <p className="text-xs text-muted-foreground">{t("otp.totalStudents")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold text-primary">{twoFaStats.totp_enabled}</p>
                <p className="text-xs text-muted-foreground">{t("otp.totpSetup")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <ShieldOff className="h-5 w-5 mx-auto mb-1 text-destructive" />
                <p className="text-2xl font-bold text-destructive">{twoFaStats.total_students - twoFaStats.totp_enabled}</p>
                <p className="text-xs text-muted-foreground">{t("otp.noTotp")}</p>
              </div>
            </div>
            {twoFaStats.total_students > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{t("otp.adoptionRate")}</span>
                  <span>{Math.round((twoFaStats.totp_enabled / twoFaStats.total_students) * 100)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(twoFaStats.totp_enabled / twoFaStats.total_students) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send Notification + Absentee Check (admin/lecturer) */}
      {(isAdmin || isLecturer) && (
        <>
          <SendNotification />
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t("alert.checkAbsentees")}</p>
                  <p className="text-xs text-muted-foreground">{t("alert.checkAbsenteesDesc")}</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await supabase.functions.invoke("check-absentees");
                    toast({ title: t("common.success"), description: t("alert.alertsSent") });
                  } catch {
                    toast({ title: t("common.error"), variant: "destructive" });
                  }
                }}
              >
                {t("alert.runCheck")}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Student Quick Actions */}
      {isStudent && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("dept.myModules")}</p>
                <p className="text-xs text-muted-foreground">{t("dept.viewJoinModules")}</p>
              </div>
            </div>
            <Button onClick={() => navigate("/my-department")} className="gap-1">
              {t("dept.goToModules")} <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* My Enrollment Status (student) */}
      {isStudent && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {t("dashboard.myEnrollmentStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const enrolledCore = (courses || []).filter((c: any) => c.is_core);
              const enrolledOptional = (courses || []).filter((c: any) => c.is_core === false);
              const enrolledOptIds = new Set(enrolledOptional.map((c: any) => c.id));
              const notSelectedOptional = studentOptionalModules.filter((c: any) => !enrolledOptIds.has(c.id));
              const total = enrolledCore.length + enrolledOptional.length + notSelectedOptional.length;
              if (total === 0) {
                return <p className="text-sm text-muted-foreground">{t("dashboard.noModulesEnrolled")}</p>;
              }
              const renderRow = (c: any, status: "core" | "selected" | "not_selected") => {
                const deadlinePassed = c.selection_deadline && new Date(c.selection_deadline) <= new Date();
                return (
                  <div key={`${status}-${c.id}`} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{c.code}</Badge>
                      <span className="text-sm truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {status === "core" && (
                        <Badge variant="default" className="text-[10px] gap-1"><Star className="h-3 w-3" />{t("dashboard.coreAutoEnrolled")}</Badge>
                      )}
                      {status === "selected" && (
                        <Badge variant="secondary" className="text-[10px]">✓ {t("dashboard.optionalSelected")}</Badge>
                      )}
                      {status === "not_selected" && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          {deadlinePassed ? <Lock className="h-3 w-3" /> : null}
                          {t("dashboard.optionalNotSelected")}
                        </Badge>
                      )}
                      {c.selection_deadline && status !== "core" && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          · {formatIntlDate(c.selection_deadline, localeCode, { dateStyle: "medium" })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              };
              return (
                <div className="space-y-0">
                  {enrolledCore.map((c: any) => renderRow(c, "core"))}
                  {enrolledOptional.map((c: any) => renderRow(c, "selected"))}
                  {notSelectedOptional.map((c: any) => renderRow(c, "not_selected"))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Courses grouped by Level */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">
            {isLecturer ? t("admin.lecturerModules") : t("nav.courses")}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {(isAdmin || isLecturer) && allLevels.length > 0 && (
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="w-[220px] h-8 text-xs"><SelectValue placeholder={t("reports.selectLevel")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.allCourses")}</SelectItem>
                  {allLevels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{l.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isLecturer && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("courses.create")}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("courses.create")}</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); if (courseCode.trim() && courseName.trim()) createCourseMutation.mutate(); }} className="space-y-4">
                    <div className="space-y-2"><Label>{t("courses.code")}</Label><Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder={t("courses.codePlaceholder")} required /></div>
                    <div className="space-y-2"><Label>{t("courses.name")}</Label><Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder={t("courses.namePlaceholder")} required /></div>
                    <div className="space-y-2">
                      <Label>{t("common.semester")}</Label>
                      <select value={courseDeptId} onChange={(e) => setCourseDeptId(e.target.value)} className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                        <option value="">{userProfile?.department_id ? t("common.mySemesterDefault") : t("enroll.selectSemester")}</option>
                        {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                      </select>
                    </div>
                    <div className="space-y-2"><Label>{t("courses.description")}</Label><Textarea value={courseDesc} onChange={(e) => setCourseDesc(e.target.value)} placeholder={t("courses.descriptionPlaceholder")} /></div>
                    <Button type="submit" className="w-full" disabled={createCourseMutation.isPending}>{t("courses.create")}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <Link to="/courses" className="text-sm text-primary hover:underline">{t("common.actions")} →</Link>
          </div>
        </div>

        {/* Show modules grouped by level for student/lecturer */}
        {(isStudent || isLecturer) ? (
          <div className="space-y-3">
            {coursesGroupedByLevel.length === 0 ? (
              <Card><CardContent className="py-6"><p className="text-muted-foreground text-sm text-center">{t("courses.empty")}</p></CardContent></Card>
            ) : coursesGroupedByLevel.map((g) => {
              const levelId = g.level?.id || "unassigned";
              const isExpanded = expandedLevel === levelId;
              return (
                <Card key={levelId}>
                  <CardHeader className="cursor-pointer pb-2" onClick={() => setExpandedLevel(isExpanded ? null : levelId)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        <CardTitle className="text-sm">{g.level ? g.level.name : t("dept.unassignedCourses")}</CardTitle>
                        {g.level && <Badge variant="outline" className="text-xs">{g.level.code}</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{g.courses.length} {t("dept.courses")}</Badge>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {g.courses.map((course: any) => (
                          <Card key={course.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="text-xs">{course.code}</Badge>
                                <BookOpen className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <CardTitle className="text-base mt-1">{course.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {course.description && <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{enrollmentCounts[course.id] || 0} {t("courses.students")}</span>
                                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{sessionCountByCourse(course.id)} {t("courses.sessions")}</span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          /* Admin flat view */
          courses.length === 0 ? (
            <Card><CardContent className="py-6"><p className="text-muted-foreground text-sm text-center">{t("courses.empty")}</p></CardContent></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(filterLevel === "all" ? courses : courses.filter((c: any) => c.level_id === filterLevel)).map((course: any) => (
                <Card key={course.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">{course.code}</Badge>
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-base mt-1">{course.name}</CardTitle>
                    {course.departments && (<p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{course.departments.name}</p>)}
                    {course.level_id && (() => { const level = allLevels.find(l => l.id === course.level_id); return level ? (<p className="text-xs text-muted-foreground flex items-center gap-1"><GraduationCap className="h-3 w-3" />{level.code}</p>) : null; })()}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {course.description && <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{enrollmentCounts[course.id] || 0} {t("courses.students")}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{sessionCountByCourse(course.id)} {t("courses.sessions")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Upcoming Sessions & Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t("dashboard.upcomingSessions")}</CardTitle>
          {isLecturer && (
              <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><CalendarPlus className="h-4 w-4 mr-1" />{t("sessions.create")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("sessions.create")}</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); if (sessionTitle.trim() && sessionCourseId) createSessionMutation.mutate(); }} className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("common.title")}</Label>
                      <Input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder={t("sessions.titlePlaceholder")} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("auth.programme")}</Label>
                      <select
                        value={sessionLevelId}
                        onChange={(e) => { setSessionLevelId(e.target.value); setSessionCourseId(""); }}
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        required
                      >
                        <option value="">{t("auth.selectProgramme")}</option>
                        {sessionAvailableLevels.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("nav.courses")}</Label>
                      <select
                        value={sessionCourseId}
                        onChange={(e) => setSessionCourseId(e.target.value)}
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        required
                        disabled={!sessionLevelId}
                      >
                        <option value="">{sessionLevelId ? t("sessions.selectModule") : t("auth.selectProgramme")}</option>
                        {sessionFilteredCourses.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("sessions.venue")}</Label>
                      <Input value={sessionVenue} onChange={(e) => setSessionVenue(e.target.value)} placeholder={t("sessions.venuePlaceholder")} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("sessions.duration")}</Label>
                      <select
                        value={sessionDuration}
                        onChange={(e) => setSessionDuration(e.target.value)}
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="30">30 {t("qr.minutes")}</option>
                        <option value="60">60 {t("qr.minutes")}</option>
                        <option value="90">90 {t("qr.minutes")}</option>
                        <option value="120">120 {t("qr.minutes")}</option>
                      </select>
                    </div>
                    <Button type="submit" className="w-full" disabled={createSessionMutation.isPending}>{t("sessions.create")}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
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
                      <p className="text-xs text-muted-foreground">{(session as any).courses?.code} • {formatIntlDate(session.session_date, localeCode, { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                    <Badge variant={session.status === "active" ? "default" : "secondary"} className="text-xs shrink-0">{sessionStatusLabel(session.status)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg">{t("dashboard.recentActivity")}</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground text-sm">—</p></CardContent>
        </Card>
      </div>

      {/* Analytics Dashboard */}
      {(isAdmin || isLecturer) && courses.length > 0 && sessions.length > 0 && (
        <AnalyticsDashboard courses={courses} sessions={sessions} />
      )}
    </div>
  );
}
