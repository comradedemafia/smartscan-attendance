import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  buildCredentialsCsv,
  buildRegistryTemplateCsv,
  parseRegistryFile,
  type RegistryParseResult,
} from "@/lib/registryCsv";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

interface RegistryRow {
  id: string;
  university_id: string;
  admission_number: string | null;
  full_name: string;
  email: string | null;
  email_is_synthetic: boolean;
  gender: string | null;
  department_id: string | null;
  department_raw: string | null;
  programme: string | null;
  study_year: number | null;
  semester: string | null;
  academic_year: string | null;
  phone: string | null;
  status: string;
  profile_id: string | null;
  provisioned_at: string | null;
  last_synced_at: string | null;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Course {
  id: string;
  code: string;
  name: string;
}

interface Alias {
  external_code: string;
  course_id: string;
}

interface UnmappedCode {
  external_code: string;
  count: number;
}

interface ReconciliationRow {
  registry_id: string;
  university_id: string;
  admission_number: string | null;
  registry_name: string;
  registry_department_id: string | null;
  registry_programme: string | null;
  registry_gender: string | null;
  profile_id: string | null;
  provisioned_at: string | null;
  profile_name: string | null;
  profile_department_id: string | null;
  profile_programme: string | null;
  profile_gender: string | null;
  status: string;
}

interface MissingProfileRow {
  id: string;
  university_id: string;
  full_name: string;
  email: string | null;
  department_id: string | null;
  programme: string | null;
  gender: string | null;
  created_at: string;
}

interface ReadinessRow {
  profile_id: string;
  university_id: string;
  full_name: string;
  email: string | null;
  department_id: string | null;
  programme: string | null;
  has_avatar: boolean;
  totp_enabled: boolean;
  registry_id: string | null;
  registry_status: string | null;
  registry_linked: boolean;
  readiness_status: string;
}

interface ImportResult {
  ok: boolean;
  university_id: string;
  full_name: string;
  error?: string;
  registry_id?: string;
  existing_profile_found?: boolean;
  department_resolved?: boolean;
  department_raw?: string | null;
  unmatched_modules?: string[];
}

interface ProvisionResult {
  ok: boolean;
  university_id: string;
  full_name: string;
  user_id?: string;
  email?: string;
  email_is_synthetic?: boolean;
  password?: string | null;
  error?: string;
  linked_existing?: boolean;
  already_provisioned?: boolean;
  enrolled_modules?: number;
  enrollment_errors?: string[];
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function registryStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "suspended") return "destructive";
  if (status === "graduated") return "secondary";
  return "outline";
}

function reconciliationVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ok") return "default";
  if (status === "not_provisioned") return "secondary";
  return "destructive";
}

function readinessVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "missing_registry" || status === "inactive") return "secondary";
  return "destructive";
}

