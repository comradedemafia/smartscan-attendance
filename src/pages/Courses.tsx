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
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const canManage = role === "lecturer";
  const isStudent = role === "student";
  const isAdmin = role === "admin";

  // For lecturer: only assigned courses
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses", user?.id, role],
    queryFn: async () => {
      if (role === "lecturer") {
        const { data, error } = await supabase
          .from("course_lecturers")
          .select("course_id, courses(*, course_enrollments(count))")
          .eq("lecturer_id", user!.id);
        if (error) throw error;
        return (data || []).map((r: any) => r.courses).filter(Boolean);
      }
      // Admin & Student: all courses
      const { data, error } = await supabase
        .from("courses")
        .select("*, course_enrollments(count), departments(name, code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // For admin: departments
  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Student enrollments
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

  // Lecturer CRUD
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("courses").insert({ code, name, description: description || null, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: "Course created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("courses").update({ code, name, description: description || null }).eq("id", editingCourse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: "Course updated" });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast({ title: t("common.success"), description: "Course deleted" });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const resetForm = () => { setOpen(false); setEditingCourse(null); setCode(""); setName(""); setDescription(""); };
  const openEdit = (course: any) => { setEditingCourse(course); setCode(course.code); setName(course.name); setDescription(course.description || ""); setOpen(true); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!code.trim() || !name.trim()) return; editingCourse ? updateMutation.mutate() : createMutation.mutate(); };

  // Admin: group courses by department
  const coursesByDept = isAdmin ? departments.map((dept) => ({
    ...dept,
    courses: courses.filter((c: any) => c.department_id === dept.id),
  })) : [];
  const unassignedCourses = isAdmin ? courses.filter((c: any) => !c.department_id) : [];

  const renderCourseCard = (course: any, showActions: boolean) => (
    <Card key={course.id} className="relative group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{course.code}</p>
            <CardTitle className="text-base mt-1">{course.name}</CardTitle>
          </div>
          {showActions && (role === "lecturer" || role === "admin") && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {(course.created_by === user?.id || role === "admin") && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(course)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              )}
              {(course.created_by === user?.id || role === "admin") && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(course.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
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
            {canManage && (
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
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />{t("courses.create")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCourse ? t("common.edit") : t("courses.create")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("courses.code")}</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS101" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("courses.name")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Introduction to CS" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("courses.description")}</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
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
        /* Admin: grouped by department */
        <div className="space-y-4">
          {coursesByDept.map((dept) => {
            const isExpanded = expandedDept === dept.id;
            return (
              <Card key={dept.id}>
                <CardHeader
                  className="cursor-pointer pb-3"
                  onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                >
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
                        {dept.courses.map((course: any) => renderCourseCard(course, false))}
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
                  {unassignedCourses.map((course: any) => renderCourseCard(course, false))}
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
          {courses.map((course: any) => renderCourseCard(course, true))}
        </div>
      )}
    </div>
  );
}
