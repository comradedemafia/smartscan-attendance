import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, BookOpen, Plus, ChevronDown, ChevronRight, AlertCircle, Edit, Trash2, UserPlus } from "lucide-react";

type Department = { id: string; name: string; description: string | null };
type Lecturer = { lecturer_id: string; full_name: string; university_id: string; courses: { id: string; name: string; code: string }[] };

export default function AdminDepartments() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedLecturer, setExpandedLecturer] = useState<string | null>(null);
  
  // Department dialogs
  const [openDeptDialog, setOpenDeptDialog] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  
  const [deptDesc, setDeptDesc] = useState("");
  
  // Assign lecturer dialog
  const [openAssignDialog, setOpenAssignDialog] = useState(false);
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assignLecturerId, setAssignLecturerId] = useState("");
  const [assignDeptId, setAssignDeptId] = useState("");
  
  // Course dialog
  const [openCourseDialog, setOpenCourseDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [courseDeptId, setCourseDeptId] = useState("");

  // Register lecturer dialog
  const [openRegisterDialog, setOpenRegisterDialog] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regUniId, setRegUniId] = useState("");
  const [regGender, setRegGender] = useState("M");
  const [regDeptId, setRegDeptId] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Edit lecturer dialog
  const [openEditLecturerDialog, setOpenEditLecturerDialog] = useState(false);
  const [editLecturerId, setEditLecturerId] = useState("");
  const [editLecturerName, setEditLecturerName] = useState("");
  const [editLecturerPhone, setEditLecturerPhone] = useState("");
  const [editLecturerGender, setEditLecturerGender] = useState("M");

  // Delete lecturer
  const [deleteLecturerId, setDeleteLecturerId] = useState<string | null>(null);


  // Departments
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // All courses
  const { data: allCourses = [] } = useQuery({
    queryKey: ["all-courses-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name, code, department_id, description").order("name");
      if (error) throw error;
      return data;
    },
  });

  // All lecturers
  const { data: allLecturers = [] } = useQuery({
    queryKey: ["all-lecturers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles(id, full_name, university_id, department_id, phone, gender)")
        .eq("role", "lecturer");
      if (error) throw error;
      return (data || []).map((r: any) => r.profiles).filter(Boolean);
    },
  });

  // Dept lecturers (for expanded dept)
  const { data: deptLecturers = [] } = useQuery<Lecturer[]>({
    queryKey: ["dept-lecturers-admin", expandedDept],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_department_lecturers", { _department_id: expandedDept });
      if (error) throw error;
      const map = new Map<string, Lecturer>();
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
    enabled: !!expandedDept,
  });


  // Session stats
  const { data: sessionStats = {} } = useQuery({
    queryKey: ["session-stats-by-course"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("course_id, created_by, status, session_date")
        .order("session_date", { ascending: false });
      if (error) throw error;
      const stats: Record<string, { total: number; completed: number; missed: number }> = {};
      (data || []).forEach((s: any) => {
        const key = `${s.created_by}_${s.course_id}`;
        if (!stats[key]) stats[key] = { total: 0, completed: 0, missed: 0 };
        stats[key].total++;
        if (s.status === "completed") stats[key].completed++;
        if (s.status === "scheduled" && new Date(s.session_date) < new Date()) stats[key].missed++;
      });
      return stats;
    },
  });

  // ─── Mutations ───

  const saveDeptMutation = useMutation({
    mutationFn: async () => {
      if (editingDept) {
        const { error } = await supabase.from("departments").update({ name: deptName, description: deptDesc || null } as any).eq("id", editingDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert({ name: deptName, description: deptDesc || null } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: t("common.success"), description: editingDept ? t("dept.deptUpdated") : t("dept.deptCreated") });
      resetDeptForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: t("common.success"), description: t("dept.deptDeleted") });
      if (expandedDept) setExpandedDept(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const saveCourseMutation = useMutation({
    mutationFn: async () => {
      if (editingCourse) {
        const { error } = await supabase.from("courses").update({ name: courseName, code: courseCode.toUpperCase(), description: courseDesc || null, department_id: courseDeptId || null }).eq("id", editingCourse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert({ name: courseName, code: courseCode.toUpperCase(), description: courseDesc || null, department_id: courseDeptId || null, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-courses-admin"] });
      queryClient.invalidateQueries({ queryKey: ["dept-lecturers-admin"] });
      toast({ title: t("common.success"), description: editingCourse ? t("dept.courseUpdated") : t("dept.courseCreated") });
      resetCourseForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-courses-admin"] });
      toast({ title: t("common.success"), description: t("dept.courseDeleted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("course_lecturers").insert({
        course_id: assignCourseId, lecturer_id: assignLecturerId, assigned_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dept-lecturers-admin"] });
      toast({ title: t("common.success"), description: t("dept.lecturerAssigned") });
      setOpenAssignDialog(false);
      setAssignCourseId(""); setAssignLecturerId(""); setAssignDeptId("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ courseId, lecturerId }: { courseId: string; lecturerId: string }) => {
      const { error } = await supabase.from("course_lecturers").delete()
        .eq("course_id", courseId).eq("lecturer_id", lecturerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dept-lecturers-admin"] });
      toast({ title: t("common.success"), description: t("dept.assignmentRemoved") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Register new lecturer
  const registerLecturerMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signUp({
        email: regEmail,
        password: Array.from(crypto.getRandomValues(new Uint8Array(24)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'[b % 67]).join(''),
        options: {
          data: {
            university_id: regUniId,
            full_name: regName,
            role: "lecturer",
            gender: regGender,
            department_id: regDeptId || undefined,
            phone: regPhone || undefined,
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-lecturers"] });
      toast({ title: t("common.success"), description: t("dept.lecturerRegistered") });
      setOpenRegisterDialog(false);
      setRegName(""); setRegEmail(""); setRegUniId(""); setRegGender("M"); setRegDeptId(""); setRegPhone("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Edit lecturer profile
  const editLecturerMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({
        full_name: editLecturerName,
        phone: editLecturerPhone || null,
        gender: editLecturerGender,
      }).eq("id", editLecturerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-lecturers"] });
      queryClient.invalidateQueries({ queryKey: ["dept-lecturers-admin"] });
      toast({ title: t("common.success"), description: t("dept.lecturerUpdated") });
      setOpenEditLecturerDialog(false);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  // Delete lecturer
  const deleteLecturerMutation = useMutation({
    mutationFn: async (lecturerId: string) => {
      await supabase.from("course_lecturers").delete().eq("lecturer_id", lecturerId);
      await supabase.from("sessions").delete().eq("created_by", lecturerId);
      await supabase.from("user_roles").delete().eq("user_id", lecturerId);
      const { error } = await supabase.from("profiles").delete().eq("id", lecturerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-lecturers"] });
      queryClient.invalidateQueries({ queryKey: ["dept-lecturers-admin"] });
      toast({ title: t("common.success"), description: t("dept.lecturerDeleted") });
      setDeleteLecturerId(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });


  // ─── Form helpers ───
  const resetDeptForm = () => { setOpenDeptDialog(false); setEditingDept(null); setDeptName(""); setDeptDesc(""); };
  const openEditDept = (dept: Department) => { setEditingDept(dept); setDeptName(dept.name); setDeptDesc(dept.description || ""); setOpenDeptDialog(true); };
  const resetCourseForm = () => { setOpenCourseDialog(false); setEditingCourse(null); setCourseName(""); setCourseCode(""); setCourseDesc(""); setCourseDeptId(""); };
  const openEditCourse = (course: any) => { setEditingCourse(course); setCourseName(course.name); setCourseCode(course.code); setCourseDesc(course.description || ""); setCourseDeptId(course.department_id || ""); setOpenCourseDialog(true); };
  const openAddCourseForDept = (deptId: string) => { resetCourseForm(); setCourseDeptId(deptId); setOpenCourseDialog(true); };
  const openAssignForDept = (deptId: string) => { setAssignDeptId(deptId); setAssignCourseId(""); setAssignLecturerId(""); setOpenAssignDialog(true); };
  const openRegisterForDept = (deptId: string) => { setRegDeptId(deptId); setRegName(""); setRegEmail(""); setRegUniId(""); setRegGender("M"); setRegPhone(""); setOpenRegisterDialog(true); };
  const openEditLecturer = (l: any) => {
    const prof = allLecturers.find((p: any) => p.id === l.lecturer_id) || l;
    setEditLecturerId(l.lecturer_id);
    setEditLecturerName(prof.full_name || l.full_name);
    setEditLecturerPhone(prof.phone || "");
    setEditLecturerGender(prof.gender || "M");
    setOpenEditLecturerDialog(true);
  };

  const deptCourses = (deptId: string) => allCourses.filter((c: any) => c.department_id === deptId);
  const assignFilteredCourses = assignDeptId ? deptCourses(assignDeptId) : allCourses;
  // Filter lecturers: only show lecturers whose department matches the assign department
  const assignFilteredLecturers = assignDeptId
    ? allLecturers.filter((l: any) => l.department_id === assignDeptId)
    : allLecturers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("dept.departments")}</h1>
          <p className="text-muted-foreground">{t("dept.adminDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openDeptDialog} onOpenChange={(o) => { if (!o) resetDeptForm(); setOpenDeptDialog(o); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />{t("dept.addSemester")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingDept ? t("dept.editSemester") : t("dept.addSemester")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>{t("dept.deptName")}</Label><Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Semester 1" /></div>
                <div className="space-y-2"><Label>{t("courses.description")}</Label><Input value={deptDesc} onChange={(e) => setDeptDesc(e.target.value)} placeholder="Optional description" /></div>
                <Button className="w-full" onClick={() => saveDeptMutation.mutate()} disabled={!deptName || saveDeptMutation.isPending}>
                  {editingDept ? t("common.save") : t("dept.addSemester")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Course Dialog */}
      <Dialog open={openCourseDialog} onOpenChange={(o) => { if (!o) resetCourseForm(); setOpenCourseDialog(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCourse ? t("dept.editCourse") : t("dept.addCourse")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("courses.code")}</Label><Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="CS101" /></div>
            <div className="space-y-2"><Label>{t("courses.name")}</Label><Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Introduction to CS" /></div>
            <div className="space-y-2"><Label>{t("courses.description")}</Label><Input value={courseDesc} onChange={(e) => setCourseDesc(e.target.value)} placeholder="Optional" /></div>
            <div className="space-y-2">
              <Label>{t("auth.department")}</Label>
              <Select value={courseDeptId} onValueChange={setCourseDeptId}>
                <SelectTrigger><SelectValue placeholder={t("auth.selectDepartment")} /></SelectTrigger>
                <SelectContent>{departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => saveCourseMutation.mutate()} disabled={!courseName || !courseCode || saveCourseMutation.isPending}>
              {editingCourse ? t("common.save") : t("dept.addCourse")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Lecturer Dialog */}
      <Dialog open={openAssignDialog} onOpenChange={setOpenAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dept.assignLecturer")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("dept.course")}</Label>
              <Select value={assignCourseId} onValueChange={setAssignCourseId}>
                <SelectTrigger><SelectValue placeholder={t("reports.selectCourse")} /></SelectTrigger>
                <SelectContent>{assignFilteredCourses.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("dept.lecturer")}</Label>
              <Select value={assignLecturerId} onValueChange={setAssignLecturerId}>
                <SelectTrigger><SelectValue placeholder={t("dept.selectLecturer")} /></SelectTrigger>
                <SelectContent>{assignFilteredLecturers.map((l: any) => (<SelectItem key={l.id} value={l.id}>{l.full_name} ({l.university_id})</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => assignMutation.mutate()} disabled={!assignCourseId || !assignLecturerId || assignMutation.isPending}>
              {t("dept.assign")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Register Lecturer Dialog */}
      <Dialog open={openRegisterDialog} onOpenChange={setOpenRegisterDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dept.registerLecturer")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("auth.fullName")}</Label><Input value={regName} onChange={(e) => setRegName(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t("auth.email")}</Label><Input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t("auth.universityId")}</Label><Input value={regUniId} onChange={(e) => setRegUniId(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>{t("auth.gender")}</Label>
              <Select value={regGender} onValueChange={setRegGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">{t("auth.male")}</SelectItem>
                  <SelectItem value="F">{t("auth.female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("auth.phone")}</Label><Input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="+255..." /></div>
            <Button className="w-full" onClick={() => registerLecturerMutation.mutate()} disabled={!regName || !regEmail || !regUniId || registerLecturerMutation.isPending}>
              {t("dept.registerLecturer")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Lecturer Dialog */}
      <Dialog open={openEditLecturerDialog} onOpenChange={setOpenEditLecturerDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dept.editLecturer")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("auth.fullName")}</Label><Input value={editLecturerName} onChange={(e) => setEditLecturerName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>{t("auth.gender")}</Label>
              <Select value={editLecturerGender} onValueChange={setEditLecturerGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">{t("auth.male")}</SelectItem>
                  <SelectItem value="F">{t("auth.female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t("auth.phone")}</Label><Input value={editLecturerPhone} onChange={(e) => setEditLecturerPhone(e.target.value)} /></div>
            <Button className="w-full" onClick={() => editLecturerMutation.mutate()} disabled={!editLecturerName || editLecturerMutation.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Lecturer Confirmation */}
      <AlertDialog open={!!deleteLecturerId} onOpenChange={(o) => { if (!o) setDeleteLecturerId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dept.deleteLecturer")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dept.confirmDeleteLecturer")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteLecturerId && deleteLecturerMutation.mutate(deleteLecturerId)}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Department list */}
      <div className="space-y-4">
        {departments.map((dept) => {
          const courses = deptCourses(dept.id);
          const isExpanded = expandedDept === dept.id;
          return (
            <Card key={dept.id} className={isExpanded ? "border-primary/40" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setExpandedDept(isExpanded ? null : dept.id)}>
                    <Building2 className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{dept.name}</CardTitle>
                      {dept.description && <p className="text-xs text-muted-foreground mt-0.5">{dept.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs text-muted-foreground mr-2">
                      <div>{courses.length} {t("dept.courses")}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditDept(dept); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteDeptMutation.mutate(dept.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  {/* Courses in this department */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />{t("dept.coursesInDept")}
                      </h3>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddCourseForDept(dept.id)}>
                        <Plus className="h-3 w-3 mr-1" />{t("dept.addCourse")}
                      </Button>
                    </div>
                    {courses.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">{t("dept.noCourses")}</p>
                    ) : (
                      <div className="space-y-2">
                        {courses.map((c: any) => {
                          const subjects: any[] = [];
                          return (
                            <div key={c.id} className="border rounded-md">
                              <div className="flex items-center justify-between px-3 py-2">
                                <div>
                                  <span className="font-mono text-xs text-muted-foreground mr-2">{c.code}</span>
                                  <span className="text-sm">{c.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditCourse(c)}><Edit className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteCourseMutation.mutate(c.id)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Lecturers */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />{t("dept.lecturers")}
                    </h3>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openRegisterForDept(dept.id)}>
                        <UserPlus className="h-3 w-3 mr-1" />{t("dept.registerLecturer")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAssignForDept(dept.id)}>
                        <Plus className="h-3 w-3 mr-1" />{t("dept.assignLecturer")}
                      </Button>
                    </div>
                  </div>
                  {deptLecturers.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{t("dept.noLecturers")}</p>
                  ) : (
                    <div className="space-y-2">
                      {deptLecturers.map((lecturer) => {
                        const isLecturerExpanded = expandedLecturer === lecturer.lecturer_id;
                        return (
                          <div key={lecturer.lecturer_id} className="border rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50" onClick={() => setExpandedLecturer(isLecturerExpanded ? null : lecturer.lecturer_id)}>
                              <div>
                                <p className="text-sm font-medium">{lecturer.full_name}</p>
                                <p className="text-xs text-muted-foreground">{lecturer.university_id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEditLecturer(lecturer); }}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteLecturerId(lecturer.lecturer_id); }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                                <Badge variant="secondary" className="text-xs">{lecturer.courses.length} {t("dept.courses")}</Badge>
                                {isLecturerExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </div>
                            </div>
                            {isLecturerExpanded && (
                              <div className="px-3 pb-3 bg-muted/20">
                                {lecturer.courses.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2">{t("dept.noCourses")}</p>
                                ) : (
                                  <div className="space-y-2 pt-2">
                                    {lecturer.courses.map((course) => {
                                      const statsKey = `${lecturer.lecturer_id}_${course.id}`;
                                      const stats = sessionStats[statsKey];
                                      const hasMissed = stats && stats.missed > 0;
                                      return (
                                        <div key={course.id} className={`flex items-center justify-between p-2 rounded-md text-sm ${hasMissed ? "bg-destructive/10 border border-destructive/20" : "bg-background"}`}>
                                          <div>
                                            <span className="font-mono text-xs text-muted-foreground mr-2">{course.code}</span>
                                            <span>{course.name}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {stats && <span className="text-xs text-muted-foreground">{stats.completed}/{stats.total} {t("dept.taught")}</span>}
                                            {hasMissed && (
                                              <div className="flex items-center gap-1 text-destructive text-xs">
                                                <AlertCircle className="h-3.5 w-3.5" />{stats.missed} {t("dept.missed")}
                                              </div>
                                            )}
                                            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive px-2" onClick={() => removeMutation.mutate({ courseId: course.id, lecturerId: lecturer.lecturer_id })}>
                                              {t("common.remove")}
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
        {departments.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{t("dept.noDepts")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
