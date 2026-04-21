import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Users, Search, UserCheck, UserX, BookOpen, Trash2, ChevronDown,
  GraduationCap, UsersRound, UserPlus, Upload, FileSpreadsheet, Mail, IdCard, Settings2,
  ArrowUpDown, ArrowUp, ArrowDown, X, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function UsersAdmin() {
  const { t } = useI18n();
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<"staff" | "students">("students");

  // ─── Manage Students sub-state ────────────────────────────────────
  const [studentsTab, setStudentsTab] = useState<"list" | "enroll">("list");
  // List filters
  const [listLevelId, setListLevelId] = useState<string>("all");
  const [listCourseId, setListCourseId] = useState<string>("all");
  const [listSearch, setListSearch] = useState("");
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);
  // Enroll filters
  const [enrollDeptId, setEnrollDeptId] = useState<string>("");
  const [enrollLevelId, setEnrollLevelId] = useState<string>("");
  const [enrollCourseId, setEnrollCourseId] = useState<string>("");
  const [enrollSearch, setEnrollSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // ─── Manage Staff sub-state ───────────────────────────────────────
  const [staffSearch, setStaffSearch] = useState("");
  const [staffLevelFilter, setStaffLevelFilter] = useState<string>("all");

  // ─── Queries ──────────────────────────────────────────────────────
  const { data: profiles = [] } = useQuery({
    queryKey: ["mu-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email, gender, department_id")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["mu-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["mu-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: levels = [] } = useQuery({
    queryKey: ["mu-levels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("id, name, code, sort_order, department_id")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["mu-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, code, department_id, level_id");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["mu-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("id, user_id, course_id");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const { data: courseLecturers = [] } = useQuery({
    queryKey: ["mu-course-lecturers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_lecturers")
        .select("id, course_id, lecturer_id");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  // ─── Derived maps ─────────────────────────────────────────────────
  const roleMap = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.user_id, r.role])),
    [roles]
  );

  const enrollmentsByCourse: Record<string, Set<string>> = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    enrollments.forEach((e) => {
      if (!m[e.course_id]) m[e.course_id] = new Set();
      m[e.course_id].add(e.user_id);
    });
    return m;
  }, [enrollments]);

  const enrollmentByUserCourse: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    enrollments.forEach((e) => { m[`${e.user_id}:${e.course_id}`] = e.id; });
    return m;
  }, [enrollments]);

  const students = useMemo(
    () => profiles.filter((p) => roleMap[p.id] === "student"),
    [profiles, roleMap]
  );
  const lecturers = useMemo(
    () => profiles.filter((p) => roleMap[p.id] === "lecturer"),
    [profiles, roleMap]
  );

  const lecturerCoursesMap: Record<string, string[]> = useMemo(() => {
    const m: Record<string, string[]> = {};
    courseLecturers.forEach((cl) => {
      if (!m[cl.lecturer_id]) m[cl.lecturer_id] = [];
      m[cl.lecturer_id].push(cl.course_id);
    });
    return m;
  }, [courseLecturers]);

  // ─── Mutations ────────────────────────────────────────────────────
  const enrollMutation = useMutation({
    mutationFn: async ({ userId, courseId }: { userId: string; courseId: string }) => {
      const { error } = await supabase.from("course_enrollments").insert({ user_id: userId, course_id: courseId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mu-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.studentAdded") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const unenrollMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("course_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mu-enrollments"] });
      toast({ title: t("common.success"), description: t("courses.studentRemoved") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const bulkEnrollMutation = useMutation({
    mutationFn: async () => {
      if (!enrollCourseId || !enrollLevelId) return { count: 0 };
      const levelStudents = students.filter((s: any) => {
        const lvl = levels.find((l) => l.id === enrollLevelId);
        return lvl && s.department_id === lvl.department_id;
      });
      const enrolled = enrollmentsByCourse[enrollCourseId] || new Set();
      const toEnroll = levelStudents.filter((s) => !enrolled.has(s.id));
      if (toEnroll.length === 0) return { count: 0 };
      const rows = toEnroll.map((s) => ({ course_id: enrollCourseId, user_id: s.id }));
      const { error } = await supabase.from("course_enrollments").insert(rows);
      if (error) throw error;
      return { count: toEnroll.length };
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ["mu-enrollments"] });
      toast({
        title: t("common.success"),
        description: t("admin.importedCount").replace("{count}", String(count)),
      });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      await supabase.from("attendance_records").delete().eq("user_id", studentId);
      await supabase.from("course_enrollments").delete().eq("user_id", studentId);
      await supabase.from("user_roles").delete().eq("user_id", studentId);
      const { error } = await supabase.from("profiles").delete().eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mu-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["mu-roles"] });
      queryClient.invalidateQueries({ queryKey: ["mu-enrollments"] });
      toast({ title: t("common.success"), description: t("admin.studentDeleted") });
      setDeleteStudentId(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // ─── Bulk CSV import (university IDs → enroll) ────────────────────
  const handleCsvImport = async (file: File) => {
    if (!enrollCourseId) {
      toast({ title: t("common.error"), description: t("admin.selectModuleToEnroll"), variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const ids = text
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        toast({ title: t("common.error"), description: "Empty file", variant: "destructive" });
        return;
      }

      const { data: matched, error } = await supabase
        .from("profiles")
        .select("id, university_id")
        .in("university_id", ids);
      if (error) throw error;

      const studentRoleSet = new Set(roles.filter((r) => r.role === "student").map((r) => r.user_id));
      const validStudents = (matched || []).filter((p) => studentRoleSet.has(p.id));
      const enrolled = enrollmentsByCourse[enrollCourseId] || new Set();
      const toEnroll = validStudents.filter((p) => !enrolled.has(p.id));
      const alreadyEnrolled = validStudents.length - toEnroll.length;
      const notFound = ids.length - validStudents.length;

      if (toEnroll.length > 0) {
        const rows = toEnroll.map((p) => ({ course_id: enrollCourseId, user_id: p.id }));
        const { error: insErr } = await supabase.from("course_enrollments").insert(rows);
        if (insErr) throw insErr;
      }

      queryClient.invalidateQueries({ queryKey: ["mu-enrollments"] });
      toast({
        title: t("common.success"),
        description: [
          t("admin.importedCount").replace("{count}", String(toEnroll.length)),
          alreadyEnrolled > 0 && t("admin.alreadyEnrolledCount").replace("{count}", String(alreadyEnrolled)),
          notFound > 0 && t("admin.notFoundCount").replace("{count}", String(notFound)),
        ].filter(Boolean).join(" • "),
      });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Filtered lists for "Students List" ───────────────────────────
  const filteredStudents = useMemo(() => {
    return students.filter((p: any) => {
      const q = listSearch.toLowerCase();
      const matchSearch = !listSearch || p.full_name.toLowerCase().includes(q) || p.university_id.toLowerCase().includes(q);

      let matchLevel = true;
      if (listLevelId !== "all") {
        const lvl = levels.find((l) => l.id === listLevelId);
        matchLevel = !!lvl && p.department_id === lvl.department_id;
      }

      const matchCourse = listCourseId === "all" || enrollmentsByCourse[listCourseId]?.has(p.id);
      return matchSearch && matchLevel && matchCourse;
    });
  }, [students, listSearch, listLevelId, listCourseId, levels, enrollmentsByCourse]);

  // Courses available in the list-tab module dropdown depend on the level chosen
  const listCourseOptions = useMemo(() => {
    if (listLevelId === "all") return courses;
    return courses.filter((c) => c.level_id === listLevelId);
  }, [courses, listLevelId]);

  // ─── Enroll tab cascading options ─────────────────────────────────
  const enrollLevelsOptions = useMemo(
    () => (enrollDeptId ? levels.filter((l) => l.department_id === enrollDeptId) : []),
    [enrollDeptId, levels]
  );
  const enrollCoursesOptions = useMemo(() => {
    if (!enrollDeptId) return [];
    return courses.filter((c) =>
      c.department_id === enrollDeptId && (!enrollLevelId || c.level_id === enrollLevelId)
    );
  }, [enrollDeptId, enrollLevelId, courses]);

  const enrolledStudentsForCourse = useMemo(() => {
    if (!enrollCourseId) return [];
    const ids = enrollmentsByCourse[enrollCourseId] || new Set();
    return students.filter((s) => ids.has(s.id));
  }, [enrollCourseId, enrollmentsByCourse, students]);

  const enrollableStudents = useMemo(() => {
    if (!enrollCourseId) return [];
    return students.filter((s: any) => {
      const q = enrollSearch.toLowerCase();
      const matchSearch = !enrollSearch || s.full_name.toLowerCase().includes(q) || s.university_id.toLowerCase().includes(q);
      // Limit suggestions to chosen level/dept
      const lvl = enrollLevelId ? levels.find((l) => l.id === enrollLevelId) : null;
      const matchLevel = lvl ? s.department_id === lvl.department_id
        : enrollDeptId ? s.department_id === enrollDeptId
        : true;
      return matchSearch && matchLevel;
    });
  }, [students, enrollSearch, enrollDeptId, enrollLevelId, levels, enrollCourseId]);

  // ─── Filtered staff ──────────────────────────────────────────────
  const filteredLecturers = useMemo(() => {
    return lecturers.filter((lec: any) => {
      const q = staffSearch.toLowerCase();
      const matchSearch = !staffSearch ||
        lec.full_name.toLowerCase().includes(q) ||
        lec.university_id.toLowerCase().includes(q) ||
        (lec.email || "").toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (staffLevelFilter === "all") return true;
      const lecCourseIds = lecturerCoursesMap[lec.id] || [];
      const lvlIds = new Set(courses.filter((c) => lecCourseIds.includes(c.id)).map((c) => c.level_id));
      return lvlIds.has(staffLevelFilter);
    });
  }, [lecturers, staffSearch, staffLevelFilter, lecturerCoursesMap, courses]);

  if (role !== "admin") {
    return <p className="text-muted-foreground">{t("reports.noData")}</p>;
  }

  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk'] flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            {t("nav.users")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin.staffDirectory")} · {t("admin.studentDirectory")}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <GraduationCap className="h-3 w-3" /> {lecturers.length} {t("admin.lecturers")}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" /> {students.length} {t("admin.students")}
          </Badge>
        </div>
      </div>

      {/* Top toggle: Staff vs Students */}
      <Tabs value={section} onValueChange={(v) => setSection(v as any)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="students" className="gap-2">
            <Users className="h-4 w-4" />
            {t("admin.manageStudents")}
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            {t("admin.manageStaff")}
          </TabsTrigger>
        </TabsList>

        {/* ══════════════ MANAGE STUDENTS ══════════════ */}
        <TabsContent value="students" className="space-y-5 mt-5">
          <Tabs value={studentsTab} onValueChange={(v) => setStudentsTab(v as any)}>
            <TabsList>
              <TabsTrigger value="list" className="gap-2">
                <Users className="h-4 w-4" />
                {t("admin.studentsList")}
              </TabsTrigger>
              <TabsTrigger value="enroll" className="gap-2">
                <UserPlus className="h-4 w-4" />
                {t("admin.enrollStudents")}
              </TabsTrigger>
            </TabsList>

            {/* ── Students List ── */}
            <TabsContent value="list" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t("admin.studentsList")}
                  </CardTitle>
                  <CardDescription>{t("enroll.level")} → {t("enroll.module")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("enroll.level")}</Label>
                      <Select value={listLevelId} onValueChange={(v) => { setListLevelId(v); setListCourseId("all"); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("admin.allDepartments")}</SelectItem>
                          {levels.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("enroll.module")}</Label>
                      <Select value={listCourseId} onValueChange={setListCourseId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("admin.allCourses")}</SelectItem>
                          {listCourseOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("common.search")}</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder={t("common.search")} />
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCell icon={<Users className="h-4 w-4" />} value={filteredStudents.length} label={t("admin.totalStudents")} />
                    <StatCell icon={<UserCheck className="h-4 w-4" />} value={filteredStudents.filter((s) => s.gender === "M").length} label={t("auth.male")} />
                    <StatCell icon={<UserX className="h-4 w-4" />} value={filteredStudents.filter((s) => s.gender === "F").length} label={t("auth.female")} />
                  </div>

                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>{t("reports.studentName")}</TableHead>
                          <TableHead>{t("reports.universityId")}</TableHead>
                          <TableHead className="hidden md:table-cell">{t("auth.email")}</TableHead>
                          <TableHead>{t("auth.gender")}</TableHead>
                          <TableHead className="w-16 text-right">{t("common.actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              {t("reports.noData")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredStudents.map((s: any, i) => (
                            <TableRow key={s.id} className="hover:bg-muted/40">
                              <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                              <TableCell className="font-medium">{s.full_name}</TableCell>
                              <TableCell className="font-mono text-xs">{s.university_id}</TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{s.email || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={s.gender === "M" ? "default" : s.gender === "F" ? "secondary" : "outline"} className="text-xs">
                                  {s.gender === "M" ? t("auth.male") : s.gender === "F" ? t("auth.female") : "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteStudentId(s.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Enroll Students ── */}
            <TabsContent value="enroll" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t("admin.enrollStudents")}
                  </CardTitle>
                  <CardDescription>
                    {t("enroll.semester")} → {t("enroll.level")} → {t("enroll.module")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("enroll.semester")}</Label>
                      <Select value={enrollDeptId} onValueChange={(v) => { setEnrollDeptId(v); setEnrollLevelId(""); setEnrollCourseId(""); }}>
                        <SelectTrigger><SelectValue placeholder={t("enroll.selectSemester")} /></SelectTrigger>
                        <SelectContent>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("enroll.level")}</Label>
                      <Select value={enrollLevelId} onValueChange={(v) => { setEnrollLevelId(v); setEnrollCourseId(""); }} disabled={!enrollDeptId}>
                        <SelectTrigger><SelectValue placeholder={t("enroll.selectLevel")} /></SelectTrigger>
                        <SelectContent>
                          {enrollLevelsOptions.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("enroll.module")}</Label>
                      <Select value={enrollCourseId} onValueChange={setEnrollCourseId} disabled={!enrollDeptId}>
                        <SelectTrigger><SelectValue placeholder={t("enroll.selectModule")} /></SelectTrigger>
                        <SelectContent>
                          {enrollCoursesOptions.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!enrollCourseId ? (
                    <p className="text-sm text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">
                      {t("admin.selectModuleToEnroll")}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!enrollLevelId || bulkEnrollMutation.isPending}
                          onClick={() => {
                            if (confirm(t("enroll.bulkEnrollConfirm"))) bulkEnrollMutation.mutate();
                          }}
                        >
                          <UsersRound className="h-4 w-4 mr-1.5" />
                          {t("enroll.bulkEnroll")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={importing}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-4 w-4 mr-1.5" />
                          {importing ? t("admin.importingNow") : t("admin.bulkImport")}
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleCsvImport(f);
                          }}
                        />
                      </div>

                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {t("admin.csvIdsOnly")}
                      </p>

                      {/* Already enrolled */}
                      <div className="rounded-lg border">
                        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                          <span className="text-sm font-medium">{t("admin.enrolledCourses")}</span>
                          <Badge variant="outline" className="text-xs">{enrolledStudentsForCourse.length}</Badge>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y">
                          {enrolledStudentsForCourse.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">{t("enroll.noStudentsEnrolled")}</p>
                          ) : (
                            enrolledStudentsForCourse.map((s) => (
                              <div key={s.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{s.full_name}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{s.university_id}</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    const enrollmentId = enrollmentByUserCourse[`${s.id}:${enrollCourseId}`];
                                    if (enrollmentId) unenrollMutation.mutate(enrollmentId);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Add new */}
                      <div className="rounded-lg border">
                        <div className="px-3 py-2 border-b bg-muted/30">
                          <span className="text-sm font-medium">{t("courses.addStudent")}</span>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input className="pl-9 h-9" value={enrollSearch} onChange={(e) => setEnrollSearch(e.target.value)} placeholder={t("courses.searchStudent")} />
                          </div>
                          <div className="max-h-56 overflow-y-auto divide-y">
                            {enrollableStudents.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-4">{t("enroll.noStudentsAvailable")}</p>
                            ) : (
                              enrollableStudents.slice(0, 50).map((s) => {
                                const isEnrolled = (enrollmentsByCourse[enrollCourseId] || new Set()).has(s.id);
                                return (
                                  <div key={s.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/30">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{s.full_name}</p>
                                      <p className="text-xs text-muted-foreground font-mono">{s.university_id}</p>
                                    </div>
                                    {isEnrolled ? (
                                      <Button size="sm" variant="destructive" className="h-7"
                                        onClick={() => {
                                          const eid = enrollmentByUserCourse[`${s.id}:${enrollCourseId}`];
                                          if (eid) unenrollMutation.mutate(eid);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        {t("common.delete")}
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7"
                                        onClick={() => enrollMutation.mutate({ userId: s.id, courseId: enrollCourseId })}
                                      >
                                        <UserPlus className="h-3 w-3 mr-1" />
                                        {t("enroll.add")}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ══════════════ MANAGE STAFF ══════════════ */}
        <TabsContent value="staff" className="space-y-5 mt-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                {t("admin.staffDirectory")}
              </CardTitle>
              <CardDescription>
                {t("admin.lecturerLevel")} · {t("admin.lecturerModules")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("common.search")}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder={t("common.search")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("enroll.level")}</Label>
                  <Select value={staffLevelFilter} onValueChange={setStaffLevelFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("admin.allDepartments")}</SelectItem>
                      {levels.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Collapsible list of lecturers */}
              <div className="space-y-2">
                {filteredLecturers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
                    {t("reports.noData")}
                  </p>
                ) : (
                  filteredLecturers.map((lec: any) => {
                    const lecCourseIds = lecturerCoursesMap[lec.id] || [];
                    const lecCourses = courses.filter((c) => lecCourseIds.includes(c.id));
                    const lecLevelIds = [...new Set(lecCourses.map((c) => c.level_id).filter(Boolean))];
                    const lecLevels = levels.filter((l) => lecLevelIds.includes(l.id));
                    return <LecturerRow key={lec.id} lec={lec} levels={lecLevels} coursesList={lecCourses} t={t} />;
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
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

// ─── Helpers ────────────────────────────────────────────────────────
function StatCell({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5 flex items-center gap-3">
      <div className="rounded-md bg-primary/10 text-primary p-2">{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{label}</p>
      </div>
    </div>
  );
}

function LecturerRow({ lec, levels, coursesList, t }: {
  lec: any;
  levels: any[];
  coursesList: any[];
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn("rounded-lg border overflow-hidden transition-colors", open && "border-primary/40 bg-muted/20")}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 text-left">
            <div className="rounded-full bg-primary/10 text-primary h-9 w-9 flex items-center justify-center font-semibold text-sm shrink-0">
              {lec.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{lec.full_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-mono">{lec.university_id}</span>
                <Badge variant="outline" className="text-[10px] py-0 h-4">
                  {coursesList.length} {t("dept.courses")}
                </Badge>
              </div>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <div className="px-3 pb-3 pt-1 space-y-2 border-t bg-background/40">
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <InfoRow icon={<IdCard className="h-3.5 w-3.5" />} label={t("reports.universityId")} value={lec.university_id} />
              <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label={t("auth.email")} value={lec.email || "—"} />
              <InfoRow
                icon={<UserCheck className="h-3.5 w-3.5" />}
                label={t("auth.gender")}
                value={lec.gender === "M" ? t("auth.male") : lec.gender === "F" ? t("auth.female") : "—"}
              />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{t("admin.lecturerLevel")}</p>
              <div className="flex flex-wrap gap-1">
                {levels.length === 0 ? <span className="text-xs text-muted-foreground">—</span> :
                  levels.map((l) => (
                    <Badge key={l.id} variant="outline" className="text-[10px]">
                      <GraduationCap className="h-3 w-3 mr-1" />{l.code}
                    </Badge>
                  ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{t("admin.lecturerModules")}</p>
              <div className="flex flex-wrap gap-1">
                {coursesList.length === 0 ? <span className="text-xs text-muted-foreground">—</span> :
                  coursesList.map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-[10px]">
                      <BookOpen className="h-3 w-3 mr-1" />{c.code} — {c.name}
                    </Badge>
                  ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
