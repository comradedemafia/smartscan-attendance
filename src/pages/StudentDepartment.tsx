import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Users, ChevronRight, LogIn, LogOut, GraduationCap, Calendar } from "lucide-react";

export default function StudentDepartment() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedLecturer, setSelectedLecturer] = useState<string | null>(null);

  // Get student's department
  const { data: studentProfile } = useQuery({
    queryKey: ["student-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department_id, academic_year, study_year, departments(id, name, code, description)")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const departmentId = (studentProfile?.departments as any)?.id;

  // Get lecturers & courses in this department
  const { data: deptLecturers = [] } = useQuery({
    queryKey: ["dept-lecturers", departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_department_lecturers", { _department_id: departmentId });
      if (error) throw error;

      // Group by lecturer
      const map = new Map<string, { lecturer_id: string; full_name: string; university_id: string; courses: { id: string; name: string; code: string }[] }>();
      (data || []).forEach((row: any) => {
        if (!map.has(row.lecturer_id)) {
          map.set(row.lecturer_id, {
            lecturer_id: row.lecturer_id,
            full_name: row.full_name,
            university_id: row.university_id,
            courses: [],
          });
        }
        if (row.course_id) {
          map.get(row.lecturer_id)!.courses.push({
            id: row.course_id,
            name: row.course_name,
            code: row.course_code,
          });
        }
      });
      return Array.from(map.values());
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
      const { error } = await supabase.from("course_enrollments").insert({ course_id: courseId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.unenrolled") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const dept = studentProfile?.departments as any;

  if (!dept) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("dept.myDepartment")}</h1>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{t("dept.noDepartment")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedLecturerData = deptLecturers.find((l) => l.lecturer_id === selectedLecturer);

  return (
    <div className="space-y-6">
      {/* Department Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("dept.myDepartment")}</h1>
        <p className="text-muted-foreground">{profile?.full_name}</p>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <Badge className="mb-2">{dept.code}</Badge>
              <CardTitle className="text-xl">{dept.name}</CardTitle>
              {dept.description && <p className="text-sm text-muted-foreground mt-1">{dept.description}</p>}
            </div>
            <div className="text-right text-sm text-muted-foreground space-y-1">
              {studentProfile?.academic_year && (
                <div className="flex items-center gap-1 justify-end">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{studentProfile.academic_year}</span>
                </div>
              )}
              {studentProfile?.study_year && (
                <div className="flex items-center gap-1 justify-end">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>{t("auth.year")} {studentProfile.study_year}</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Two-panel view: Lecturers + Courses */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lecturers panel */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("dept.lecturers")}
          </h2>
          {deptLecturers.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">{t("dept.noLecturers")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {deptLecturers.map((lecturer) => (
                <Card
                  key={lecturer.lecturer_id}
                  className={`cursor-pointer transition-all hover:shadow-md ${selectedLecturer === lecturer.lecturer_id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setSelectedLecturer(
                    selectedLecturer === lecturer.lecturer_id ? null : lecturer.lecturer_id
                  )}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{lecturer.full_name}</p>
                        <p className="text-xs text-muted-foreground">{lecturer.university_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {lecturer.courses.length} {t("dept.courses")}
                        </Badge>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedLecturer === lecturer.lecturer_id ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Courses panel */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {selectedLecturerData
              ? `${t("dept.coursesBy")} ${selectedLecturerData.full_name}`
              : t("dept.selectLecturerToSee")}
          </h2>

          {!selectedLecturerData ? (
            <Card>
              <CardContent className="py-8 text-center">
                <ChevronRight className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">{t("dept.clickLecturer")}</p>
              </CardContent>
            </Card>
          ) : selectedLecturerData.courses.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">{t("dept.noCourses")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {selectedLecturerData.courses.map((course) => {
                const isEnrolled = myEnrollments.includes(course.id);
                return (
                  <Card key={course.id} className="group hover:shadow-md transition-shadow">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge variant="outline" className="text-xs font-mono">{course.code}</Badge>
                            {isEnrolled && <Badge className="text-xs">{t("dept.enrolled")}</Badge>}
                          </div>
                          <p className="font-medium text-sm truncate">{course.name}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isEnrolled ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate("/sessions")}
                                className="text-xs"
                              >
                                <Calendar className="h-3.5 w-3.5 mr-1" />
                                {t("dept.sessions")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-destructive hover:text-destructive"
                                onClick={() => unenrollMutation.mutate(course.id)}
                                disabled={unenrollMutation.isPending}
                              >
                                <LogOut className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => enrollMutation.mutate(course.id)}
                              disabled={enrollMutation.isPending}
                              className="text-xs"
                            >
                              <LogIn className="h-3.5 w-3.5 mr-1" />
                              {t("courses.joinCourse")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
