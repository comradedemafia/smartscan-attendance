import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BookOpen, LogIn, LogOut, GraduationCap, Calendar, CheckCircle2, Filter, Users, ChevronDown, ChevronRight, Building2, Star, Lock, Search, Clock } from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Tick every second so countdowns update live
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  // When user is searching, auto-expand levels & semesters that contain matches
  useEffect(() => {
    if (!searchTerm.trim()) return;
    const q = searchTerm.trim().toLowerCase();
    const matchingCourses = courses.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.code || "").toLowerCase().includes(q)
    );
    const levelIds = new Set(matchingCourses.map((c) => c.level_id).filter(Boolean) as string[]);
    const semIds = new Set(matchingCourses.map((c) => c.semester_id).filter(Boolean) as string[]);
    if (levelIds.size) setExpandedLevels((prev) => new Set([...prev, ...levelIds]));
    if (semIds.size) setExpandedSemesters((prev) => new Set([...prev, ...semIds]));
  }, [searchTerm, courses]);

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
    const isCore = course.is_core !== false; // default true
    const deadline = course.selection_deadline ? new Date(course.selection_deadline) : null;
    const deadlinePassed = !!deadline && deadline.getTime() <= nowTick;
    const lockedOptional = !isCore && deadlinePassed;

    // Live countdown for optional modules with a deadline
    let countdown: string | null = null;
    let urgency: "ok" | "warn" | "critical" = "ok";
    if (!isCore && deadline && !deadlinePassed) {
      const ms = deadline.getTime() - nowTick;
      const totalSec = Math.floor(ms / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      const dShort = t("courses.daysShort") || "d";
      const hShort = t("courses.hoursShort") || "h";
      const mShort = t("courses.minutesShort") || "m";
      const sShort = t("courses.secondsShort") || "s";
      if (days > 0) countdown = `${days}${dShort} ${hours}${hShort}`;
      else if (hours > 0) countdown = `${hours}${hShort} ${minutes}${mShort}`;
      else if (minutes > 0) countdown = `${minutes}${mShort} ${seconds}${sShort}`;
      else countdown = `${seconds}${sShort}`;
      if (ms <= 30 * 60 * 1000) urgency = "critical";
      else if (ms <= 24 * 60 * 60 * 1000) urgency = "warn";
    }
    const urgencyClass =
      urgency === "critical"
        ? "text-destructive border-destructive/40 animate-pulse"
        : urgency === "warn"
          ? "text-amber-600 border-amber-500/40 dark:text-amber-400"
          : "text-muted-foreground border-muted-foreground/30";

    return (
      <Card key={course.id} className={`transition-all ${isEnrolled ? "border-primary/40 bg-primary/5" : ""}`}>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className="text-xs font-mono">{course.code}</Badge>
              {isCore ? (
                <Badge variant="default" className="text-[10px] gap-1">
                  <Star className="h-3 w-3" />
                  {t("courses.core") || "Core"}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {t("courses.optional") || "Optional"}
                </Badge>
              )}
              {lockedOptional && (
                <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/40">
                  <Lock className="h-3 w-3" />
                  {t("courses.selectionClosed") || "Selection closed"}
                </Badge>
              )}
              {isEnrolled && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
            <p className="text-sm font-medium leading-tight">{course.name}</p>
            {course.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course.description}</p>
            )}
          </div>
          {countdown && (
            <div className={`flex items-center gap-1.5 text-[11px] font-medium border rounded-md px-2 py-1 ${urgencyClass}`}>
              <Clock className="h-3.5 w-3.5" />
              <span>{t("courses.timeLeft") || "Time left"}: <span className="font-mono">{countdown}</span></span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{enrollmentCounts[course.id] || 0} {t("dept.studentsEnrolled")}</span>
          </div>
          <div className="flex items-center gap-2">
            {isCore ? (
              <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => navigate("/sessions")}>
                <Calendar className="h-3.5 w-3.5 mr-1" />{t("dept.sessions")}
              </Button>
            ) : isEnrolled ? (
              <>
                <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => navigate("/sessions")}>
                  <Calendar className="h-3.5 w-3.5 mr-1" />{t("dept.sessions")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => setConfirmLeaveId(course.id)} disabled={unenrollMutation.isPending || lockedOptional}>
                  <LogOut className="h-3.5 w-3.5 mr-1" />{t("dept.leave")}
                </Button>
              </>
            ) : (
              <Button size="sm" className="text-xs w-full" onClick={() => enrollMutation.mutate(course.id)} disabled={enrollMutation.isPending || lockedOptional}>
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
      if (c.semester_id !== selectedSemesterId) return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const inName = (c.name || "").toLowerCase().includes(q);
      const inCode = (c.code || "").toLowerCase().includes(q);
      if (!inName && !inCode) return false;
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
          {t("dept.myDepartmentTitle") || "My Department"}
        </h1>
        <p className="text-muted-foreground">
          {profile?.full_name} • {dept.name}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("dept.searchPlaceholder") || "Search modules…"}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                {myEnrollments.length} {t("dept.modulesJoined")}
              </Badge>
              {studentProfile?.academic_year && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {studentProfile.academic_year}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        </CardContent>
      </Card>

      {/* Department card (collapsible) */}
      <Card className="border-primary/20">
        <button
          type="button"
          onClick={() => setDeptExpanded((v) => !v)}
          className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
        >
          {deptExpanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-primary" />}
          <Building2 className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="text-base font-semibold leading-tight">{dept.name}</h2>
            {dept.description && <p className="text-xs text-muted-foreground line-clamp-1">{dept.description}</p>}
          </div>
          <Badge variant="secondary" className="text-xs">
            {courses.length} {t("dept.modules") || "modules"}
          </Badge>
        </button>

        {deptExpanded && (
          <CardContent className="pt-0 pb-4 space-y-3">
            {coursesByLevel.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">{t("dept.noLevels")}</p>
            )}

            {coursesByLevel.map((level) => {
              const isLevelOpen = expandedLevels.has(level.id);
              return (
                <div key={level.id} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleLevel(level.id)}
                    className="w-full flex items-center gap-2 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  >
                    {isLevelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <GraduationCap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold flex-1">{level.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{level.code}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{level.totalCourses}</Badge>
                  </button>

                  {isLevelOpen && (
                    <div className="p-3 space-y-3">
                      {level.totalCourses === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">{t("dept.noModulesInLevel")}</p>
                      ) : (
                        <>
                          {level.semesters.map((sem: any) => {
                            const isSemOpen = expandedSemesters.has(sem.id);
                            return (
                              <div key={sem.id} className="border rounded-md">
                                <button
                                  type="button"
                                  onClick={() => toggleSemester(sem.id)}
                                  className="w-full flex items-center gap-2 p-2 hover:bg-muted/40 transition-colors text-left"
                                >
                                  {isSemOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold flex-1">{sem.name}</span>
                                  <Badge variant="outline" className="text-[10px] font-mono">{sem.code}</Badge>
                                  <Badge variant="secondary" className="text-[10px]">{sem.courses.length}</Badge>
                                </button>
                                {isSemOpen && (
                                  <div className="p-2">
                                    {sem.courses.length === 0 ? (
                                      <p className="text-xs text-muted-foreground text-center py-2">{t("dept.noModulesInLevel")}</p>
                                    ) : (
                                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {sem.courses.map((course: any) => renderCourseCard(course))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {level.coursesNoSemester.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold mb-2 text-muted-foreground px-1">{t("dept.otherModules")}</h4>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {level.coursesNoSemester.map((course: any) => renderCourseCard(course))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned modules (no level set) */}
            {unassignedCourses.length > 0 && selectedSemesterId === "all" && (
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-3">{t("dept.otherModules")}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {unassignedCourses.map((course) => renderCourseCard(course))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

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
