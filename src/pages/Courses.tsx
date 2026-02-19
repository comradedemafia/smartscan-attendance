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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectDesc, setSubjectDesc] = useState("");
  const [subjectCourseId, setSubjectCourseId] = useState("");
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  const canManage = role === "lecturer";
  const isStudent = role === "student";
  const isAdmin = role === "admin";

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
      const { data, error } = await supabase
        .from("courses")
        .select("*, course_enrollments(count), departments(name, code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allSubjects = [] } = useQuery({
    queryKey: ["all-subjects-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, code, name, course_id, description").order("name");
      if (error) throw error;
      return data;
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
    enabled: isStudent && !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
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

  // Lecturer: create/edit/delete SUBJECTS (not courses)
  const createSubjectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subjects").insert({
        code: subjectCode.toUpperCase(),
        name: subjectName,
        description: subjectDesc || null,
        course_id: subjectCourseId,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subjects-courses"] });
      toast({ title: t("common.success"), description: t("subjects.subjectCreated") });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateSubjectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subjects").update({
        code: subjectCode.toUpperCase(),
        name: subjectName,
        description: subjectDesc || null,
      }).eq("id", editingSubject.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subjects-courses"] });
      toast({ title: t("common.success"), description: t("subjects.subjectUpdated") });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subjects-courses"] });
      toast({ title: t("common.success"), description: t("subjects.subjectDeleted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setOpen(false);
    setEditingSubject(null);
    setSubjectCode("");
    setSubjectName("");
    setSubjectDesc("");
    setSubjectCourseId("");
  };

  const openEditSubject = (subject: any) => {
    setEditingSubject(subject);
    setSubjectCode(subject.code);
    setSubjectName(subject.name);
    setSubjectDesc(subject.description || "");
    setSubjectCourseId(subject.course_id);
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectCode.trim() || !subjectName.trim() || !subjectCourseId) return;
    editingSubject ? updateSubjectMutation.mutate() : createSubjectMutation.mutate();
  };

  const courseSubjects = (courseId: string) => allSubjects.filter((s) => s.course_id === courseId);

  const coursesByDept = isAdmin ? departments.map((dept) => ({
    ...dept,
    courses: courses.filter((c: any) => c.department_id === dept.id),
  })) : [];
  const unassignedCourses = isAdmin ? courses.filter((c: any) => !c.department_id) : [];

  const renderSubjects = (courseId: string) => {
    const subjects = courseSubjects(courseId);
    if (subjects.length === 0 && !canManage) return null;
    const isExpanded = expandedCourse === courseId;
    return (
      <div className="mt-2">
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 p-0 px-1" onClick={() => setExpandedCourse(isExpanded ? null : courseId)}>
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {subjects.length} {t("subjects.title")}
        </Button>
        {isExpanded && (
          <div className="mt-1 space-y-1">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-xs">
                <div>
                  <span className="font-mono text-muted-foreground mr-1">{s.code}</span>
                  <span>{s.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => openEditSubject(s)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1 text-destructive" onClick={() => deleteSubjectMutation.mutate(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {isStudent && (
                    mySubjectEnrollments.includes(s.id) ? (
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => unenrollSubjectMutation.mutate(s.id)}>
                        <LogOut className="h-3 w-3 mr-0.5" />{t("subjects.leaveSubject")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1 text-primary" onClick={() => enrollSubjectMutation.mutate(s.id)}>
                        <LogIn className="h-3 w-3 mr-0.5" />{t("subjects.joinSubject")}
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
            {subjects.length === 0 && canManage && (
              <p className="text-xs text-muted-foreground py-1">{t("subjects.noSubjects")}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCourseCard = (course: any, showActions: boolean) => (
    <Card key={course.id} className="relative group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-mono text-muted-foreground">{course.code}</p>
            <CardTitle className="text-base mt-1">{course.name}</CardTitle>
          </div>
          {showActions && role === "admin" && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {(course.created_by === user?.id || role === "admin") && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
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
        {renderSubjects(course.id)}
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
              <Button><Plus className="h-4 w-4 mr-2" />{t("subjects.createSubject")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSubject ? t("subjects.editSubject") : t("subjects.createSubject")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("subjects.subjectCode")}</Label>
                  <Input value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} placeholder="CS101-A" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("subjects.subjectName")}</Label>
                  <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Programming Basics" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("sessions.course")}</Label>
                  <Select value={subjectCourseId} onValueChange={setSubjectCourseId}>
                    <SelectTrigger><SelectValue placeholder={t("reports.selectCourse")} /></SelectTrigger>
                    <SelectContent>
                      {courses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("courses.description")}</Label>
                  <Textarea value={subjectDesc} onChange={(e) => setSubjectDesc(e.target.value)} placeholder="Optional description" />
                </div>
                <Button type="submit" className="w-full" disabled={createSubjectMutation.isPending || updateSubjectMutation.isPending}>
                  {editingSubject ? t("common.save") : t("subjects.createSubject")}
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