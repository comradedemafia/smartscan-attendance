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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, BookOpen, Plus, ChevronDown, ChevronRight, AlertCircle, Edit, Trash2, UserPlus, GraduationCap, ArrowRightLeft, X } from "lucide-react";

type Department = { id: string; name: string; description: string | null };
type Level = { id: string; name: string; code: string; department_id: string; sort_order: number };
type Semester = { id: string; name: string; code: string; level_id: string; sort_order: number };
type Lecturer = { lecturer_id: string; full_name: string; university_id: string; courses: { id: string; name: string; code: string }[] };

export default function AdminDepartments() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [expandedSemester, setExpandedSemester] = useState<string | null>(null);
  const [expandedLecturer, setExpandedLecturer] = useState<string | null>(null);
  
  // Department dialogs
  const [openDeptDialog, setOpenDeptDialog] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptDesc, setDeptDesc] = useState("");

  // Semester dialog
  const [openSemesterDialog, setOpenSemesterDialog] = useState(false);
  const [editingSemester, setEditingSemester] = useState<Semester | null>(null);
  const [semesterName, setSemesterName] = useState("");
  const [semesterCode, setSemesterCode] = useState("");
  const [semesterLevelId, setSemesterLevelId] = useState("");
  const [confirmDeleteSemesterId, setConfirmDeleteSemesterId] = useState<string | null>(null);
  
  // Assign lecturer dialog
  const [openAssignDialog, setOpenAssignDialog] = useState(false);
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assignLecturerId, setAssignLecturerId] = useState("");
  const [assignDeptId, setAssignDeptId] = useState("");
  const [assignLevelId, setAssignLevelId] = useState("");
  
  // Course dialog
  const [openCourseDialog, setOpenCourseDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [courseDeptId, setCourseDeptId] = useState("");
  const [courseLevelId, setCourseLevelId] = useState("");
  const [courseSemesterId, setCourseSemesterId] = useState("");
  const [confirmDeleteDeptId, setConfirmDeleteDeptId] = useState<string | null>(null);
  const [confirmDeleteCourseId, setConfirmDeleteCourseId] = useState<string | null>(null);
  const [confirmRemoveLecturer, setConfirmRemoveLecturer] = useState<{ courseId: string; lecturerId: string } | null>(null);

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

  // Move course dialog
  const [moveCourse, setMoveCourse] = useState<any>(null);
  const [moveDeptId, setMoveDeptId] = useState("");
  const [moveLevelId, setMoveLevelId] = useState("");
  const [moveSemesterId, setMoveSemesterId] = useState("");
  const [confirmMove, setConfirmMove] = useState(false);

  // Cascading filters for the admin department list
  const [filterDeptId, setFilterDeptId] = useState<string>("all");
  const [filterLevelId, setFilterLevelId] = useState<string>("all");
  const [filterSemesterId, setFilterSemesterId] = useState<string>("all");

  // Departments
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // All levels
  const { data: allLevels = [] } = useQuery<Level[]>({
    queryKey: ["all-levels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("*").order("sort_order");
      if (error) throw error;
      return data as Level[];
    },
  });

  // All semesters
  const { data: allSemesters = [] } = useQuery<Semester[]>({
    queryKey: ["all-semesters"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("semesters").select("*").order("sort_order");
      if (error) throw error;
      return (data || []) as Semester[];
    },
  });

  // All courses
  const { data: allCourses = [] } = useQuery({
    queryKey: ["all-courses-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, name, code, department_id, level_id, semester_id, description").order("name");
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
        const { data: newDept, error } = await supabase.from("departments").insert({ name: deptName, description: deptDesc || null } as any).select("id").single();
        if (error) throw error;
        // Auto-create the 3 NTA levels for the new department, plus 2 semesters per level
        if (newDept) {
          const { data: newLevels, error: levelsError } = await supabase.from("levels").insert([
            { department_id: newDept.id, name: "Basic Technician Certificate (NTA LEVEL 4)", code: "BTCCD", sort_order: 1 },
            { department_id: newDept.id, name: "Technician Certificate (NTA LEVEL 5)", code: "TCCD", sort_order: 2 },
            { department_id: newDept.id, name: "Ordinary Diploma (NTA LEVEL 6)", code: "ODCD", sort_order: 3 },
          ] as any).select("id");
          if (levelsError) console.error("Failed to create levels:", levelsError);
          if (newLevels && newLevels.length > 0) {
            const semRows = newLevels.flatMap((l: any) => [
              { level_id: l.id, name: "Semester 1", code: "S1", sort_order: 1 },
              { level_id: l.id, name: "Semester 2", code: "S2", sort_order: 2 },
            ]);
            const { error: semErr } = await (supabase as any).from("semesters").insert(semRows);
            if (semErr) console.error("Failed to create semesters:", semErr);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["all-levels"] });
      queryClient.invalidateQueries({ queryKey: ["all-semesters"] });
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
      queryClient.invalidateQueries({ queryKey: ["all-levels"] });
      toast({ title: t("common.success"), description: t("dept.deptDeleted") });
      if (expandedDept) setExpandedDept(null);
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const saveCourseMutation = useMutation({
    mutationFn: async () => {
      // Validation: require Department -> Level -> Semester in sequence
      if (!courseDeptId || !courseLevelId || !courseSemesterId) {
        throw new Error(t("dept.requireDeptLevelSemester"));
      }
      // Validation: semester must belong to the chosen level
      const sem = allSemesters.find((s) => s.id === courseSemesterId);
      if (!sem || sem.level_id !== courseLevelId) {
        throw new Error(t("dept.semesterNotInLevel"));
      }
      // Validation: level must belong to the chosen department
      const lvl = allLevels.find((l) => l.id === courseLevelId);
      if (!lvl || lvl.department_id !== courseDeptId) {
        throw new Error(t("dept.semesterNotInLevel"));
      }
      if (editingCourse) {
        const { error } = await supabase.from("courses").update({ name: courseName, code: courseCode.toUpperCase(), description: courseDesc || null, department_id: courseDeptId || null, level_id: courseLevelId || null, semester_id: courseSemesterId || null } as any).eq("id", editingCourse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert({ name: courseName, code: courseCode.toUpperCase(), description: courseDesc || null, department_id: courseDeptId || null, level_id: courseLevelId || null, semester_id: courseSemesterId || null, created_by: user!.id } as any);
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

  // Move course to another semester
  const moveCourseMutation = useMutation({
    mutationFn: async () => {
      if (!moveCourse) throw new Error("No course selected");
      if (!moveDeptId || !moveLevelId || !moveSemesterId) {
        throw new Error(t("dept.requireDeptLevelSemester"));
      }
      const sem = allSemesters.find((s) => s.id === moveSemesterId);
      if (!sem || sem.level_id !== moveLevelId) {
        throw new Error(t("dept.semesterNotInLevel"));
      }
      const lvl = allLevels.find((l) => l.id === moveLevelId);
      if (!lvl || lvl.department_id !== moveDeptId) {
        throw new Error(t("dept.semesterNotInLevel"));
      }
      const { error } = await supabase
        .from("courses")
        .update({ department_id: moveDeptId, level_id: moveLevelId, semester_id: moveSemesterId } as any)
        .eq("id", moveCourse.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-courses-admin"] });
      toast({ title: t("common.success"), description: t("dept.courseMoved") });
      setConfirmMove(false);
      setMoveCourse(null);
      setMoveDeptId(""); setMoveLevelId(""); setMoveSemesterId("");
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
      setConfirmMove(false);
    },
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
      setAssignCourseId(""); setAssignLecturerId(""); setAssignDeptId(""); setAssignLevelId("");
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

  // Semester mutations
  const saveSemesterMutation = useMutation({
    mutationFn: async () => {
      if (editingSemester) {
        const { error } = await (supabase as any).from("semesters").update({ name: semesterName, code: semesterCode.toUpperCase(), level_id: semesterLevelId }).eq("id", editingSemester.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("semesters").insert({ name: semesterName, code: semesterCode.toUpperCase(), level_id: semesterLevelId, sort_order: 99 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-semesters"] });
      toast({ title: t("common.success"), description: editingSemester ? t("dept.semesterUpdated") : t("dept.semesterCreated") });
      setOpenSemesterDialog(false);
      setEditingSemester(null); setSemesterName(""); setSemesterCode(""); setSemesterLevelId("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteSemesterMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("semesters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-semesters"] });
      queryClient.invalidateQueries({ queryKey: ["all-courses-admin"] });
      toast({ title: t("common.success"), description: t("dept.semesterDeleted") });
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
  const resetCourseForm = () => { setOpenCourseDialog(false); setEditingCourse(null); setCourseName(""); setCourseCode(""); setCourseDesc(""); setCourseDeptId(""); setCourseLevelId(""); setCourseSemesterId(""); };
  const openEditCourse = (course: any) => { setEditingCourse(course); setCourseName(course.name); setCourseCode(course.code); setCourseDesc(course.description || ""); setCourseDeptId(course.department_id || ""); setCourseLevelId(course.level_id || ""); setCourseSemesterId(course.semester_id || ""); setOpenCourseDialog(true); };
  const openAddCourseForSemester = (deptId: string, levelId: string, semesterId: string) => { resetCourseForm(); setCourseDeptId(deptId); setCourseLevelId(levelId); setCourseSemesterId(semesterId); setOpenCourseDialog(true); };
  const openAddSemesterForLevel = (levelId: string) => { setEditingSemester(null); setSemesterName(""); setSemesterCode(""); setSemesterLevelId(levelId); setOpenSemesterDialog(true); };
  const openEditSemester = (sem: Semester) => { setEditingSemester(sem); setSemesterName(sem.name); setSemesterCode(sem.code); setSemesterLevelId(sem.level_id); setOpenSemesterDialog(true); };
  const openAssignForDept = (deptId: string) => { setAssignDeptId(deptId); setAssignLevelId(""); setAssignCourseId(""); setAssignLecturerId(""); setOpenAssignDialog(true); };
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
  const levelCourses = (levelId: string) => allCourses.filter((c: any) => c.level_id === levelId);
  const semesterCourses = (semesterId: string) => allCourses.filter((c: any) => c.semester_id === semesterId);
  const deptLevels = (deptId: string) => allLevels.filter((l) => l.department_id === deptId);
  const levelSemesters = (levelId: string) => allSemesters.filter((s) => s.level_id === levelId);
  const assignFilteredCourses = (() => {
    let list = assignDeptId ? deptCourses(assignDeptId) : allCourses;
    if (assignLevelId) list = list.filter((c: any) => c.level_id === assignLevelId);
    return list;
  })();
  const assignDeptLevels = assignDeptId ? deptLevels(assignDeptId) : [];
  // Lecturers may teach across multiple departments/levels — show all so the admin can freely assign.
  const assignFilteredLecturers = allLecturers;

  // Levels & semesters available for selected dept/level in course dialog
  const courseDeptLevels = courseDeptId ? deptLevels(courseDeptId) : [];
  const courseLevelSemesters = courseLevelId ? levelSemesters(courseLevelId) : [];

  // Cascading filter helpers
  const filterDeptLevels = filterDeptId !== "all" ? deptLevels(filterDeptId) : [];
  const filterLevelSemesters = filterLevelId !== "all" ? levelSemesters(filterLevelId) : [];
  const filteredDepartments = filterDeptId === "all" ? departments : departments.filter((d) => d.id === filterDeptId);
  const isLevelVisible = (levelId: string) => filterLevelId === "all" || filterLevelId === levelId;
  const isSemesterVisible = (semesterId: string) => filterSemesterId === "all" || filterSemesterId === semesterId;
  const filtersActive = filterDeptId !== "all" || filterLevelId !== "all" || filterSemesterId !== "all";

  // Move course dialog helpers
  const moveDeptLevels = moveDeptId ? deptLevels(moveDeptId) : [];
  const moveLevelSemesters = moveLevelId ? levelSemesters(moveLevelId) : [];
  const openMoveCourseDialog = (course: any) => {
    setMoveCourse(course);
    setMoveDeptId(course.department_id || "");
    setMoveLevelId(course.level_id || "");
    setMoveSemesterId(course.semester_id || "");
  };

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
              <Button><Plus className="h-4 w-4 mr-2" />{t("dept.addDepartment")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingDept ? t("dept.editDepartment") : t("dept.addDepartment")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>{t("dept.deptName")}</Label><Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Community Development (CD)" /></div>
                <div className="space-y-2"><Label>{t("courses.description")}</Label><Input value={deptDesc} onChange={(e) => setDeptDesc(e.target.value)} placeholder="Optional description" /></div>
                <Button className="w-full" onClick={() => saveDeptMutation.mutate()} disabled={!deptName || saveDeptMutation.isPending}>
                  {editingDept ? t("common.save") : t("dept.addDepartment")}
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
              <Select value={courseDeptId} onValueChange={(v) => { setCourseDeptId(v); setCourseLevelId(""); }}>
                <SelectTrigger><SelectValue placeholder={t("auth.selectDepartment")} /></SelectTrigger>
                <SelectContent>{departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {courseDeptLevels.length > 0 && (
              <div className="space-y-2">
                <Label>{t("dept.level")}</Label>
                <Select value={courseLevelId} onValueChange={(v) => { setCourseLevelId(v); setCourseSemesterId(""); }}>
                  <SelectTrigger><SelectValue placeholder={t("dept.selectLevel")} /></SelectTrigger>
                  <SelectContent>{courseDeptLevels.map((l) => (<SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            )}
            {courseLevelSemesters.length > 0 && (
              <div className="space-y-2">
                <Label>{t("dept.semester")}</Label>
                <Select value={courseSemesterId} onValueChange={setCourseSemesterId}>
                  <SelectTrigger><SelectValue placeholder={t("dept.selectSemester")} /></SelectTrigger>
                  <SelectContent>{courseLevelSemesters.map((s) => (<SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            )}
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
              <Select value={assignDeptId} onValueChange={(v) => { setAssignDeptId(v); setAssignLevelId(""); setAssignCourseId(""); }}>
                <SelectTrigger><SelectValue placeholder={t("dept.department")} /></SelectTrigger>
                <SelectContent>{departments.map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent>
              </Select>
              <Select value={assignLevelId} onValueChange={(v) => { setAssignLevelId(v); setAssignCourseId(""); }} disabled={!assignDeptId}>
                <SelectTrigger><SelectValue placeholder={t("dept.level") || "Level"} /></SelectTrigger>
                <SelectContent>{assignDeptLevels.map((l: any) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}</SelectContent>
              </Select>
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
        {/* Cascading filters */}
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-[180px] flex-1">
                <Label className="text-xs">{t("dept.filterDept")}</Label>
                <Select value={filterDeptId} onValueChange={(v) => { setFilterDeptId(v); setFilterLevelId("all"); setFilterSemesterId("all"); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("dept.allDepartments")}</SelectItem>
                    {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[180px] flex-1">
                <Label className="text-xs">{t("dept.filterLevel")}</Label>
                <Select value={filterLevelId} onValueChange={(v) => { setFilterLevelId(v); setFilterSemesterId("all"); }} disabled={filterDeptId === "all"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("dept.allLevels")}</SelectItem>
                    {filterDeptLevels.map((l) => (<SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[180px] flex-1">
                <Label className="text-xs">{t("dept.filterSemester")}</Label>
                <Select value={filterSemesterId} onValueChange={setFilterSemesterId} disabled={filterLevelId === "all"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("dept.allSemesters")}</SelectItem>
                    {filterLevelSemesters.map((s) => (<SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterDeptId("all"); setFilterLevelId("all"); setFilterSemesterId("all"); }}>
                  <X className="h-3.5 w-3.5 mr-1" />{t("dept.clearFilters")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {filteredDepartments.map((dept) => {
          const courses = deptCourses(dept.id);
          const levels = deptLevels(dept.id);
          const isExpanded = expandedDept === dept.id || filterDeptId === dept.id;
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
                      <div>{levels.length} {t("dept.levels")}</div>
                      <div>{courses.length} {t("dept.courses")}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditDept(dept); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDeleteDeptId(dept.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0 space-y-4">
                  {/* Levels in this semester */}
                  {levels.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{t("dept.noLevels")}</p>
                  ) : (
                    <div className="space-y-2">
                      {levels.filter((lvl) => isLevelVisible(lvl.id)).map((level) => {
                        const lvlCourses = levelCourses(level.id);
                        const semesters = levelSemesters(level.id);
                        const isLevelExpanded = expandedLevel === level.id || filterLevelId === level.id;
                        return (
                          <div key={level.id} className="border rounded-lg overflow-hidden">
                            <div
                              className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedLevel(isLevelExpanded ? null : level.id)}
                            >
                              <div className="flex items-center gap-2">
                                <GraduationCap className="h-4 w-4 text-primary" />
                                <div>
                                  <span className="text-sm font-medium">{level.name}</span>
                                  <Badge variant="outline" className="ml-2 text-xs">{level.code}</Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">{semesters.length} {t("dept.semesters")}</Badge>
                                <Badge variant="secondary" className="text-xs">{lvlCourses.length} {t("dept.courses")}</Badge>
                                {isLevelExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </div>
                            </div>
                            {isLevelExpanded && (
                              <div className="px-3 pb-3 bg-muted/20">
                                <div className="flex items-center justify-between mb-2 pt-2">
                                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <BookOpen className="h-3 w-3" />{t("dept.semesters")}
                                  </h4>
                                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); openAddSemesterForLevel(level.id); }}>
                                    <Plus className="h-3 w-3 mr-1" />{t("dept.addSemester")}
                                  </Button>
                                </div>
                                {semesters.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2">{t("dept.noSemesters")}</p>
                                ) : (
                                  <div className="space-y-2">
                                    {semesters.filter((s) => isSemesterVisible(s.id)).map((sem) => {
                                      const semCourses = semesterCourses(sem.id);
                                      const isSemExpanded = expandedSemester === sem.id || filterSemesterId === sem.id;
                                      return (
                                        <div key={sem.id} className="border rounded-md overflow-hidden bg-background">
                                          <div
                                            className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-muted/40"
                                            onClick={() => setExpandedSemester(isSemExpanded ? null : sem.id)}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-medium">{sem.name}</span>
                                              <Badge variant="outline" className="text-[10px]">{sem.code}</Badge>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <Badge variant="secondary" className="text-[10px]">{semCourses.length} {t("dept.courses")}</Badge>
                                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEditSemester(sem); }}>
                                                <Edit className="h-3 w-3" />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDeleteSemesterId(sem.id); }}>
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                              {isSemExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                            </div>
                                          </div>
                                          {isSemExpanded && (
                                            <div className="px-3 pb-3 pt-1 border-t">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="text-[11px] font-medium text-muted-foreground">{t("dept.modulesInSemester")}</span>
                                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => openAddCourseForSemester(dept.id, level.id, sem.id)}>
                                                  <Plus className="h-3 w-3 mr-1" />{t("dept.addCourse")}
                                                </Button>
                                              </div>
                                              {semCourses.length === 0 ? (
                                                <p className="text-xs text-muted-foreground py-1">{t("dept.noCourses")}</p>
                                              ) : (
                                                <div className="space-y-1">
                                                  {semCourses.map((c: any) => (
                                                    <div key={c.id} className="flex items-center justify-between px-2 py-1.5 rounded-md border">
                                                      <div>
                                                        <span className="font-mono text-xs text-muted-foreground mr-2">{c.code}</span>
                                                        <span className="text-sm">{c.name}</span>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" title={t("dept.moveCourse")} onClick={() => openMoveCourseDialog(c)}>
                                                          <ArrowRightLeft className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditCourse(c)}><Edit className="h-3 w-3" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setConfirmDeleteCourseId(c.id)}><Trash2 className="h-3 w-3" /></Button>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
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
                                            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive px-2" onClick={() => setConfirmRemoveLecturer({ courseId: course.id, lecturerId: lecturer.lecturer_id })}>
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
      <ConfirmDialog
        open={!!confirmDeleteDeptId}
        onOpenChange={(open) => !open && setConfirmDeleteDeptId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDeleteDept")}
        onConfirm={() => {
          if (confirmDeleteDeptId) deleteDeptMutation.mutate(confirmDeleteDeptId);
          setConfirmDeleteDeptId(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteCourseId}
        onOpenChange={(open) => !open && setConfirmDeleteCourseId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDeleteCourse")}
        onConfirm={() => {
          if (confirmDeleteCourseId) deleteCourseMutation.mutate(confirmDeleteCourseId);
          setConfirmDeleteCourseId(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmRemoveLecturer}
        onOpenChange={(open) => !open && setConfirmRemoveLecturer(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmRemoveLecturerCourse")}
        onConfirm={() => {
          if (confirmRemoveLecturer) removeMutation.mutate(confirmRemoveLecturer);
          setConfirmRemoveLecturer(null);
        }}
        confirmLabel={t("common.remove")}
      />

      {/* Semester Dialog */}
      <Dialog open={openSemesterDialog} onOpenChange={(o) => { if (!o) { setOpenSemesterDialog(false); setEditingSemester(null); } else { setOpenSemesterDialog(o); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSemester ? t("dept.editSemester") : t("dept.addSemester")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("dept.semesterName")}</Label>
              <Input value={semesterName} onChange={(e) => setSemesterName(e.target.value)} placeholder="Semester 1" />
            </div>
            <div className="space-y-2">
              <Label>{t("dept.semesterCode")}</Label>
              <Input value={semesterCode} onChange={(e) => setSemesterCode(e.target.value)} placeholder="S1" />
            </div>
            <Button className="w-full" onClick={() => saveSemesterMutation.mutate()} disabled={!semesterName || !semesterCode || !semesterLevelId || saveSemesterMutation.isPending}>
              {editingSemester ? t("common.save") : t("dept.addSemester")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDeleteSemesterId}
        onOpenChange={(open) => !open && setConfirmDeleteSemesterId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("dept.deleteSemester")}
        onConfirm={() => {
          if (confirmDeleteSemesterId) deleteSemesterMutation.mutate(confirmDeleteSemesterId);
          setConfirmDeleteSemesterId(null);
        }}
      />

      {/* Move Course Dialog */}
      <Dialog open={!!moveCourse && !confirmMove} onOpenChange={(o) => { if (!o) { setMoveCourse(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dept.moveCourseTitle")}</DialogTitle>
          </DialogHeader>
          {moveCourse && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t("dept.course")}</p>
                <p className="text-sm font-medium">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{moveCourse.code}</span>
                  {moveCourse.name}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("auth.department")}</Label>
                <Select value={moveDeptId} onValueChange={(v) => { setMoveDeptId(v); setMoveLevelId(""); setMoveSemesterId(""); }}>
                  <SelectTrigger><SelectValue placeholder={t("auth.selectDepartment")} /></SelectTrigger>
                  <SelectContent>{departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("dept.level")}</Label>
                <Select value={moveLevelId} onValueChange={(v) => { setMoveLevelId(v); setMoveSemesterId(""); }} disabled={!moveDeptId}>
                  <SelectTrigger><SelectValue placeholder={t("dept.selectLevel")} /></SelectTrigger>
                  <SelectContent>{moveDeptLevels.map((l) => (<SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("dept.semester")}</Label>
                <Select value={moveSemesterId} onValueChange={setMoveSemesterId} disabled={!moveLevelId}>
                  <SelectTrigger><SelectValue placeholder={t("dept.selectSemester")} /></SelectTrigger>
                  <SelectContent>{moveLevelSemesters.map((s) => (<SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!moveDeptId || !moveLevelId || !moveSemesterId || moveSemesterId === moveCourse.semester_id}
                onClick={() => setConfirmMove(true)}
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />{t("dept.moveCourse")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmMove}
        onOpenChange={(open) => !open && setConfirmMove(false)}
        title={t("dept.moveCourseTitle")}
        description={t("dept.confirmMoveCourse")}
        confirmLabel={t("dept.moveCourse")}
        variant="default"
        onConfirm={() => moveCourseMutation.mutate()}
      />
    </div>
  );
}