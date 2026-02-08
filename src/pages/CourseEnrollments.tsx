import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, BookOpen, Users, Search } from "lucide-react";

export default function CourseEnrollments() {
  const { role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Only admin can access
  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  const { data: courses = [] } = useQuery({
    queryKey: ["enroll-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, code, name").order("name");
      if (error) throw error;
      return data;
    },
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

  // Get all students not yet enrolled in selected course
  const { data: availableStudents = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["enroll-available-students", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return [];
      // Get all students
      const { data: studentRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      if (rolesErr) throw rolesErr;

      const studentIds = studentRoles.map((r) => r.user_id);
      const enrolledIds = enrollments.map((e) => e.user_id);
      const notEnrolledIds = studentIds.filter((id) => !enrolledIds.includes(id));

      if (notEnrolledIds.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email")
        .in("id", notEnrolledIds);
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
      toast({ title: t("common.success"), description: "Student enrolled" });
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
      toast({ title: t("common.success"), description: "Student removed" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const filteredStudents = availableStudents.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.university_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("courses.enroll")}</h1>
      </div>

      {/* Course selector */}
      <div className="max-w-sm space-y-2">
        <Label>{t("sessions.course")}</Label>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCourseId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {enrollments.length} {t("courses.students")} — {selectedCourse?.code}
              </span>
            </div>
            <Button onClick={() => { setEnrollDialogOpen(true); setSearchQuery(""); }}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t("courses.enroll")}
            </Button>
          </div>

          {loadingEnrollments ? (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          ) : enrollments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No students enrolled yet</p>
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
                      onClick={() => unenrollMutation.mutate(enrollment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Enroll dialog */}
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
                  <p className="text-sm text-muted-foreground text-center py-4">No students available</p>
                ) : (
                  filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{student.full_name}</p>
                        <p className="text-xs text-muted-foreground">{student.university_id}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={enrollMutation.isPending}
                        onClick={() => enrollMutation.mutate(student.id)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
