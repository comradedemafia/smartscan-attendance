import { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Search, Users, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function CourseStudents() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user, role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").eq("id", courseId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("id, user_id, enrolled_at")
        .eq("course_id", courseId!);
      if (error) throw error;
      if (!data.length) return [];

      const userIds = data.map((e) => e.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email, gender")
        .in("id", userIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      return data.map((e) => ({
        ...e,
        profile: profileMap[e.user_id] || { full_name: "Unknown", university_id: "—", email: "", gender: null },
      }));
    },
    enabled: !!courseId,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["search-students", studentSearch],
    queryFn: async () => {
      if (studentSearch.length < 2) return [];
      const { data, error } = await supabase
        .rpc("search_profiles_for_enrollment", { search_term: studentSearch });
      if (error) throw error;
      return data || [];
    },
    enabled: studentSearch.length >= 2,
  });

  const enrolledUserIds = new Set(enrollments.map((e) => e.user_id));
  const enrollmentByUserId = Object.fromEntries(enrollments.map((e: any) => [e.user_id, e.id]));

  const addMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("course_enrollments").insert({
        course_id: courseId!,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-students", courseId] });
      toast({ title: t("common.success"), description: t("courses.studentAdded") });
      setStudentSearch("");
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("course_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-students", courseId] });
      toast({ title: t("common.success"), description: t("courses.studentRemoved") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      // Skip header if present
      const startIdx = lines[0]?.toLowerCase().includes("university_id") ? 1 : 0;

      let added = 0;
      const enrolledIds = new Set(enrollments.map((en) => en.profile.university_id));

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 2) continue;

        const [universityId, fullName] = cols;

        // Check if already enrolled
        if (enrolledIds.has(universityId)) continue;

        // Find existing profile by university_id
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("university_id", universityId)
          .maybeSingle();

        if (existing) {
          // Enroll existing student
          const { error } = await supabase.from("course_enrollments").insert({
            course_id: courseId!,
            user_id: existing.id,
          });
          if (!error) added++;
        }
        // Skip students without accounts - they need to register first
      }

      queryClient.invalidateQueries({ queryKey: ["course-students", courseId] });
      toast({
        title: t("common.success"),
        description: `${t("admin.importSuccess")} (${added})`,
      });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filtered = enrollments.filter((e: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.profile.full_name.toLowerCase().includes(q) || e.profile.university_id.toLowerCase().includes(q);
  });

  const canManage = role === "lecturer" || role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/courses">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
            {t("courses.manageStudents")}
          </h1>
          {course && <p className="text-sm text-muted-foreground">{course.code} — {course.name}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("common.search")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {canManage && (
          <>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />{t("courses.addStudent")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("courses.addStudent")}</DialogTitle>
                </DialogHeader>
                <Input placeholder={t("courses.searchStudent")} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                {searchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {searchResults.map((s: any) => {
                      const isEnrolled = enrolledUserIds.has(s.id);
                      return (
                        <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                          <div>
                            <p className="font-medium text-sm">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground">{s.university_id}</p>
                          </div>
                          {isEnrolled ? (
                            <Button size="sm" variant="destructive" onClick={() => setConfirmDeleteId(enrollmentByUserId[s.id])} disabled={removeMutation.isPending}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => addMutation.mutate(s.id)} disabled={addMutation.isPending}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {studentSearch.length >= 2 && searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("reports.noData")}</p>
                )}
              </DialogContent>
            </Dialog>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvImport}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                {importing ? t("admin.importingStudents") : t("admin.importCsv")}
              </Button>
            </div>
          </>
        )}
      </div>

      {canManage && (
        <p className="text-xs text-muted-foreground">{t("admin.csvFormat")}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("courses.students")} ({enrollments.length})
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
                    {canManage && <TableHead className="w-16">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e: any, i: number) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{e.profile.full_name}</TableCell>
                      <TableCell>{e.profile.university_id}</TableCell>
                      <TableCell className="text-muted-foreground">{e.profile.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={e.profile.gender === "M" ? "default" : e.profile.gender === "F" ? "secondary" : "outline"}>
                          {e.profile.gender === "M" ? t("auth.male") : e.profile.gender === "F" ? t("auth.female") : "—"}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirmDeleteId(e.id)} disabled={removeMutation.isPending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmRemoveStudent")}
        onConfirm={() => {
          if (confirmDeleteId) removeMutation.mutate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
