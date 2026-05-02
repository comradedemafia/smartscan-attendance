import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  DialogTrigger,
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
import { UserPlus, Copy, Check, RefreshCcw } from "lucide-react";

interface Props {
  departments: { id: string; name: string }[];
  levels: { id: string; name: string; code: string; department_id: string }[];
}

function generateTempPassword(): string {
  // 16-char password including upper, lower, digit, symbol — meets strong policy.
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

export default function AddLecturerDialog({ departments, levels }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [fullName, setFullName] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("0");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [departmentId, setDepartmentId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [tempPassword, setTempPassword] = useState(generateTempPassword());

  const filteredLevels = useMemo(
    () => levels.filter((l) => l.department_id === departmentId),
    [levels, departmentId],
  );

  const reset = () => {
    setFullName("");
    setUniversityId("");
    setEmail("");
    setPhone("0");
    setGender("M");
    setDepartmentId("");
    setLevelId("");
    setTempPassword(generateTempPassword());
    setCopied(false);
  };

  const handleCreate = async () => {
    if (!fullName.trim() || !universityId.trim() || !email.trim()) {
      toast({ title: t("common.error"), description: "Name, ID, and email are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-lecturer", {
        body: {
          full_name: fullName.trim(),
          university_id: universityId.trim(),
          email: email.trim().toLowerCase(),
          phone: phone || null,
          gender,
          department_id: departmentId || null,
          level_id: levelId || null,
          password: tempPassword,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: t("admin.lecturerCreated"), description: email });
      qc.invalidateQueries({ queryKey: ["mu-profiles"] });
      qc.invalidateQueries({ queryKey: ["mu-roles"] });
      // Keep dialog open so admin can copy the temp password, but reset name/email for next entry
      setFullName("");
      setUniversityId("");
      setEmail("");
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          {t("admin.addLecturer")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("admin.addLecturer")}</DialogTitle>
          <DialogDescription>{t("admin.addLecturerDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("auth.fullName")}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Mwalimu" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("auth.universityId")}</Label>
              <Input value={universityId} onChange={(e) => setUniversityId(e.target.value)} placeholder="STF-2025-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("auth.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@uni.ac.tz" />
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
                placeholder="0712345678"
                maxLength={10}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("auth.gender")}</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as "M" | "F")}>
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
              <Label className="text-xs">{t("auth.department")}</Label>
              <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setLevelId(""); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("enroll.level")}</Label>
              <Select value={levelId} onValueChange={setLevelId} disabled={!departmentId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {filteredLevels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/40 p-3">
            <Label className="text-xs">{t("admin.tempPassword")}</Label>
            <div className="flex items-center gap-2">
              <Input value={tempPassword} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setTempPassword(generateTempPassword())}
                title="Regenerate"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={async () => {
                  await navigator.clipboard.writeText(tempPassword);
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "…" : t("admin.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}