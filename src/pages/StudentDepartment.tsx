import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BookOpen, LogIn, LogOut, GraduationCap, Calendar, CheckCircle2, Filter, Users, ChevronDown, ChevronRight, Building2, Star, Lock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function StudentDepartment() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLevelId, setSelectedLevelId] = useState<string | "all">("all");
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | "all">("all");
  const [confirmLeaveId, setConfirmLeaveId] = useState<string | null>(null);
  const [deptExpanded, setDeptExpanded] = useState(true);
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set());
  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set());

  // Get student profile with department info
  const { data: studentProfile } = useQuery({
    queryKey: ["student-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department_id, academic_year, study_year, departments(id, name, description)")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const departmentId = (studentProfile?.departments as any)?.id;

  // Get levels for this department
  const { data: levels = [] } = useQuery({
    queryKey: ["dept-levels", departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("id, name, code, sort_order")
        .eq("department_id", departmentId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!departmentId,
  });

  // Get all courses for this department, grouped by level
  const { data: courses = [] } = useQuery({
    queryKey: ["dept-courses", departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, code, level_id, semester_id, description, is_core, selection_deadline")
        .eq("department_id", departmentId)
        .order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!departmentId,
  });

  // Get semesters for this department's levels
  const { data: semesters = [] } = useQuery({
    queryKey: ["dept-semesters", departmentId],
    queryFn: async () => {
      if (!departmentId) return [];
      const levelIds = (levels || []).map((l) => l.id);
      if (levelIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("semesters")
        .select("id, name, code, level_id, sort_order")
        .in("level_id", levelIds)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!departmentId && levels.length > 0,
  });

  // Get student's enrollments
  const { data: myEnrollments = [] } = useQuery({
    queryKey: ["my-enrollments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((e) => e.course_id);
    },
    enabled: !!user,
  });

  // Get enrollment counts per course
  const { data: enrollmentCounts = {} } = useQuery({
    queryKey: ["enrollment-counts", departmentId],
    queryFn: async () => {
      const courseIds = courses.map((c) => c.id);
      if (courseIds.length === 0) return {};
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .in("course_id", courseIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((e) => {
        counts[e.course_id] = (counts[e.course_id] || 0) + 1;
      });
      return counts;
    },
    enabled: courses.length > 0,
  });

  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase
        .from("course_enrollments")
        .insert({ course_id: courseId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.enrolled") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const unenrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase
        .from("course_enrollments")
        .delete()
        .eq("course_id", courseId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.unenrolled") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Auto-select student's level based on study_year → sort_order match
  useEffect(() => {
    if (levels.length > 0 && studentProfile?.study_year && selectedLevelId === "all") {
      const matchedLevel = levels.find((l) => l.sort_order === studentProfile.study_year);
      if (matchedLevel) setSelectedLevelId(matchedLevel.id);
    }
  }, [levels, studentProfile?.study_year]);

  // Auto-expand the student's level and its semesters once loaded
  useEffect(() => {
    if (levels.length > 0 && studentProfile?.study_year && expandedLevels.size === 0) {
      const matched = levels.find((l) => l.sort_order === studentProfile.study_year);
      if (matched) {
        setExpandedLevels(new Set([matched.id]));
      } else {
        setExpandedLevels(new Set([levels[0].id]));
      }
    }
  }, [levels, studentProfile?.study_year]);

  useEffect(() => {
    if (semesters.length > 0 && expandedSemesters.size === 0) {
      // Expand all semesters belonging to currently expanded levels by default
      const ids = (semesters as any[])
        .filter((s) => expandedLevels.has(s.level_id))
        .map((s) => s.id);
      if (ids.length > 0) setExpandedSemesters(new Set(ids));
    }
  }, [semesters, expandedLevels]);

  const toggleLevel = (id: string) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSemester = (id: string) => {
    setExpandedSemesters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const dept = studentProfile?.departments as any;

  if (!dept) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
          {t("dept.myDepartment")}
        </h1>
        <Card>
          <CardContent className="py-10 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{t("dept.noDepartment")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderCourseCard = (course: any) => {
    const isEnrolled = myEnrollments.includes(course.id);
    return (
      <Card key={course.id} className={`transition-all ${isEnrolled ? "border-primary/40 bg-primary/5" : ""}`}>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs font-mono">{course.code}</Badge>
              {isEnrolled && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
            <p className="text-sm font-medium leading-tight">{course.name}</p>
            {course.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{enrollmentCounts[course.id] || 0} {t("dept.studentsEnrolled")}</span>
          </div>
          <div className="flex items-center gap-2">
            {isEnrolled ? (
              <>
                <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => navigate("/sessions")}>
                  <Calendar className="h-3.5 w-3.5 mr-1" />{t("dept.sessions")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => setConfirmLeaveId(course.id)} disabled={unenrollMutation.isPending}>
                  <LogOut className="h-3.5 w-3.5 mr-1" />{t("dept.leave")}
                </Button>
              </>
            ) : (
              <Button size="sm" className="text-xs w-full" onClick={() => enrollMutation.mutate(course.id)} disabled={enrollMutation.isPending}>
                <LogIn className="h-3.5 w-3.5 mr-1" />{t("courses.joinCourse")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Filter levels based on selection
  const filteredLevels = selectedLevelId === "all"
    ? levels
    : levels.filter((l) => l.id === selectedLevelId);

  // Filter semesters by selected level (and by selected semester)
  const visibleSemesterIds = new Set(
    semesters
      .filter((s: any) =>
        (selectedLevelId === "all" || s.level_id === selectedLevelId) &&
        (selectedSemesterId === "all" || s.id === selectedSemesterId)
      )
      .map((s: any) => s.id)
  );

  const filterCourse = (c: any) => {
    if (selectedSemesterId !== "all") {
      return c.semester_id === selectedSemesterId;
    }
    return true;
  };

  // Group courses by Level → Semester
  const coursesByLevel = filteredLevels.map((level) => {
    const levelSemesters = semesters
      .filter((s: any) => s.level_id === level.id)
      .filter((s: any) => selectedSemesterId === "all" || s.id === selectedSemesterId);
    const levelCourses = courses.filter((c) => c.level_id === level.id).filter(filterCourse);
    return {
      ...level,
      semesters: levelSemesters.map((s: any) => ({
        ...s,
        courses: levelCourses.filter((c) => c.semester_id === s.id),
      })),
      coursesNoSemester: levelCourses.filter((c) => !c.semester_id),
      totalCourses: levelCourses.length,
    };
  });

  // Courses without a level (only show when "all" is selected)
  const unassignedCourses = selectedLevelId === "all"
    ? courses.filter((c) => !c.level_id)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
          {t("dept.myModules")}
        </h1>
        <p className="text-muted-foreground">
          {profile?.full_name} • {dept.name}
        </p>
      </div>

      {/* Department info + Level filter */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GraduationCap className="h-4 w-4" />
              <span>{dept.name}</span>
              {studentProfile?.academic_year && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {studentProfile.academic_year}
                </span>
              )}
              <Badge variant="secondary">
                {myEnrollments.length} {t("dept.modulesJoined")}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedLevelId} onValueChange={setSelectedLevelId}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder={t("dept.selectLevel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("dept.allLevels")}</SelectItem>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.name} ({level.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSemesterId} onValueChange={setSelectedSemesterId}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder={t("dept.selectSemesterFilter")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("dept.allSemesters")}</SelectItem>
                  {semesters
                    .filter((s: any) => selectedLevelId === "all" || s.level_id === selectedLevelId)
                    .map((sem: any) => (
                      <SelectItem key={sem.id} value={sem.id}>
                        {sem.name} ({sem.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modules by Level */}
      {coursesByLevel.map((level) => (
        <div key={level.id}>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {level.name}
            <Badge variant="outline" className="text-xs font-mono">
              {level.code}
            </Badge>
            <Badge variant="secondary" className="text-xs">{level.totalCourses}</Badge>
          </h2>
          {level.totalCourses === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">{t("dept.noModulesInLevel")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {level.semesters.map((sem: any) => (
                <div key={sem.id}>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {sem.name}
                    <Badge variant="outline" className="text-[10px] font-mono">{sem.code}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{sem.courses.length}</Badge>
                  </h3>
                  {sem.courses.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-6">{t("dept.noModulesInLevel")}</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {sem.courses.map((course: any) => renderCourseCard(course))}
                    </div>
                  )}
                </div>
              ))}
              {level.coursesNoSemester.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground">{t("dept.otherModules")}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {level.coursesNoSemester.map((course: any) => renderCourseCard(course))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Unassigned modules (no level set) */}
      {unassignedCourses.length > 0 && selectedSemesterId === "all" && (
        <div>
          <h2 className="text-lg font-semibold mb-3">{t("dept.otherModules")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unassignedCourses.map((course) => renderCourseCard(course))}
          </div>
        </div>
      )}

      {courses.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{t("dept.noModulesYet")}</p>
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={!!confirmLeaveId}
        onOpenChange={(open) => !open && setConfirmLeaveId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmLeaveModule")}
        onConfirm={() => {
          if (confirmLeaveId) unenrollMutation.mutate(confirmLeaveId);
          setConfirmLeaveId(null);
        }}
        confirmLabel={t("dept.leave")}
      />
    </div>
  );
}
