import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, LogIn, LogOut, GraduationCap, Calendar, CheckCircle2 } from "lucide-react";

export default function StudentDepartment() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
        .select("id, name, code, level_id, description")
        .eq("department_id", departmentId)
        .order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!departmentId,
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

  // Group courses by level
  const coursesByLevel = levels.map((level) => ({
    ...level,
    courses: courses.filter((c) => c.level_id === level.id),
  }));

  // Courses without a level
  const unassignedCourses = courses.filter((c) => !c.level_id);

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

      {/* Department & student info */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GraduationCap className="h-4 w-4" />
              <span>{dept.name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {studentProfile?.academic_year && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {studentProfile.academic_year}
                </span>
              )}
              {studentProfile?.study_year && (
                <span>
                  {t("auth.year")} {studentProfile.study_year}
                </span>
              )}
              <Badge variant="secondary">
                {myEnrollments.length} {t("dept.modulesJoined")}
              </Badge>
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
          </h2>
          {level.courses.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">{t("dept.noModulesInLevel")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {level.courses.map((course) => {
                const isEnrolled = myEnrollments.includes(course.id);
                return (
                  <Card
                    key={course.id}
                    className={`transition-all ${isEnrolled ? "border-primary/40 bg-primary/5" : ""}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs font-mono">
                            {course.code}
                          </Badge>
                          {isEnrolled && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <p className="text-sm font-medium leading-tight">{course.name}</p>
                        {course.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {course.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEnrolled ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs flex-1"
                              onClick={() => navigate("/sessions")}
                            >
                              <Calendar className="h-3.5 w-3.5 mr-1" />
                              {t("dept.sessions")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-destructive"
                              onClick={() => unenrollMutation.mutate(course.id)}
                              disabled={unenrollMutation.isPending}
                            >
                              <LogOut className="h-3.5 w-3.5 mr-1" />
                              {t("dept.leave")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            className="text-xs w-full"
                            onClick={() => enrollMutation.mutate(course.id)}
                            disabled={enrollMutation.isPending}
                          >
                            <LogIn className="h-3.5 w-3.5 mr-1" />
                            {t("courses.joinCourse")}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Unassigned modules */}
      {unassignedCourses.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">{t("dept.otherModules")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unassignedCourses.map((course) => {
              const isEnrolled = myEnrollments.includes(course.id);
              return (
                <Card
                  key={course.id}
                  className={`transition-all ${isEnrolled ? "border-primary/40 bg-primary/5" : ""}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs font-mono">
                          {course.code}
                        </Badge>
                        {isEnrolled && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-sm font-medium">{course.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEnrolled ? (
                        <>
                          <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => navigate("/sessions")}>
                            <Calendar className="h-3.5 w-3.5 mr-1" />{t("dept.sessions")}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => unenrollMutation.mutate(course.id)} disabled={unenrollMutation.isPending}>
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
            })}
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
    </div>
  );
}
