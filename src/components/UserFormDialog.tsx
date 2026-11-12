import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Copy, Pencil, RefreshCcw, UserPlus } from "lucide-react";

type Role = "admin" | "lecturer" | "student";

export interface ManagedUser {
  id: string;
  full_name: string;
  university_id: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  department_id: string | null;
  academic_year: string | null;
  study_year: number | null;
  role: Role;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  defaultRole?: Role;
  initialUser?: ManagedUser | null;
  currentUserId?: string;
  departments: { id: string; name: string }[];
  levels: { id: string; name: string; code: string; department_id: string }[];
  courses: { id: string; name: string; code: string; department_id: string; level_id: string | null }[];
  onSaved: () => void;
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*?";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = 0; i < 12; i++) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

export default function UserFormDialog({
  open,
  onOpenChange,
  mode,
  defaultRole = "student",
  initialUser,
  currentUserId,
  departments,
  levels,
  courses,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("0");
  const [gender, setGender] = useState("M");
  const [role, setRole] = useState<Role>(defaultRole);
  const [departmentId, setDepartmentId] = useState("none");
  const [levelId, setLevelId] = useState("none");
  const [courseId, setCourseId] = useState("none");
  const [academicYear, setAcademicYear] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [password, setPassword] = useState(generateTempPassword());

  const isSelf = !!initialUser && initialUser.id === currentUserId;

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setCopied(false);
    setSubmitting(false);
    if (mode === "edit" && initialUser) {
      setFullName(initialUser.full_name ?? "");
      setUniversityId(initialUser.university_id ?? "");
      setEmail(initialUser.email ?? "");
      setPhone(initialUser.phone ?? "");
      setGender(initialUser.gender ?? "M");
      setRole(initialUser.role);
      setDepartmentId(initialUser.department_id ?? "none");
      setLevelId("none");
      setCourseId("none");
      setAcademicYear(initialUser.academic_year ?? "");
      setStudyYear(initialUser.study_year != null ? String(initialUser.study_year) : "");
      setPassword("");
    } else {
      setFullName("");
      setUniversityId("");
      setEmail("");
      setPhone("0");
      setGender("M");
      setRole(defaultRole);
      setDepartmentId("none");
      setLevelId("none");
      setCourseId("none");
      setAcademicYear("");
      setStudyYear("");
      setPassword(generateTempPassword());
    }
  }, [open, mode, initialUser, defaultRole]);

  const filteredLevels = useMemo(
    () => (departmentId === "none" ? [] : levels.filter((l) => l.department_id === departmentId)),
    [levels, departmentId],
  );

  const filteredCourses = useMemo(() => {
    if (departmentId === "none") return [];
    return courses.filter((c) => {
      const matchDept = c.department_id === departmentId;
      const matchLevel = levelId === "none" || c.level_id === levelId;
      return matchDept && matchLevel;
    });
  }, [courses, departmentId, levelId]);

  const handleSubmit = async () => {
    if (!fullName.trim() || !universityId.trim() || !email.trim()) {
      toast({ title: t("common.error"), description: t("common.nameIdEmailRequired"), variant: "destructive" });
      return;
    }
    if (role === "student" && departmentId === "none") {
      toast({ title: t("common.error"), description: t("admin.departmentRequired"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        action: mode === "create" ? "create" : "update",
        full_name: fullName.trim(),
        university_id: universityId.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || null,
        gender: gender || null,
        role,
        department_id: departmentId === "none" ? null : departmentId,
        academic_year: role === "student" ? (academicYear || null) : null,
        study_year: role === "student" && studyYear ? Number(studyYear) : null,
      };
      if (mode === "edit") payload.user_id = initialUser?.id;
      if (mode === "create") {
        payload.password = password;
        if (role === "student" && courseId !== "none") payload.course_id = courseId;
      }

      const { data, error } = await supabase.functions.invoke("admin-manage-users", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      if (mode === "create") {
        setCreated({ email: (data as any).email, password: (data as any).password });
        toast({ title: t("admin.userCreated"), description: (data as any).email });
        onSaved();
      } else {
        toast({ title: t("admin.userUpdated"), description: email });
        onSaved();
        onOpenChange(false);
      }
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? <UserPlus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />}
            {mode === "create"
              ? (role === "student" ? t("admin.addStudent") : role === "admin" ? t("admin.addAdmin") : t("admin.addStaff"))
              : t("admin.editUser")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("admin.addUserDesc") : t("admin.editUserDesc")}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">{t("admin.userCreated")}</p>
              <p className="text-muted-foreground mt-1">{created.email}</p>
            </div>
            <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/40 p-3">
              <Label className="text-xs">{t("admin.tempPassword")}</Label>
              <div className="flex items-center gap-2">
                <Input value={created.password} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyPassword} title={t("admin.copy")}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("auth.passwordPolicyHint")}</p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("auth.fullName")}</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("auth.fullNamePlaceholder")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("auth.universityId")}</Label>
                  <Input value={universityId} onChange={(e) => setUniversityId(e.target.value)} placeholder={t("auth.studentIdPlaceholder")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("auth.email")}</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("auth.phone")}</Label>
                  <Input
                    value={phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 10 && (val === "" || val.startsWith("0"))) setPhone(val);
                    }}
                    placeholder={t("auth.phonePlaceholder")}
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("auth.gender")}</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t("auth.male")}</SelectItem>
                      <SelectItem value="F">{t("auth.female")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("auth.role")}</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">{t("auth.student")}</SelectItem>
                      <SelectItem value="lecturer">{t("auth.lecturer")}</SelectItem>
                      <SelectItem value="admin">{t("common.admin")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {isSelf && <p className="text-[11px] text-muted-foreground">{t("admin.selfRoleLocked")}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("auth.department")}</Label>
                  <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setLevelId("none"); setCourseId("none"); }}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {role === "student" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("auth.academicYear")}</Label>
                      <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2024/2025" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("auth.studyYear")}</Label>
                      <Input type="number" min={1} max={6} value={studyYear} onChange={(e) => setStudyYear(e.target.value)} placeholder="1" />
                    </div>
                  </div>

                  {mode === "create" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("enroll.level")}</Label>
                        <Select value={levelId} onValueChange={(v) => { setLevelId(v); setCourseId("none"); }} disabled={departmentId === "none"}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {filteredLevels.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("admin.enrollInCourse")}</Label>
                        <Select value={courseId} onValueChange={setCourseId} disabled={departmentId === "none"}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {filteredCourses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </>
              )}

              {mode === "create" && (
                <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/40 p-3">
                  <Label className="text-xs">{t("admin.tempPassword")}</Label>
                  <div className="flex items-center gap-2">
                    <Input value={password} readOnly className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generateTempPassword())} title={t("admin.regenerate")}>
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        await navigator.clipboard.writeText(password);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      title={t("admin.copy")}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t("auth.passwordPolicyHint")}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !fullName.trim() || !universityId.trim() || !email.trim()}>
                {submitting ? "…" : mode === "create" ? t("admin.create") : t("common.save")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
