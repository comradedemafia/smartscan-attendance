import { useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Copy, Download, FileSpreadsheet, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DepartmentOption {
  id: string;
  name: string;
  code?: string | null;
}

interface LevelOption {
  id: string;
  name: string;
  code: string;
  department_id: string;
}

interface CourseOption {
  id: string;
  name: string;
  code: string;
  department_id: string;
  level_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DepartmentOption[];
  levels: LevelOption[];
  courses: CourseOption[];
  onDone: () => void;
}

interface PreviewRow {
  rowNum: number;
  full_name: string;
  university_id: string;
  email: string;
  phone: string;
  gender: string;
  department: string;
  level: string;
  module: string;
  academic_year: string;
  study_year: string;
  password: string;
  departmentId?: string;
  courseId?: string;
  errors: string[];
}

interface ImportResult {
  ok: boolean;
  full_name: string;
  university_id: string;
  email: string;
  password?: string;
  error?: string;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (l: string) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^["']|["']$/g, ""));
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
  return { headers, rows };
}

function normaliseGender(value: string): string {
  const v = value.trim().toLowerCase();
  if (["m", "male", "me", "mwanaume"].includes(v)) return "M";
  if (["f", "female", "ke", "mwanamke"].includes(v)) return "F";
  return value.trim().toUpperCase();
}

export default function BulkCreateStudentsDialog({
  open,
  onOpenChange,
  departments,
  levels,
  courses,
  onDone,
}: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const reset = () => {
    setFileName("");
    setRows([]);
    setMissingCols([]);
    setImporting(false);
    setResults(null);
    setCopiedAll(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const validRows = useMemo(
    () => rows.filter((r) => r.errors.length === 0 && r.departmentId),
    [rows],
  );

  const handleFile = async (file: File) => {
    setResults(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const { headers, rows: rawRows } = parseCsv(text);
      if (rawRows.length === 0) {
        toast({ title: t("common.error"), description: t("common.emptyFile"), variant: "destructive" });
        return;
      }

      const aliases: Record<string, string[]> = {
        full_name: ["full_name", "name", "jina"],
        university_id: ["university_id", "student_id", "studentid", "id", "namba"],
        email: ["email", "barua_pepe"],
        department: ["department", "dept", "idara"],
        level: ["level", "programme", "program", "ngazi"],
        module: ["module", "course", "course_code", "moduli"],
        phone: ["phone", "simu"],
        gender: ["gender", "jinsia"],
        academic_year: ["academic_year", "mwaka_wa_masomo"],
        study_year: ["study_year", "mwaka_wa_utafiti"],
        password: ["password", "neno_la_siri"],
      };
      const required = ["full_name", "university_id", "email", "department"];
      const colMap: Record<string, string> = {};
      const missing: string[] = [];
      required.forEach((req) => {
        const found = aliases[req].find((a) => headers.includes(a));
        if (found) colMap[req] = found;
        else missing.push(req);
      });
      setMissingCols(missing);

      const deptByKey = new Map<string, DepartmentOption>();
      departments.forEach((d) => {
        deptByKey.set(d.name.toLowerCase(), d);
        if (d.code) deptByKey.set(d.code.toLowerCase(), d);
      });
      const levelByKey = new Map<string, LevelOption>();
      levels.forEach((l) => {
        levelByKey.set(l.code.toLowerCase(), l);
        levelByKey.set(l.name.toLowerCase(), l);
      });
      const courseByKey = new Map<string, CourseOption>();
      courses.forEach((c) => {
        courseByKey.set(c.code.toLowerCase(), c);
        courseByKey.set(c.name.toLowerCase(), c);
      });

      const seenEmail = new Set<string>();
      const seenUniversityId = new Set<string>();

      const parsed: PreviewRow[] = rawRows.map((raw, i) => {
        const get = (key: string) => (colMap[key] ? (raw[colMap[key]] ?? "").trim() : "");
        const full_name = get("full_name");
        const university_id = get("university_id");
        const email = get("email").toLowerCase();
        const department = get("department");
        const level = get("level");
        const module = get("module");
        const phone = get("phone");
        const gender = normaliseGender(get("gender"));
        const academic_year = get("academic_year");
        const study_year = get("study_year");
        const password = get("password");
        const errors: string[] = [];

        if (missing.length > 0) {
          missing.forEach((m) => errors.push(`${t("admin.csvMissingColumn")}: ${m}`));
        }
        if (!full_name) errors.push(`${t("admin.csvEmptyValue")}: full_name`);
        if (!university_id) errors.push(`${t("admin.csvEmptyValue")}: university_id`);
        if (!email) errors.push(`${t("admin.csvEmptyValue")}: email`);
        if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push(t("auth.invalidEmail"));
        if (!department) errors.push(`${t("admin.csvEmptyValue")}: department`);
        if (gender && !["M", "F"].includes(gender)) errors.push(t("admin.csvInvalidGender"));
        if (study_year && !Number.isFinite(Number(study_year))) errors.push(t("admin.csvInvalidStudyYear"));

        const dept = department ? deptByKey.get(department.toLowerCase()) : undefined;
        if (department && !dept) errors.push(t("admin.csvUnknownDepartment"));

        const lvl = level ? levelByKey.get(level.toLowerCase()) : undefined;
        if (level && !lvl) errors.push(t("admin.csvUnknownLevel"));
        if (dept && lvl && lvl.department_id !== dept.id) errors.push(t("admin.csvMismatch"));

        const course = module ? courseByKey.get(module.toLowerCase()) : undefined;
        if (module && !course) errors.push(t("admin.csvUnknownCourse"));
        if (course && dept && course.department_id !== dept.id) errors.push(t("admin.csvMismatch"));
        if (course && lvl && course.level_id && course.level_id !== lvl.id) errors.push(t("admin.csvMismatch"));

        if (email) {
          if (seenEmail.has(email)) errors.push(t("admin.csvDuplicateEmail"));
          else seenEmail.add(email);
        }
        if (university_id) {
          const key = university_id.toLowerCase();
          if (seenUniversityId.has(key)) errors.push(t("admin.csvDuplicateId"));
          else seenUniversityId.add(key);
        }

        return {
          rowNum: i + 2,
          full_name,
          university_id,
          email,
          phone,
          gender,
          department,
          level,
          module,
          academic_year,
          study_year,
          password,
          departmentId: dept?.id,
          courseId: course?.id,
          errors,
        };
      });

      setRows(parsed);
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (validRows.length === 0) {
      toast({ title: t("common.error"), description: t("admin.bulkCreateNoRows"), variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const payloadRows = validRows.map((r) => ({
        full_name: r.full_name,
        university_id: r.university_id,
        email: r.email,
        phone: r.phone || null,
        gender: r.gender || null,
        department_id: r.departmentId,
        academic_year: r.academic_year || null,
        study_year: r.study_year ? Number(r.study_year) : null,
        password: r.password || undefined,
        course_id: r.courseId ?? null,
      }));

      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "bulk_create", rows: payloadRows },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const importResults = ((data as any).results ?? []) as ImportResult[];
      setResults(importResults);
      const created = importResults.filter((r) => r.ok).length;
      const failed = importResults.filter((r) => !r.ok).length;
      toast({
        title: t("admin.bulkCreateResults"),
        description: t("admin.bulkCreateSummary")
          .replace("{created}", String(created))
          .replace("{failed}", String(failed)),
      });
      onDone();
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const resultCsv = () => {
    if (!results) return "";
    const header = "full_name,university_id,email,password,status,error\n";
    const lines = results.map((r) =>
      [r.full_name, r.university_id, r.email, r.password ?? "", r.ok ? "created" : "failed", r.error ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    return header + lines.join("\n");
  };

  const copyAll = async () => {
    if (!results) return;
    const text = results
      .filter((r) => r.ok)
      .map((r) => `${r.email}\t${r.password ?? ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  const downloadResults = () => {
    if (!results) return;
    const blob = new Blob([resultCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-import-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {t("admin.bulkCreateStudents")}
          </DialogTitle>
          <DialogDescription>{t("admin.bulkCreateDesc")}</DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span><strong>{results.filter((r) => r.ok).length}</strong> {t("admin.created")}</span>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span><strong>{results.filter((r) => !r.ok).length}</strong> {t("admin.failed")}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyAll} disabled={results.every((r) => !r.ok)}>
                {copiedAll ? <CheckCircle2 className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {t("admin.copyAllPasswords")}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadResults}>
                <Download className="h-4 w-4 mr-1.5" />
                {t("admin.downloadResults")}
              </Button>
            </div>

            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.studentName")}</TableHead>
                    <TableHead>{t("reports.universityId")}</TableHead>
                    <TableHead>{t("auth.email")}</TableHead>
                    <TableHead>{t("auth.password")}</TableHead>
                    <TableHead>{t("admin.csvIssue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={`${r.email}-${i}`} className={cn(!r.ok && "bg-destructive/5")}>
                      <TableCell className="text-sm">{r.full_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.university_id || "—"}</TableCell>
                      <TableCell className="text-xs">{r.email || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.password ?? "—"}</TableCell>
                      <TableCell>
                        {r.ok ? (
                          <Badge className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" />{t("admin.created")}</Badge>
                        ) : (
                          <span className="text-[11px] text-destructive">{r.error}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>{t("common.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("admin.bulkCreateCsvFormat")}</p>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  {t("admin.uploadCsv")}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {fileName && <span className="text-xs text-muted-foreground self-center">{fileName}</span>}
              </div>

              {missingCols.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>{t("admin.csvMissingColumn")}: <strong>{missingCols.join(", ")}</strong></div>
                </div>
              )}

              {rows.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span><strong>{validRows.length}</strong> {t("admin.csvValid")}</span>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span><strong>{rows.filter((r) => r.errors.length > 0).length}</strong> {t("admin.csvInvalid")}</span>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <span><strong>{rows.length}</strong> {t("common.total")}</span>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">{t("admin.csvRow")}</TableHead>
                          <TableHead>{t("auth.fullName")}</TableHead>
                          <TableHead>{t("reports.universityId")}</TableHead>
                          <TableHead>{t("auth.email")}</TableHead>
                          <TableHead>{t("auth.department")}</TableHead>
                          <TableHead>{t("enroll.module")}</TableHead>
                          <TableHead>{t("admin.csvIssue")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.rowNum} className={cn(r.errors.length > 0 && "bg-destructive/5")}>
                            <TableCell className="text-xs text-muted-foreground">{r.rowNum}</TableCell>
                            <TableCell className="text-sm">{r.full_name || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.university_id || "—"}</TableCell>
                            <TableCell className="text-xs">{r.email || "—"}</TableCell>
                            <TableCell className="text-xs">{r.department || "—"}</TableCell>
                            <TableCell className="text-xs">{r.module || "—"}</TableCell>
                            <TableCell>
                              {r.errors.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {r.errors.map((err, i) => (
                                    <span key={i} className="text-[11px] text-destructive">• {err}</span>
                                  ))}
                                </div>
                              ) : (
                                <Badge className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" />{t("admin.csvValid")}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
                {t("common.cancel")}
              </Button>
              <Button onClick={confirmImport} disabled={importing || missingCols.length > 0 || validRows.length === 0}>
                <Upload className="h-4 w-4 mr-1.5" />
                {importing ? t("admin.importingNow") : t("admin.csvConfirmImport")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
