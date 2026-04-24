import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Edit, Users, LogIn, LogOut, UserCog, Building2, ChevronDown, ChevronRight, GraduationCap, Lock, Star, Clock, Bell, Unlock, AlertTriangle } from "lucide-react";

type Level = { id: string; name: string; code: string; department_id: string; sort_order: number };

export default function Courses() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [courseDeptId, setCourseDeptId] = useState("");
  const [courseLevelId, setCourseLevelId] = useState("");
  const [courseIsCore, setCourseIsCore] = useState(true);
  const [courseSelectionDeadline, setCourseSelectionDeadline] = useState("");
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [forceCloseId, setForceCloseId] = useState<string | null>(null);
  const [forceOpenId, setForceOpenId] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isLecturer = role === "lecturer";
  const isStudent = role === "student";
  const canCreate = isAdmin || isLecturer;

  const { data: lecturerProfile } = useQuery({
    queryKey: ["lecturer-profile-dept", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("department_id").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: (isLecturer || isStudent) && !!user,
  });

  // Lecturer: fetch only assigned courses via course_lecturers
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses", user?.id, role],
    queryFn: async () => {
      if (role === "lecturer") {
        // Lecturer sees only modules they created
        const { data, error } = await supabase
          .from("courses")
          .select("*, course_enrollments(count), departments(name)")
          .eq("created_by", user!.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      if (role === "student") {
        // Only enrolled modules
        const { data, error } = await supabase
          .from("course_enrollments")
          .select("course_id, courses(*, course_enrollments(count), departments(name))")
          .eq("user_id", user!.id);
        if (error) throw error;
        return (data || []).map((r: any) => r.courses).filter(Boolean);
      }
      // Admin sees all
      const { data, error } = await supabase
        .from("courses")
        .select("*, course_enrollments(count), departments(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: canCreate || isAdmin,
  });

  const { data: allLevels = [] } = useQuery<Level[]>({
    queryKey: ["all-levels-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("*").order("sort_order");
      if (error) throw error;
      return data as Level[];
    },
  });

  const { data: myEnrollments = [] } = useQuery({
    queryKey: ["my-enrollments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_enrollments").select("course_id").eq("user_id", user!.id);
      if (error) throw error;
      return data.map((e) => e.course_id);
    },
    enabled: isStudent && !!user,
  });

  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase.from("course_enrollments").insert({ course_id: courseId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.enrolled") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const unenrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase.from("course_enrollments").delete().eq("course_id", courseId).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.unenrolled") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const createCourseMutation = useMutation({
    mutationFn: async () => {
      const deptId = isLecturer ? (lecturerProfile?.department_id || courseDeptId || null) : (courseDeptId || null);
      const { data: newCourse, error } = await supabase.from("courses").insert({
        code: courseCode.toUpperCase(), name: courseName, description: courseDesc || null,
        department_id: deptId, level_id: courseLevelId || null, created_by: user!.id,
        is_core: courseIsCore,
        selection_deadline: !courseIsCore && courseSelectionDeadline ? new Date(courseSelectionDeadline).toISOString() : null,
      }).select("id").single();
      if (error) throw error;
      if (isLecturer && newCourse) {
        await supabase.from("course_lecturers").insert({ course_id: newCourse.id, lecturer_id: user!.id, assigned_by: user!.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: t("dept.courseCreated") });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("courses").update({
        code: courseCode.toUpperCase(), name: courseName, description: courseDesc || null,
        department_id: courseDeptId || null, level_id: courseLevelId || null,
        is_core: courseIsCore,
        selection_deadline: !courseIsCore && courseSelectionDeadline ? new Date(courseSelectionDeadline).toISOString() : null,
      }).eq("id", editingCourse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: t("dept.courseUpdated") });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: t("dept.courseDeleted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const forceCloseMutation = useMutation({
    mutationFn: async (id: string) => {
      // Set deadline to 1 second ago — effectively closes selection
      const past = new Date(Date.now() - 1000).toISOString();
      const { error } = await supabase.from("courses").update({ selection_deadline: past }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: t("courses.selectionClosedNow") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const forceOpenMutation = useMutation({
    mutationFn: async (id: string) => {
      // Extend deadline by 7 days from now
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("courses").update({ selection_deadline: future }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: t("courses.selectionReopened") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Optional modules with deadlines closing within next 3 days (admin/lecturer alert)
  const upcomingClosures = useMemo(() => {
    if (!canCreate) return [];
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    return (courses || []).filter((c: any) =>
      c.is_core === false &&
      c.selection_deadline &&
      new Date(c.selection_deadline).getTime() > now &&
      new Date(c.selection_deadline).getTime() - now <= threeDays
    );
  }, [courses, canCreate]);

  const resetForm = () => { setOpen(false); setEditingCourse(null); setCourseCode(""); setCourseName(""); setCourseDesc(""); setCourseDeptId(""); setCourseLevelId(""); setCourseIsCore(true); setCourseSelectionDeadline(""); };
  const openEditCourse = (course: any) => {
    setEditingCourse(course);
    setCourseCode(course.code);
    setCourseName(course.name);
    setCourseDesc(course.description || "");
    setCourseDeptId(course.department_id || "");
    setCourseLevelId(course.level_id || "");
    setCourseIsCore(course.is_core ?? true);
    setCourseSelectionDeadline(course.selection_deadline ? new Date(course.selection_deadline).toISOString().slice(0, 16) : "");
    setOpen(true);
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!courseCode.trim() || !courseName.trim()) return; editingCourse ? updateCourseMutation.mutate() : createCourseMutation.mutate(); };

  const deptLevels = (deptId: string) => allLevels.filter((l) => l.department_id === deptId);
  const courseDeptLevels = courseDeptId ? deptLevels(courseDeptId) : [];

  const renderCourseCard = (course: any) => (
    <Card key={course.id} className="relative group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{course.code}</p>
            <CardTitle className="text-base mt-1">{course.name}</CardTitle>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {course.is_core ? (
                <Badge variant="default" className="text-[10px] gap-1"><Star className="h-3 w-3" />{t("courses.coreShort")}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">{t("courses.optionalShort")}</Badge>
              )}
              {!course.is_core && course.selection_deadline && (
                (() => {
                  const closed = new Date(course.selection_deadline) <= new Date();
                  return (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      {closed ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {closed ? t("courses.selectionClosed") : new Date(course.selection_deadline).toLocaleString()}
                    </Badge>
                  );
                })()
              )}
            </div>
          </div>
          {(isAdmin || (isLecturer && course.created_by === user?.id)) && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCourse(course)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteCourseId(course.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {course.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{course.description}</p>}
        {(isAdmin || (isLecturer && course.created_by === user?.id)) && course.is_core === false && (
          <div className="flex items-center gap-1 mb-2">
            {(() => {
              const closed = course.selection_deadline && new Date(course.selection_deadline) <= new Date();
              return closed ? (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setForceOpenId(course.id)}>
                  <Unlock className="h-3 w-3" />{t("courses.forceOpen")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-destructive" onClick={() => setForceCloseId(course.id)}>
                  <Lock className="h-3 w-3" />{t("courses.forceClose")}
                </Button>
              );
            })()}
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{course.course_enrollments?.[0]?.count ?? 0} {t("courses.students")}</span>
          </div>
          <div className="flex items-center gap-1">
            {(isAdmin || isLecturer) && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/courses/${course.id}/students`)}>
                <UserCog className="h-3.5 w-3.5 mr-1" />{t("courses.manageStudents")}
              </Button>
            )}
            {isStudent && (
              (() => {
                const enrolled = myEnrollments.includes(course.id);
                const deadlinePassed = course.selection_deadline && new Date(course.selection_deadline) <= new Date();
                if (course.is_core) {
                  return <Badge variant="default" className="text-xs gap-1"><Star className="h-3 w-3" />{t("courses.compulsoryNotice").split(' — ')[0]}</Badge>;
                }
                if (enrolled) {
                  return (
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">✓ {t("courses.selected")}</Badge>
                      {!deadlinePassed && (
                        <Button size="sm" variant="ghost" onClick={() => unenrollMutation.mutate(course.id)} disabled={unenrollMutation.isPending}>
                          <LogOut className="h-3.5 w-3.5 mr-1" />{t("courses.unenroll")}
                        </Button>
                      )}
                    </div>
                  );
                }
                if (deadlinePassed) {
                  return <Badge variant="outline" className="text-xs gap-1"><Lock className="h-3 w-3" />{t("courses.selectionClosed")}</Badge>;
                }
                return (
                  <Button size="sm" onClick={() => enrollMutation.mutate(course.id)} disabled={enrollMutation.isPending}>
                    <LogIn className="h-3.5 w-3.5 mr-1" />{t("courses.joinCourse")}
                  </Button>
                );
              })()
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Group courses by level for lecturer & student
  const renderGroupedByLevel = () => {
    const levelMap = new Map<string, { level: Level | null; courses: any[] }>();
    courses.forEach((c: any) => {
      const lid = c.level_id || "unassigned";
      if (!levelMap.has(lid)) {
        levelMap.set(lid, { level: allLevels.find((l) => l.id === lid) || null, courses: [] });
      }
      levelMap.get(lid)!.courses.push(c);
    });
    const groups = Array.from(levelMap.values()).sort((a, b) => (a.level?.sort_order || 999) - (b.level?.sort_order || 999));

    return (
      <div className="space-y-4">
        {groups.map((g) => {
          const levelId = g.level?.id || "unassigned";
          const isExpanded = expandedLevel === levelId;
          return (
            <Card key={levelId}>
              <CardHeader
                className="cursor-pointer pb-3"
                onClick={() => setExpandedLevel(isExpanded ? null : levelId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">
                      {g.level ? g.level.name : t("dept.unassignedCourses")}
                    </CardTitle>
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    {g.courses.map((course: any) => renderCourseCard(course))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        {courses.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">{t("courses.empty")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Admin view: Semester -> Level -> Modules
  const renderAdminView = () => {
    const coursesByDept = departments.map((dept) => ({
      ...dept,
      courses: courses.filter((c: any) => c.department_id === dept.id),
      levels: deptLevels(dept.id),
    }));
    const unassignedCourses = courses.filter((c: any) => !c.department_id);

    return (
      <div className="space-y-4">
        {coursesByDept.map((dept) => {
          const isExpanded = expandedDept === dept.id;
          return (
            <Card key={dept.id}>
              <CardHeader className="cursor-pointer pb-3" onClick={() => setExpandedDept(isExpanded ? null : dept.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{dept.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{dept.levels.length} {t("dept.levels")}</Badge>
                    <Badge variant="outline">{dept.courses.length} {t("dept.courses")}</Badge>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="pt-0 space-y-3">
                  {dept.levels.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("dept.noLevels")}</p>
                  ) : (
                    dept.levels.map((level) => {
                      const lvlCourses = courses.filter((c: any) => c.level_id === level.id);
                      const isLvlExpanded = expandedLevel === level.id;
                      return (
                        <div key={level.id} className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50" onClick={() => setExpandedLevel(isLvlExpanded ? null : level.id)}>
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">{level.name}</span>
                              <Badge variant="outline" className="text-xs">{level.code}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{lvlCourses.length} {t("dept.courses")}</Badge>
                              {isLvlExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </div>
                          </div>
                          {isLvlExpanded && (
                            <div className="px-3 pb-3 bg-muted/20">
                              {lvlCourses.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">{t("courses.empty")}</p>
                              ) : (
                                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                                  {lvlCourses.map((course: any) => renderCourseCard(course))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {(() => {
                    const noLevelCourses = dept.courses.filter((c: any) => !c.level_id);
                    if (noLevelCourses.length === 0) return null;
                    return (
                      <div className="pt-2">
                        <p className="text-xs text-muted-foreground mb-2">{t("dept.unassignedCourses")}</p>
                        <div className="grid gap-4 sm:grid-cols-2">{noLevelCourses.map((course: any) => renderCourseCard(course))}</div>
                      </div>
                    );
                  })()}
                </CardContent>
              )}
            </Card>
          );
        })}
        {unassignedCourses.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base text-muted-foreground">{t("dept.unassignedCourses")}</CardTitle></CardHeader>
            <CardContent><div className="grid gap-4 sm:grid-cols-2">{unassignedCourses.map((course: any) => renderCourseCard(course))}</div></CardContent>
          </Card>
        )}
        {courses.length === 0 && (
          <Card><CardContent className="py-8 text-center"><BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" /><p className="text-muted-foreground">{t("courses.empty")}</p></CardContent></Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("courses.title")}</h1>
        {canCreate && (
          <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />{t("courses.create")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCourse ? t("dept.editCourse") : t("courses.create")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("courses.code")}</Label>
                  <Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="CS101" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("courses.name")}</Label>
                  <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Introduction to CS" required />
                </div>
                <div className="space-y-2">
                  <Label>Semester</Label>
                  <Select value={courseDeptId} onValueChange={(v) => { setCourseDeptId(v); setCourseLevelId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select Semester" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {courseDeptLevels.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("dept.level")}</Label>
                    <Select value={courseLevelId} onValueChange={setCourseLevelId}>
                      <SelectTrigger><SelectValue placeholder={t("dept.selectLevel")} /></SelectTrigger>
                      <SelectContent>
                        {courseDeptLevels.map((l) => (<SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{t("courses.description")}</Label>
                  <Textarea value={courseDesc} onChange={(e) => setCourseDesc(e.target.value)} placeholder="Optional description" />
                </div>
                <div className="space-y-2">
                  <Label>{t("courses.moduleType")}</Label>
                  <Select value={courseIsCore ? "core" : "optional"} onValueChange={(v) => setCourseIsCore(v === "core")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="core">⭐ {t("courses.core")}</SelectItem>
                      <SelectItem value="optional">{t("courses.optional")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!courseIsCore && (
                  <div className="space-y-2">
                    <Label>{t("courses.selectionDeadline")}</Label>
                    <Input
                      type="datetime-local"
                      value={courseSelectionDeadline}
                      onChange={(e) => setCourseSelectionDeadline(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t("courses.selectionDeadlineHint")}</p>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createCourseMutation.isPending || updateCourseMutation.isPending}>
                  {editingCourse ? t("common.save") : t("courses.create")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : isAdmin ? (
        renderAdminView()
      ) : (
        renderGroupedByLevel()
      )}

      <ConfirmDialog
        open={!!deleteCourseId}
        onOpenChange={(open) => !open && setDeleteCourseId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDeleteCourse")}
        onConfirm={() => {
          if (deleteCourseId) deleteCourseMutation.mutate(deleteCourseId);
          setDeleteCourseId(null);
        }}
      />
    </div>
  );
}
