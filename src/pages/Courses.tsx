import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Trash2, Edit, Users, LogIn, LogOut, UserCog, Building2, ChevronDown, ChevronRight } from "lucide-react";

export default function Courses() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [courseDeptId, setCourseDeptId] = useState("");
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isLecturer = role === "lecturer";
  const isStudent = role === "student";
  const canCreate = isAdmin || isLecturer;

  // Fetch lecturer's own department
  const { data: lecturerProfile } = useQuery({
    queryKey: ["lecturer-profile-dept", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isLecturer && !!user,
  });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses", user?.id, role],
    queryFn: async () => {
      if (role === "lecturer") {
        const { data, error } = await supabase
          .from("course_lecturers")
          .select("course_id, courses(*, course_enrollments(count), departments(name, code))")
          .eq("lecturer_id", user!.id);
        if (error) throw error;
        return (data || []).map((r: any) => r.courses).filter(Boolean);
      }
      if (role === "student") {
        // Students only see courses from their department
        const { data: prof } = await supabase.from("profiles").select("department_id").eq("id", user!.id).maybeSingle();
        if (prof?.department_id) {
          const { data, error } = await supabase
            .from("courses")
            .select("*, course_enrollments(count), departments(name, code)")
            .eq("department_id", prof.department_id)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return data;
        }
        return [];
      }
      const { data, error } = await supabase
        .from("courses")
        .select("*, course_enrollments(count), departments(name, code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
    enabled: canCreate,
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
        code: courseCode.toUpperCase(),
        name: courseName,
        description: courseDesc || null,
        department_id: deptId,
        created_by: user!.id,
      }).select("id").single();
      if (error) throw error;
      // If lecturer creates course, auto-assign themselves
      if (isLecturer && newCourse) {
        await supabase.from("course_lecturers").insert({
          course_id: newCourse.id,
          lecturer_id: user!.id,
          assigned_by: user!.id,
        });
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
        code: courseCode.toUpperCase(),
        name: courseName,
        description: courseDesc || null,
        department_id: courseDeptId || null,
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

  const resetForm = () => {
    setOpen(false);
    setEditingCourse(null);
    setCourseCode("");
    setCourseName("");
    setCourseDesc("");
    setCourseDeptId("");
  };

  const openEditCourse = (course: any) => {
    setEditingCourse(course);
    setCourseCode(course.code);
    setCourseName(course.name);
    setCourseDesc(course.description || "");
    setCourseDeptId(course.department_id || "");
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseName.trim()) return;
    editingCourse ? updateCourseMutation.mutate() : createCourseMutation.mutate();
  };

  const coursesByDept = isAdmin ? departments.map((dept) => ({
    ...dept,
    courses: courses.filter((c: any) => c.department_id === dept.id),
  })) : [];
  const unassignedCourses = isAdmin ? courses.filter((c: any) => !c.department_id) : [];

  const renderCourseCard = (course: any) => (
    <Card key={course.id} className="relative group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{course.code}</p>
            <CardTitle className="text-base mt-1">{course.name}</CardTitle>
          </div>
          {(isAdmin || (isLecturer && course.created_by === user?.id)) && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCourse(course)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteCourseMutation.mutate(course.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {course.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{course.description}</p>}
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
              myEnrollments.includes(course.id) ? (
                <Button variant="outline" size="sm" onClick={() => unenrollMutation.mutate(course.id)} disabled={unenrollMutation.isPending}>
                  <LogOut className="h-3.5 w-3.5 mr-1" />{t("courses.unenroll")}
                </Button>
              ) : (
                <Button size="sm" onClick={() => enrollMutation.mutate(course.id)} disabled={enrollMutation.isPending}>
                  <LogIn className="h-3.5 w-3.5 mr-1" />{t("courses.joinCourse")}
                </Button>
              )
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
                  <Label>{t("auth.department")}</Label>
                  <select
                    value={courseDeptId}
                    onChange={(e) => setCourseDeptId(e.target.value)}
                    className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">{t("auth.selectDepartment")}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("courses.description")}</Label>
                  <Textarea value={courseDesc} onChange={(e) => setCourseDesc(e.target.value)} placeholder="Optional description" />
                </div>
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
                      <Badge variant="secondary">{dept.code}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{dept.courses.length} {t("dept.courses")}</Badge>
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    {dept.courses.length === 0 ? (
                      <p className="text-muted-foreground text-sm">{t("courses.empty")}</p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {dept.courses.map((course: any) => renderCourseCard(course))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
          {unassignedCourses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">{t("dept.unassignedCourses")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {unassignedCourses.map((course: any) => renderCourseCard(course))}
                </div>
              </CardContent>
            </Card>
          )}
          {courses.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">{t("courses.empty")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t("courses.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course: any) => renderCourseCard(course))}
        </div>
      )}
    </div>
  );
}