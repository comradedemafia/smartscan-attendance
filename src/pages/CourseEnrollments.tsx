import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, BookOpen, Users, Search, UsersRound } from "lucide-react";

export default function CourseEnrollments() {
  const { role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [selectedLevelId, setSelectedLevelId] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  // Fetch departments
  const { data: departments = [] } = useQuery({
    queryKey: ["enroll-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch levels filtered by department
  const { data: levels = [] } = useQuery({
    queryKey: ["enroll-levels", selectedDeptId],
    queryFn: async () => {
      if (!selectedDeptId) return [];
      const { data, error } = await supabase
        .from("levels")
        .select("id, name, code")
        .eq("department_id", selectedDeptId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDeptId,
  });

  // Fetch courses filtered by level (and department)
  const { data: courses = [] } = useQuery({
    queryKey: ["enroll-courses", selectedDeptId, selectedLevelId],
    queryFn: async () => {
      if (!selectedDeptId) return [];
      let query = supabase.from("courses").select("id, code, name").eq("department_id", selectedDeptId);
      if (selectedLevelId) {
        query = query.eq("level_id", selectedLevelId);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDeptId,
  });

  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
    queryKey: ["enroll-enrollments", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return [];
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("id, user_id, enrolled_at, profiles:user_id(full_name, university_id, email)")
        .eq("course_id", selectedCourseId);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedCourseId,
  });

  const { data: allStudents = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["enroll-all-students", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return [];
      const { data: studentRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      if (rolesErr) throw rolesErr;

      const studentIds = studentRoles.map((r) => r.user_id);
      if (studentIds.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email")
        .in("id", studentIds);
      if (profErr) throw profErr;
      return profiles;
    },
    enabled: !!selectedCourseId && enrollDialogOpen,
  });

  const enrollMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("course_enrollments").insert({
        course_id: selectedCourseId,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enroll-enrollments", selectedCourseId] });
      queryClient.invalidateQueries({ queryKey: ["enroll-available-students", selectedCourseId] });
      toast({ title: t("common.success"), description: t("courses.studentAdded") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const bulkEnrollMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourseId || !selectedDeptId) return;
      // Get all students in the selected department
      const { data: students, error: studErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("department_id", selectedDeptId);
      if (studErr) throw studErr;

      const studentIds = students.map((s) => s.id);
      if (studentIds.length === 0) return;

      // Filter to only actual students
      const { data: studentRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student")
        .in("user_id", studentIds);
      if (rolesErr) throw rolesErr;

      const enrolledIds = enrollments.map((e) => e.user_id);
      const toEnroll = studentRoles
        .map((r) => r.user_id)
        .filter((id) => !enrolledIds.includes(id));

      if (toEnroll.length === 0) return;

      const rows = toEnroll.map((user_id) => ({
        course_id: selectedCourseId,
        user_id,
      }));

      const { error } = await supabase.from("course_enrollments").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enroll-enrollments", selectedCourseId] });
      queryClient.invalidateQueries({ queryKey: ["enroll-available-students", selectedCourseId] });
      toast({ title: t("common.success"), description: t("enroll.bulkEnrollSuccess") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("course_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enroll-enrollments", selectedCourseId] });
      queryClient.invalidateQueries({ queryKey: ["enroll-available-students", selectedCourseId] });
      toast({ title: t("common.success"), description: t("courses.studentRemoved") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const enrolledUserIds = new Set(enrollments.map((e: any) => e.user_id));
  const enrollmentByUserId = Object.fromEntries(enrollments.map((e: any) => [e.user_id, e.id]));

  const filteredStudents = allStudents.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.university_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const handleDeptChange = (val: string) => {
    setSelectedDeptId(val);
    setSelectedLevelId("");
    setSelectedCourseId("");
  };

  const handleLevelChange = (val: string) => {
    setSelectedLevelId(val);
    setSelectedCourseId("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("courses.enroll")}</h1>
      </div>

      {/* Cascading filters */}
      <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
        <div className="space-y-2">
          <Label>{t("enroll.semester")}</Label>
          <Select value={selectedDeptId} onValueChange={handleDeptChange}>
            <SelectTrigger>
              <SelectValue placeholder={t("enroll.selectSemester")} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("enroll.level")}</Label>
          <Select value={selectedLevelId} onValueChange={handleLevelChange} disabled={!selectedDeptId}>
            <SelectTrigger>
              <SelectValue placeholder={t("enroll.selectLevel")} />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("enroll.module")}</Label>
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId} disabled={!selectedDeptId}>
            <SelectTrigger>
              <SelectValue placeholder={t("enroll.selectModule")} />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedCourseId && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {enrollments.length} {t("courses.students")} — {selectedCourse?.code}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm(t("enroll.bulkEnrollConfirm"))) {
                    bulkEnrollMutation.mutate();
                  }
                }}
                disabled={bulkEnrollMutation.isPending}
              >
                <UsersRound className="h-4 w-4 mr-2" />
                {t("enroll.bulkEnroll")}
              </Button>
              <Button onClick={() => { setEnrollDialogOpen(true); setSearchQuery(""); }}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t("courses.enroll")}
              </Button>
            </div>
          </div>

          {loadingEnrollments ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : enrollments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">{t("enroll.noStudentsEnrolled")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enrollments.map((enrollment) => (
                <Card key={enrollment.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{enrollment.profiles?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{enrollment.profiles?.university_id}</p>
                      <p className="text-xs text-muted-foreground truncate">{enrollment.profiles?.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0"
                      onClick={() => setConfirmDeleteId(enrollment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("courses.enroll")} — {selectedCourse?.code}</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("common.search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {loadingStudents ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("common.loading")}</p>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("enroll.noStudentsAvailable")}</p>
                ) : (
                  filteredStudents.map((student) => {
                    const isEnrolled = enrolledUserIds.has(student.id);
                    return (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{student.full_name}</p>
                          <p className="text-xs text-muted-foreground">{student.university_id}</p>
                        </div>
                        {isEnrolled ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={unenrollMutation.isPending}
                            onClick={() => setConfirmDeleteId(enrollmentByUserId[student.id])}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            {t("common.delete")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={enrollMutation.isPending}
                            onClick={() => enrollMutation.mutate(student.id)}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            {t("enroll.add")}
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmRemoveStudent")}
        onConfirm={() => {
          if (confirmDeleteId) unenrollMutation.mutate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
