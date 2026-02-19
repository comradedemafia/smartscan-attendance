import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, Search, UserCheck, UserX, BookOpen, Plus, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function UsersAdmin() {
  const { t } = useI18n();
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterGender, setFilterGender] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email, gender")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name, code");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["admin-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_enrollments").select("id, user_id, course_id");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const enrollMutation = useMutation({
    mutationFn: async ({ userId, courseId }: { userId: string; courseId: string }) => {
      const { error } = await supabase.from("course_enrollments").insert({ user_id: userId, course_id: courseId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.studentAdded") });
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
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.studentRemoved") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Delete student: remove enrollments, attendance, role, profile
  const deleteStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      // Delete attendance records
      await supabase.from("attendance_records").delete().eq("user_id", studentId);
      // Delete enrollments
      await supabase.from("course_enrollments").delete().eq("user_id", studentId);
      // Delete role
      await supabase.from("user_roles").delete().eq("user_id", studentId);
      // Delete profile
      const { error } = await supabase.from("profiles").delete().eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast({ title: t("common.success"), description: t("admin.studentDeleted") });
      setDeleteStudentId(null);
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const roleMap = Object.fromEntries(roles.map((r) => [r.user_id, r.role]));
  const enrollmentsByCourse: Record<string, Set<string>> = {};
  const enrollmentMap: Record<string, Record<string, string>> = {};
  enrollments.forEach((e) => {
    if (!enrollmentsByCourse[e.course_id]) enrollmentsByCourse[e.course_id] = new Set();
    enrollmentsByCourse[e.course_id].add(e.user_id);
    if (!enrollmentMap[e.user_id]) enrollmentMap[e.user_id] = {};
    enrollmentMap[e.user_id][e.course_id] = e.id;
  });

  const students = profiles.filter((p) => roleMap[p.id] === "student");

  const filtered = students.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.full_name.toLowerCase().includes(q) || p.university_id.toLowerCase().includes(q);
    const matchGender = filterGender === "all" || p.gender === filterGender;
    const matchCourse = filterCourse === "all" || enrollmentsByCourse[filterCourse]?.has(p.id);
    return matchSearch && matchGender && matchCourse;
  });

  const maleCount = filtered.filter((p) => p.gender === "M").length;
  const femaleCount = filtered.filter((p) => p.gender === "F").length;

  const openEnrollDialog = (student: any) => {
    setSelectedStudent(student);
    setEnrollDialogOpen(true);
  };

  if (role !== "admin") {
    return <p className="text-muted-foreground">{t("reports.noData")}</p>;
  }

  const studentEnrolledCourses = selectedStudent
    ? courses.filter((c) => enrollmentMap[selectedStudent.id]?.[c.id])
    : [];
  const studentNotEnrolledCourses = selectedStudent
    ? courses.filter((c) => !enrollmentMap[selectedStudent.id]?.[c.id])
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("nav.users")}</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{filtered.length}</p>
            <p className="text-xs text-muted-foreground">{t("admin.totalStudents")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <UserCheck className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{maleCount}</p>
            <p className="text-xs text-muted-foreground">{t("auth.male")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <UserX className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{femaleCount}</p>
            <p className="text-xs text-muted-foreground">{t("auth.female")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <BookOpen className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{courses.length}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.totalCourses")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterGender} onValueChange={setFilterGender}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("auth.gender")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allGenders")}</SelectItem>
            <SelectItem value="M">{t("auth.male")}</SelectItem>
            <SelectItem value="F">{t("auth.female")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("admin.filterByCourse")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.allCourses")}</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("admin.studentList")} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t("reports.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("reports.studentName")}</TableHead>
                    <TableHead>{t("reports.universityId")}</TableHead>
                    <TableHead>{t("auth.email")}</TableHead>
                    <TableHead>{t("auth.gender")}</TableHead>
                    <TableHead>{t("admin.enrolledCourses")}</TableHead>
                    <TableHead className="w-28">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p, i) => {
                    const studentCourses = courses.filter((c) => enrollmentsByCourse[c.id]?.has(p.id));
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell>{p.university_id}</TableCell>
                        <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.gender === "M" ? "default" : p.gender === "F" ? "secondary" : "outline"}>
                            {p.gender === "M" ? t("auth.male") : p.gender === "F" ? t("auth.female") : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {studentCourses.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              studentCourses.map((c) => (
                                <Badge key={c.id} variant="outline" className="text-xs">{c.code}</Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs h-7"
                              onClick={() => openEnrollDialog(p)}
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              {t("admin.manageCourses")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteStudentId(p.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manage Enrollments Dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {selectedStudent?.full_name} — {t("admin.enrolledCourses")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {studentEnrolledCourses.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">{t("admin.enrolledCourses")}</p>
                <div className="space-y-1">
                  {studentEnrolledCourses.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.code}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => unenrollMutation.mutate(enrollmentMap[selectedStudent.id][c.id])}
                        disabled={unenrollMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {studentNotEnrolledCourses.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">{t("admin.availableCourses")}</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {studentNotEnrolledCourses.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.code}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                        onClick={() => enrollMutation.mutate({ userId: selectedStudent.id, courseId: c.id })}
                        disabled={enrollMutation.isPending}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {courses.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("reports.noData")}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Student Confirmation */}
      <AlertDialog open={!!deleteStudentId} onOpenChange={(o) => { if (!o) setDeleteStudentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteStudent")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.confirmDeleteStudent")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteStudentId && deleteStudentMutation.mutate(deleteStudentId)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
