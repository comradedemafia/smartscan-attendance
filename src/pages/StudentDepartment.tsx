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
import { BookOpen, Users, ChevronRight, ChevronDown, LogIn, LogOut, GraduationCap, Calendar, FileText } from "lucide-react";

export default function StudentDepartment() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedLecturer, setExpandedLecturer] = useState<string | null>(null);

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
      const map = new Map<string, { lecturer_id: string; full_name: string; university_id: string; courses: { id: string; name: string; code: string }[] }>();
      (data || []).forEach((row: any) => {
        if (!map.has(row.lecturer_id)) {
          map.set(row.lecturer_id, { lecturer_id: row.lecturer_id, full_name: row.full_name, university_id: row.university_id, courses: [] });
        }
        if (row.course_id) {
          map.get(row.lecturer_id)!.courses.push({ id: row.course_id, name: row.course_name, code: row.course_code });
        }
      });
      return Array.from(map.values());
    },
    enabled: !!departmentId,
  });

  // Get all subjects for this department's courses
  const { data: deptSubjects = [] } = useQuery({
    queryKey: ["dept-subjects", departmentId],
    queryFn: async () => {
      const courseIds = deptLecturers.flatMap((l) => l.courses.map((c) => c.id));
      if (!courseIds.length) return [];
      const { data, error } = await supabase
        .from("subjects")
        .select("id, code, name, course_id, created_by")
        .in("course_id", courseIds);
      if (error) throw error;
      return data;
    },
    enabled: deptLecturers.length > 0,
  });

  // Get student's enrollments
  const { data: myEnrollments = [] } = useQuery({
    queryKey: ["my-enrollments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_enrollments").select("course_id").eq("user_id", user!.id);
      if (error) throw error;
      return data.map((e) => e.course_id);
    },
    enabled: !!user,
  });

  const { data: mySubjectEnrollments = [] } = useQuery({
    queryKey: ["my-subject-enrollments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_enrollments").select("subject_id").eq("user_id", user!.id);
      if (error) throw error;
      return data.map((e) => e.subject_id);
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

  const enrollSubjectMutation = useMutation({
    mutationFn: async (subjectId: string) => {
      const { error } = await supabase.from("subject_enrollments").insert({ subject_id: subjectId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subject-enrollments"] });
      toast({ title: t("common.success"), description: t("subjects.enrolled") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const unenrollSubjectMutation = useMutation({
    mutationFn: async (subjectId: string) => {
      const { error } = await supabase.from("subject_enrollments").delete().eq("subject_id", subjectId).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subject-enrollments"] });
      toast({ title: t("common.success"), description: t("subjects.unenrolled") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const dept = studentProfile?.departments as any;

  if (!dept) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("dept.myDepartment")}</h1>
        <Card>
          <CardContent className="py-10 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{t("dept.noDepartment")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get subjects taught by a lecturer (created_by matches)
  const lecturerSubjects = (lecturerId: string, courseId: string) =>
    deptSubjects.filter((s: any) => s.course_id === courseId && s.created_by === lecturerId);

  return (
    <div className="space-y-6">
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

      {/* Lecturers with their courses and subjects */}
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
          <div className="space-y-3">
            {deptLecturers.map((lecturer) => {
              const isExpanded = expandedLecturer === lecturer.lecturer_id;
              return (
                <Card key={lecturer.lecturer_id} className={isExpanded ? "border-primary/40" : ""}>
                  <CardHeader
                    className="pb-2 cursor-pointer"
                    onClick={() => setExpandedLecturer(isExpanded ? null : lecturer.lecturer_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{lecturer.full_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{lecturer.university_id} • {dept.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {lecturer.courses.length} {t("dept.courses")}
                        </Badge>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0 space-y-3">
                      {lecturer.courses.map((course) => {
                        const isEnrolled = myEnrollments.includes(course.id);
                        const subjects = lecturerSubjects(lecturer.lecturer_id, course.id);
                        return (
                          <div key={course.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-primary" />
                                <Badge variant="outline" className="text-xs font-mono">{course.code}</Badge>
                                <span className="text-sm font-medium">{course.name}</span>
                                {isEnrolled && <Badge className="text-xs">{t("dept.enrolled")}</Badge>}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isEnrolled ? (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => navigate("/sessions")} className="text-xs">
                                      <Calendar className="h-3.5 w-3.5 mr-1" />{t("dept.sessions")}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => unenrollMutation.mutate(course.id)} disabled={unenrollMutation.isPending}>
                                      <LogOut className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="sm" onClick={() => enrollMutation.mutate(course.id)} disabled={enrollMutation.isPending} className="text-xs">
                                    <LogIn className="h-3.5 w-3.5 mr-1" />{t("courses.joinCourse")}
                                  </Button>
                                )}
                              </div>
                            </div>
                            {/* Subjects under this course by this lecturer */}
                            {subjects.length > 0 && (
                              <div className="ml-6 space-y-1">
                                {subjects.map((s: any) => {
                                  const isSubEnrolled = mySubjectEnrollments.includes(s.id);
                                  return (
                                    <div key={s.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-1.5 text-xs">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-mono text-muted-foreground">{s.code}</span>
                                        <span>{s.name}</span>
                                        {isSubEnrolled && <Badge variant="secondary" className="text-[10px] h-4">{t("dept.enrolled")}</Badge>}
                                      </div>
                                      {isSubEnrolled ? (
                                        <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => unenrollSubjectMutation.mutate(s.id)}>
                                          <LogOut className="h-3 w-3 mr-0.5" />{t("subjects.leaveSubject")}
                                        </Button>
                                      ) : (
                                        <Button variant="ghost" size="sm" className="h-5 text-xs px-1 text-primary" onClick={() => enrollSubjectMutation.mutate(s.id)}>
                                          <LogIn className="h-3 w-3 mr-0.5" />{t("subjects.joinSubject")}
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
