import { useState } from "react";
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
import { BookOpen, Plus, Trash2, Edit, Users, LogIn, LogOut } from "lucide-react";

export default function Subjects() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectDesc, setSubjectDesc] = useState("");
  const [subjectCourseId, setSubjectCourseId] = useState("");

  const canManage = role === "lecturer";
  const isStudent = role === "student";
  const isAdmin = role === "admin";

  // Courses the lecturer is assigned to (or all for admin)
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-for-subjects", user?.id, role],
    queryFn: async () => {
      if (role === "lecturer") {
        const { data, error } = await supabase
          .from("course_lecturers")
          .select("course_id, courses(id, code, name)")
          .eq("lecturer_id", user!.id);
        if (error) throw error;
        return (data || []).map((r: any) => r.courses).filter(Boolean);
      }
      const { data, error } = await supabase.from("courses").select("id, code, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["all-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, code, name, course_id, description, created_by, courses(code, name)")
        .order("name");
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

  const createMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["all-subjects"] });
      toast({ title: t("common.success"), description: t("subjects.subjectCreated") });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subjects").update({
        code: subjectCode.toUpperCase(),
        name: subjectName,
        description: subjectDesc || null,
      }).eq("id", editingSubject.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subjects"] });
      toast({ title: t("common.success"), description: t("subjects.subjectUpdated") });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subjects"] });
      toast({ title: t("common.success"), description: t("subjects.subjectDeleted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const enrollMutation = useMutation({
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

  const unenrollMutation = useMutation({
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

  const resetForm = () => {
    setOpen(false);
    setEditingSubject(null);
    setSubjectCode("");
    setSubjectName("");
    setSubjectDesc("");
    setSubjectCourseId("");
  };

  const openEdit = (subject: any) => {
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
    editingSubject ? updateMutation.mutate() : createMutation.mutate();
  };

  // Filter subjects: lecturer sees only their courses' subjects
  const filteredSubjects = canManage
    ? subjects.filter((s: any) => courses.some((c: any) => c.id === s.course_id))
    : subjects;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("subjects.title")}</h1>
        {(canManage || isAdmin) && (
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
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingSubject ? t("common.save") : t("subjects.createSubject")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : filteredSubjects.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t("subjects.noSubjects")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSubjects.map((subject: any) => (
            <Card key={subject.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-mono text-muted-foreground">{subject.code}</p>
                    <CardTitle className="text-base mt-1">{subject.name}</CardTitle>
                  </div>
                  {(canManage || isAdmin) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(subject)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(subject.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {subject.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{subject.description}</p>}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    {(subject.courses as any)?.code} - {(subject.courses as any)?.name}
                  </Badge>
                  {isStudent && (
                    mySubjectEnrollments.includes(subject.id) ? (
                      <Button variant="outline" size="sm" onClick={() => unenrollMutation.mutate(subject.id)} disabled={unenrollMutation.isPending}>
                        <LogOut className="h-3.5 w-3.5 mr-1" />{t("subjects.leaveSubject")}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => enrollMutation.mutate(subject.id)} disabled={enrollMutation.isPending}>
                        <LogIn className="h-3.5 w-3.5 mr-1" />{t("subjects.joinSubject")}
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