export default function StudentRegistry() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const registryStatusLabel = (status: string) => {
    switch (status) {
      case "active": return t("registry.statusActive");
      case "suspended": return t("registry.statusSuspended");
      case "graduated": return t("registry.statusGraduated");
      case "inactive": return t("registry.statusInactive");
      default: return status;
    }
  };
  const queryClient = useQueryClient();

  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<RegistryParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResults, setProvisionResults] = useState<ProvisionResult[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRegistryIds, setSelectedRegistryIds] = useState<string[]>([]);
  const [mappingValues, setMappingValues] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState<string | null>(null);

  const registryQuery = useQuery({
    queryKey: ["student-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_registry")
        .select(
          "id, university_id, admission_number, full_name, email, email_is_synthetic, gender, department_id, department_raw, programme, study_year, semester, academic_year, phone, status, profile_id, provisioned_at, last_synced_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as RegistryRow[];
    },
  });

  const departmentsQuery = useQuery({
    queryKey: ["registry-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const coursesQuery = useQuery({
    queryKey: ["registry-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, code, name").order("code");
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });

  const aliasesQuery = useQuery({
    queryKey: ["course-code-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_code_aliases")
        .select("external_code, course_id")
        .order("external_code");
      if (error) throw error;
      return (data ?? []) as Alias[];
    },
  });

  const unmappedQuery = useQuery({
    queryKey: ["registry-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_registry_enrollments")
        .select("external_code, course_id")
        .limit(5000);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (!row.course_id) counts.set(row.external_code, (counts.get(row.external_code) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([external_code, count]) => ({ external_code, count }))
        .sort((a, b) => a.external_code.localeCompare(b.external_code)) as UnmappedCode[];
    },
  });

  const reconciliationQuery = useQuery({
    queryKey: ["registry-reconciliation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_student_registry_reconciliation")
        .select("*")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ReconciliationRow[];
    },
  });

  const missingProfilesQuery = useQuery({
    queryKey: ["profiles-missing-registry"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_profiles_missing_registry").select("*").limit(1000);
      if (error) throw error;
      return (data ?? []) as MissingProfileRow[];
    },
  });

  const readinessQuery = useQuery({
    queryKey: ["student-attendance-readiness"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_student_attendance_readiness")
        .select("*")
        .order("full_name")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
  });

  const registryRows = useMemo(() => registryQuery.data ?? [], [registryQuery.data]);
  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data]);
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const aliases = aliasesQuery.data ?? [];
  const unmappedCodes = unmappedQuery.data ?? [];
  const reconciliationRows = useMemo(() => reconciliationQuery.data ?? [], [reconciliationQuery.data]);
  const missingProfiles = missingProfilesQuery.data ?? [];
  const readinessRows = useMemo(() => readinessQuery.data ?? [], [readinessQuery.data]);

  const departmentById = useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments]);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);

  const filteredRegistry = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return registryRows;
    return registryRows.filter((row) => {
      return (
        row.full_name.toLowerCase().includes(query) ||
        row.university_id.toLowerCase().includes(query) ||
        (row.admission_number ?? "").toLowerCase().includes(query) ||
        (row.programme ?? "").toLowerCase().includes(query)
      );
    });
  }, [registryRows, search]);

  const selectableRegistry = useMemo(
    () => filteredRegistry.filter((row) => !row.profile_id),
    [filteredRegistry],
  );
  const allSelectableSelected =
    selectableRegistry.length > 0 && selectableRegistry.every((row) => selectedRegistryIds.includes(row.id));
  const unprovisionedRows = useMemo(() => registryRows.filter((row) => !row.profile_id), [registryRows]);
  const reconciliationIssues = useMemo(
    () => reconciliationRows.filter((row) => row.status !== "ok"),
    [reconciliationRows],
  );
  const readinessIssues = useMemo(
    () => readinessRows.filter((row) => row.readiness_status !== "ready"),
    [readinessRows],
  );
  const readinessReady = readinessRows.length - readinessIssues.length;

  const importOk = importResults?.filter((result) => result.ok).length ?? 0;
  const importFailed = importResults ? importResults.length - importOk : 0;
  const provisionOk = provisionResults?.filter((result) => result.ok && !result.already_provisioned).length ?? 0;
  const provisionLinked = provisionResults?.filter((result) => result.linked_existing).length ?? 0;
  const provisionFailed = provisionResults?.filter((result) => !result.ok).length ?? 0;
  const credentialRows = (provisionResults ?? []).filter(
    (result) => result.ok && typeof result.password === "string" && result.password.length > 0,
  );

  const invalidateRegistry = () => {
    queryClient.invalidateQueries({ queryKey: ["student-registry"] });
    queryClient.invalidateQueries({ queryKey: ["registry-enrollments"] });
    queryClient.invalidateQueries({ queryKey: ["course-code-aliases"] });
    queryClient.invalidateQueries({ queryKey: ["registry-reconciliation"] });
    queryClient.invalidateQueries({ queryKey: ["profiles-missing-registry"] });
    queryClient.invalidateQueries({ queryKey: ["student-attendance-readiness"] });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setParseResult(null);
    setImportResults(null);
    setParsing(true);
    try {
      const parsed = await parseRegistryFile(file);
      setParseResult(parsed);
    } catch (error) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("registry.importFailed"),
        variant: "destructive",
      });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.students.length === 0) {
      toast({ title: t("common.error"), description: t("registry.selectFileFirst"), variant: "destructive" });
      return;
    }

    setImporting(true);
    setImportResults(null);
    try {
      const results: ImportResult[] = [];
      for (let index = 0; index < parseResult.students.length; index += 500) {
        const batch = parseResult.students.slice(index, index + 500).map((student) => ({
          university_id: student.university_id,
          admission_number: student.admission_number,
          full_name: student.full_name,
          email: student.email,
          gender: student.gender,
          department_raw: student.department_raw,
          programme: student.programme,
          study_year: student.study_year,
          semester: student.semester,
          academic_year: student.academic_year,
          phone: student.phone,
          status: student.status,
          modules: student.modules,
        }));

        const { data, error } = await supabase.functions.invoke("import-student-registry", {
          body: { rows: batch },
        });
        if (error) throw error;
        const payload = data as { error?: string; results?: ImportResult[] } | null;
        if (payload?.error) throw new Error(payload.error);
        results.push(...(payload?.results ?? []));
      }

      setImportResults(results);
      invalidateRegistry();
      toast({ title: t("common.success"), description: t("registry.importSuccess") });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("registry.importFailed"),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleProvision = async (ids: string[]) => {
    if (ids.length === 0) return;
    setProvisioning(true);
    setProvisionResults(null);
    try {
      const results: ProvisionResult[] = [];
      for (let index = 0; index < ids.length; index += 100) {
        const { data, error } = await supabase.functions.invoke("provision-student-accounts", {
          body: { registry_ids: ids.slice(index, index + 100) },
        });
        if (error) throw error;
        const payload = data as { error?: string; results?: ProvisionResult[] } | null;
        if (payload?.error) throw new Error(payload.error);
        results.push(...(payload?.results ?? []));
      }

      setProvisionResults(results);
      setSelectedRegistryIds([]);
      invalidateRegistry();
      toast({ title: t("common.success"), description: t("registry.provisionSuccess") });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("registry.provisionFailed"),
        variant: "destructive",
      });
    } finally {
      setProvisioning(false);
    }
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedRegistryIds([]);
      return;
    }
    setSelectedRegistryIds(selectableRegistry.map((row) => row.id));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedRegistryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const handleSaveMapping = async (externalCode: string) => {
    const courseId = mappingValues[externalCode];
    if (!courseId) {
      toast({ title: t("common.error"), description: t("registry.mappingCourseRequired"), variant: "destructive" });
      return;
    }

    setSavingMapping(externalCode);
    try {
      const { error } = await supabase.from("course_code_aliases").upsert(
        {
          external_code: externalCode,
          course_id: courseId,
          created_by: user?.id ?? null,
        },
        { onConflict: "external_code" },
      );
      if (error) throw error;

      const { error: applyError } = await supabase.rpc("apply_course_code_aliases");
      if (applyError) throw applyError;

      setMappingValues((current) => {
        const next = { ...current };
        delete next[externalCode];
        return next;
      });
      invalidateRegistry();
      toast({ title: t("common.success"), description: t("registry.mappingSaved") });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("registry.loadFailed"),
        variant: "destructive",
      });
    } finally {
      setSavingMapping(null);
    }
  };

  const handleRemoveMapping = async (externalCode: string) => {
    try {
      const { error } = await supabase
        .from("course_code_aliases")
        .delete()
        .eq("external_code", externalCode);
      if (error) throw error;
      invalidateRegistry();
      toast({ title: t("common.success"), description: t("registry.mappingRemoved") });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("registry.loadFailed"),
        variant: "destructive",
      });
    }
  };

  const handleDownloadCredentials = () => {
    const csv = buildCredentialsCsv(
      credentialRows.map((row) => ({
        university_id: row.university_id,
        full_name: row.full_name,
        email: row.email ?? "",
        password: row.password ?? "",
      })),
    );
    downloadFile("student-credentials.csv", csv);
  };

  const handleCopyCredentials = async () => {
    const text = credentialRows
      .map((row) => `${row.university_id}\t${row.full_name}\t${row.email ?? ""}\t${row.password ?? ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast({ title: t("common.success"), description: t("registry.credentialsCopied") });
  };

  const reconciliationStatusLabel = (status: string) => {
    if (status === "ok") return t("registry.statusOk");
    if (status === "not_provisioned") return t("registry.statusNotProvisioned");
    if (status === "missing_profile") return t("registry.statusMissingProfile");
    if (status === "name_mismatch") return t("registry.statusNameMismatch");
    if (status === "department_mismatch") return t("registry.statusDepartmentMismatch");
    if (status === "gender_mismatch") return t("registry.statusGenderMismatch");
    if (status === "programme_mismatch") return t("registry.statusProgrammeMismatch");
    return status;
  };

  const readinessStatusLabel = (status: string) => {
    if (status === "ready") return t("registry.readinessReady");
    if (status === "missing_avatar") return t("registry.readinessMissingAvatar");
    if (status === "missing_totp") return t("registry.readinessMissingTotp");
    if (status === "missing_registry") return t("registry.readinessMissingRegistry");
    if (status === "inactive") return t("registry.readinessInactive");
    return status;
  };

  const queryError =
    registryQuery.error ??
    departmentsQuery.error ??
    coursesQuery.error ??
    aliasesQuery.error ??
    unmappedQuery.error ??
    reconciliationQuery.error ??
    missingProfilesQuery.error ??
    readinessQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-['Space_Grotesk']">{t("registry.title")}</h1>
          <p className="text-muted-foreground">{t("registry.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={invalidateRegistry} disabled={registryQuery.isFetching}>
          {registryQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t("registry.refresh")}
        </Button>
      </div>

      {queryError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("registry.loadFailed")}</AlertTitle>
          <AlertDescription>
            {queryError instanceof Error ? queryError.message : String(queryError)}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="import">{t("registry.tabImport")}</TabsTrigger>
          <TabsTrigger value="registry">{t("registry.tabRegistry")}</TabsTrigger>
          <TabsTrigger value="mapping">{t("registry.tabMapping")}</TabsTrigger>
          <TabsTrigger value="reconciliation">{t("registry.tabReconciliation")}</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t("registry.tabImport")}
              </CardTitle>
              <CardDescription>{t("registry.fileHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="registry-file">{t("registry.chooseFile")}</Label>
                  <Input
                    id="registry-file"
                    type="file"
                    accept=".csv,.xlsx,.xls,.xlsm,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(event) => {
                      void handleFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => downloadFile("student-registry-template.csv", buildRegistryTemplateCsv())}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("registry.downloadTemplate")}
                </Button>
              </div>

              {parsing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("registry.parsing")}
                </div>
              )}

              {parseResult && (
                <div className="space-y-4">
                  {parseResult.missingRequiredColumns.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{t("registry.missingColumns", { columns: parseResult.missingRequiredColumns.join(", ") })}</AlertTitle>
                    </Alert>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Badge variant="secondary">
                      {t("registry.parsedSummary", { students: parseResult.students.length, rows: parseResult.students.reduce((sum, student) => sum + student.row_numbers.length, 0) })}
                    </Badge>
                    {parseResult.students.some((student) => student.errors.length > 0) && (
                      <Badge variant="destructive">
                        {t("registry.rowsWithErrors", { count: parseResult.students.filter((student) => student.errors.length > 0).length })}
                      </Badge>
                    )}
                  </div>

                  {parseResult.students.length === 0 ? (
                    <Alert>
                      <FileSpreadsheet className="h-4 w-4" />
                      <AlertDescription>{t("registry.noStudents")}</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="max-h-96 overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("registry.regNumber")}</TableHead>
                              <TableHead>{t("registry.name")}</TableHead>
                              <TableHead>{t("registry.programme")}</TableHead>
                              <TableHead>{t("registry.department")}</TableHead>
                              <TableHead>{t("registry.modules")}</TableHead>
                              <TableHead>{t("registry.rowErrors")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parseResult.students.slice(0, 50).map((student) => (
                              <TableRow key={student.university_id}>
                                <TableCell className="font-mono text-xs">{student.university_id}</TableCell>
                                <TableCell>{student.full_name || "—"}</TableCell>
                                <TableCell>{student.programme || "—"}</TableCell>
                                <TableCell>{student.department_raw || "—"}</TableCell>
                                <TableCell className="max-w-56 text-xs">{student.modules.join(", ") || "—"}</TableCell>
                                <TableCell className="max-w-64 text-xs text-destructive">
                                  {student.errors.join("; ") || "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {parseResult.students.length > 50 && (
                        <p className="text-xs text-muted-foreground">
                          {t("registry.preview")}: 50 / {parseResult.students.length}
                        </p>
                      )}
                    </>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      onClick={handleImport}
                      disabled={
                        importing ||
                        parseResult.students.length === 0 ||
                        parseResult.missingRequiredColumns.length > 0
                      }
                    >
                      {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {importing ? t("registry.importing") : t("registry.importToRegistry")}
                    </Button>
                    <p className="text-xs text-muted-foreground">{t("registry.importHint")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {importResults && (
            <Card>
              <CardHeader>
                <CardTitle>{t("registry.importResult")}</CardTitle>
                <CardDescription>
                  <span className="mr-3 text-emerald-600">{t("registry.importedCount", { count: importOk })}</span>
                  <span className="text-destructive">{t("registry.failedCount", { count: importFailed })}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("registry.regNumber")}</TableHead>
                        <TableHead>{t("registry.name")}</TableHead>
                        <TableHead>{t("registry.status")}</TableHead>
                        <TableHead>{t("registry.rowErrors")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResults.map((result) => (
                        <TableRow key={`${result.university_id}-${result.registry_id ?? result.error ?? "result"}`}>
                          <TableCell className="font-mono text-xs">{result.university_id}</TableCell>
                          <TableCell>{result.full_name || "—"}</TableCell>
                          <TableCell>
                            {result.ok ? (
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {t("registry.statusOk")}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                {t("registry.failedCount", { count: 1 })}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-96 text-xs">
                            {result.error && <span className="text-destructive">{result.error}</span>}
                            {result.existing_profile_found && (
                              <span className="text-emerald-600">{t("registry.existingProfileFound")}</span>
                            )}
                            {result.department_resolved === false && (
                              <span className="ml-2 text-amber-600">{t("registry.departmentUnresolved")}</span>
                            )}
                            {result.unmatched_modules && result.unmatched_modules.length > 0 && (
                              <span className="ml-2 text-amber-600">
                                {t("registry.unmatchedModules", { modules: result.unmatched_modules.join(", ") })}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("registry.tabRegistry")}</CardTitle>
              <CardDescription>{t("registry.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("registry.searchPlaceholder")}
                  className="lg:max-w-md"
                />
                <div className="flex flex-wrap gap-2 lg:ml-auto">
                  <Button
                    variant="outline"
                    onClick={() => handleProvision(selectedRegistryIds)}
                    disabled={selectedRegistryIds.length === 0 || provisioning}
                  >
                    {provisioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                    {t("registry.provisionSelected")} ({selectedRegistryIds.length})
                  </Button>
                  <Button
                    onClick={() => handleProvision(unprovisionedRows.map((row) => row.id))}
                    disabled={unprovisionedRows.length === 0 || provisioning}
                  >
                    {provisioning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {t("registry.provisionAll")} ({unprovisionedRows.length})
                  </Button>
                </div>
              </div>

              {provisioning && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("registry.provisioning")}
                </div>
              )}

              {registryQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : filteredRegistry.length === 0 ? (
                <Alert>
                  <FileSpreadsheet className="h-4 w-4" />
                  <AlertDescription>{t("registry.noRegistry")}</AlertDescription>
                </Alert>
              ) : (
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allSelectableSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label={t("registry.selectAll")}
                          />
                        </TableHead>
                        <TableHead>{t("registry.regNumber")}</TableHead>
                        <TableHead>{t("registry.name")}</TableHead>
                        <TableHead>{t("registry.programme")}</TableHead>
                        <TableHead>{t("registry.department")}</TableHead>
                        <TableHead>{t("registry.status")}</TableHead>
                        <TableHead>{t("registry.account")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRegistry.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRegistryIds.includes(row.id)}
                              disabled={Boolean(row.profile_id)}
                              onCheckedChange={() => toggleSelectOne(row.id)}
                              aria-label={row.university_id}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.university_id}</TableCell>
                          <TableCell>
                            <div className="font-medium">{row.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.admission_number ?? "—"}
                              {row.gender ? ` • ${row.gender}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>{row.programme ?? "—"}</TableCell>
                          <TableCell>
                            {row.department_id
                              ? departmentById.get(row.department_id)?.name ?? row.department_raw ?? "—"
                              : row.department_raw ?? t("registry.noDepartment")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={registryStatusVariant(row.status)}>{registryStatusLabel(row.status)}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              {row.profile_id ? (
                                <Badge variant="default">{t("registry.provisioned")}</Badge>
                              ) : (
                                <Badge variant="secondary">{t("registry.notProvisioned")}</Badge>
                              )}
                              {row.email_is_synthetic && <Badge variant="outline">{t("registry.syntheticEmail")}</Badge>}
                            </div>
                            <div className="mt-1 max-w-56 truncate text-xs text-muted-foreground">
                              {row.email ?? "—"}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {provisionResults && (
            <Card>
              <CardHeader>
                <CardTitle>{t("registry.credentialsTitle")}</CardTitle>
                <CardDescription>{t("registry.credentialsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="default">{t("registry.provisioned")}: {provisionOk}</Badge>
                  <Badge variant="secondary">{t("registry.linkedExisting")}: {provisionLinked}</Badge>
                  <Badge variant="destructive">{t("registry.failedCount", { count: provisionFailed })}</Badge>
                </div>

                {credentialRows.length === 0 ? (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>{t("registry.noCredentials")}</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handleDownloadCredentials}>
                        <Download className="mr-2 h-4 w-4" />
                        {t("registry.downloadCredentials")}
                      </Button>
                      <Button variant="outline" onClick={handleCopyCredentials}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t("registry.copyCredentials")}
                      </Button>
                    </div>
                    <div className="max-h-80 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("registry.regNumber")}</TableHead>
                            <TableHead>{t("registry.name")}</TableHead>
                            <TableHead>{t("auth.email")}</TableHead>
                            <TableHead>{t("admin.tempPassword")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {credentialRows.map((row) => (
                            <TableRow key={row.user_id ?? row.university_id}>
                              <TableCell className="font-mono text-xs">{row.university_id}</TableCell>
                              <TableCell>{row.full_name}</TableCell>
                              <TableCell className="text-xs">{row.email}</TableCell>
                              <TableCell className="font-mono text-xs">{row.password}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}

                {provisionResults.some((result) => !result.ok) && (
                  <div className="max-h-64 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("registry.regNumber")}</TableHead>
                          <TableHead>{t("registry.name")}</TableHead>
                          <TableHead>{t("registry.rowErrors")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {provisionResults
                          .filter((result) => !result.ok)
                          .map((result) => (
                            <TableRow key={`${result.university_id}-${result.error ?? "error"}`}>
                              <TableCell className="font-mono text-xs">{result.university_id}</TableCell>
                              <TableCell>{result.full_name}</TableCell>
                              <TableCell className="text-xs text-destructive">{result.error}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("registry.mappingTitle")}</CardTitle>
              <CardDescription>{t("registry.mappingDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {unmappedCodes.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{t("registry.noUnmapped")}</AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("registry.externalCode")}</TableHead>
                        <TableHead>{t("registry.occurrences")}</TableHead>
                        <TableHead>{t("registry.internalModule")}</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmappedCodes.map((code) => (
                        <TableRow key={code.external_code}>
                          <TableCell className="font-mono text-xs">{code.external_code}</TableCell>
                          <TableCell>{t("registry.occurrences", { count: code.count })}</TableCell>
                          <TableCell>
                            <Select
                              value={mappingValues[code.external_code] ?? ""}
                              onValueChange={(value) =>
                                setMappingValues((current) => ({ ...current, [code.external_code]: value }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t("registry.internalModule")} />
                              </SelectTrigger>
                              <SelectContent>
                                {courses.map((course) => (
                                  <SelectItem key={course.id} value={course.id}>
                                    {course.code} — {course.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => handleSaveMapping(code.external_code)}
                              disabled={savingMapping === code.external_code}
                            >
                              {savingMapping === code.external_code && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              {t("registry.saveMapping")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("registry.aliasesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {aliases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("registry.noUnmapped")}</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("registry.externalCode")}</TableHead>
                        <TableHead>{t("registry.internalModule")}</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aliases.map((alias) => {
                        const course = courseById.get(alias.course_id);
                        return (
                          <TableRow key={alias.external_code}>
                            <TableCell className="font-mono text-xs">{alias.external_code}</TableCell>
                            <TableCell>
                              {course ? `${course.code} — ${course.name}` : alias.course_id}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveMapping(alias.external_code)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("registry.removeMapping")}
                              </Button>
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
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("registry.readinessTitle")}</CardTitle>
              <CardDescription>{t("registry.readinessDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant={readinessIssues.length === 0 ? "default" : "secondary"}>
                {t("registry.readinessSummary", { ready: readinessReady, total: readinessRows.length })}
              </Badge>
              {readinessIssues.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{t("registry.readinessNoIssues")}</AlertDescription>
                </Alert>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("registry.regNumber")}</TableHead>
                        <TableHead>{t("registry.name")}</TableHead>
                        <TableHead>{t("registry.avatar")}</TableHead>
                        <TableHead>{t("registry.totp")}</TableHead>
                        <TableHead>{t("registry.registryStatus")}</TableHead>
                        <TableHead>{t("registry.readinessStatus")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {readinessIssues.map((row) => (
                        <TableRow key={row.profile_id}>
                          <TableCell className="font-mono text-xs">{row.university_id}</TableCell>
                          <TableCell>{row.full_name}</TableCell>
                          <TableCell>
                            <Badge variant={row.has_avatar ? "secondary" : "destructive"} className="text-[10px]">
                              {row.has_avatar ? t("registry.hasAvatar") : t("registry.missingAvatar")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.totp_enabled ? "secondary" : "destructive"} className="text-[10px]">
                              {row.totp_enabled ? t("registry.totpEnabled") : t("registry.totpMissing")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.registry_status ?? t("registry.registryMissing")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={readinessVariant(row.readiness_status)}>
                              {readinessStatusLabel(row.readiness_status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("registry.reconciliationTitle")}</CardTitle>
              <CardDescription>{t("registry.reconciliationDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {reconciliationIssues.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{t("registry.noReconciliation")}</AlertDescription>
                </Alert>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("registry.regNumber")}</TableHead>
                        <TableHead>{t("registry.registryName")}</TableHead>
                        <TableHead>{t("registry.profileName")}</TableHead>
                        <TableHead>{t("registry.programme")}</TableHead>
                        <TableHead>{t("registry.reconciliationStatus")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconciliationIssues.map((row) => (
                        <TableRow key={row.registry_id}>
                          <TableCell className="font-mono text-xs">{row.university_id}</TableCell>
                          <TableCell>{row.registry_name}</TableCell>
                          <TableCell>{row.profile_name ?? "—"}</TableCell>
                          <TableCell>
                            <div>{row.registry_programme ?? "—"}</div>
                            {row.profile_programme && row.profile_programme !== row.registry_programme && (
                              <div className="text-xs text-muted-foreground">{row.profile_programme}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={reconciliationVariant(row.status)}>
                              {reconciliationStatusLabel(row.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("registry.missingRegistryTitle")}</CardTitle>
              <CardDescription>{t("registry.missingRegistryDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {missingProfiles.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{t("registry.noMissingProfiles")}</AlertDescription>
                </Alert>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("registry.regNumber")}</TableHead>
                        <TableHead>{t("registry.name")}</TableHead>
                        <TableHead>{t("registry.programme")}</TableHead>
                        <TableHead>{t("registry.department")}</TableHead>
                        <TableHead>{t("auth.email")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingProfiles.map((profile) => (
                        <TableRow key={profile.id}>
                          <TableCell className="font-mono text-xs">{profile.university_id}</TableCell>
                          <TableCell>{profile.full_name}</TableCell>
                          <TableCell>{profile.programme ?? "—"}</TableCell>
                          <TableCell>
                            {profile.department_id
                              ? departmentById.get(profile.department_id)?.name ?? "—"
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{profile.email ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
