// Admin-only import of the college student roster into student_registry.
//
// The client parses CSV into grouped student rows, but the server re-validates
// every field. Existing profiles are linked by registration number; mismatches
// are left for the reconciliation screen instead of being overwritten.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";

type RegistryGender = "M" | "F";
type RegistryStatus = "active" | "suspended" | "graduated" | "inactive";

interface IncomingStudent {
  university_id?: unknown;
  admission_number?: unknown;
  full_name?: unknown;
  email?: unknown;
  gender?: unknown;
  department_raw?: unknown;
  programme?: unknown;
  study_year?: unknown;
  semester?: unknown;
  academic_year?: unknown;
  phone?: unknown;
  status?: unknown;
  modules?: unknown;
}

interface NormalizedStudent {
  university_id: string;
  admission_number: string | null;
  full_name: string;
  email: string | null;
  gender: RegistryGender | null;
  department_raw: string | null;
  programme: string | null;
  study_year: number | null;
  semester: string | null;
  academic_year: string | null;
  phone: string | null;
  status: RegistryStatus;
  modules: string[];
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText.length > 0 ? valueText : null;
}

function normalizeGender(value: unknown): RegistryGender | null {
  const normalized = text(value).toLowerCase();
  if (["m", "male", "me", "mwanaume", "mume"].includes(normalized)) return "M";
  if (["f", "female", "ke", "mwanamke", "mke"].includes(normalized)) return "F";
  return null;
}

function normalizeStatus(value: unknown): RegistryStatus {
  const normalized = text(value).toLowerCase();
  if (["suspended", "susp", "amesimamishwa"].includes(normalized)) return "suspended";
  if (["graduated", "graduate", "alumni", "amehitimu"].includes(normalized)) return "graduated";
  if (["inactive", "hayupo"].includes(normalized)) return "inactive";
  return "active";
}

function normalizeModules(value: unknown): string[] {
  const modules = Array.isArray(value)
    ? value.map((module) => text(module))
    : text(value).split(/[;,|/\n]+/);
  return Array.from(
    new Set(
      modules
        .map((module) => module.trim().toUpperCase())
        .filter((module) => module.length > 0),
    ),
  );
}

function normalizeStudent(raw: IncomingStudent): NormalizedStudent {
  const studyYearRaw = raw.study_year;
  const studyYear =
    typeof studyYearRaw === "number"
      ? studyYearRaw
      : Number.parseInt(text(studyYearRaw).match(/\d+/)?.[0] ?? "", 10);

  return {
    university_id: text(raw.university_id),
    admission_number: nullableText(raw.admission_number),
    full_name: text(raw.full_name),
    email: nullableText(raw.email)?.toLowerCase() ?? null,
    gender: normalizeGender(raw.gender),
    department_raw: nullableText(raw.department_raw),
    programme: nullableText(raw.programme),
    study_year: Number.isFinite(studyYear) && studyYear > 0 ? studyYear : null,
    semester: nullableText(raw.semester),
    academic_year: nullableText(raw.academic_year),
    phone: nullableText(raw.phone),
    status: normalizeStatus(raw.status),
    modules: normalizeModules(raw.modules),
  };
}

function isEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

function validateStudent(student: NormalizedStudent): string | null {
  if (student.university_id.length < 2) return "registration number is required";
  if (student.full_name.length < 2) return "full name is required";
  if (!student.programme) return "course/programme is required";
  if (!student.department_raw) return "department is required";
  if (student.email && !isEmail(student.email)) return "invalid email";
  if (student.gender && !["M", "F"].includes(student.gender)) return "invalid gender";
  return null;
}

async function getRole(adminClient: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data || data.length === 0) return null;
  if (data.some((row) => row.role === "admin")) return "admin";
  if (data.some((row) => row.role === "lecturer")) return "lecturer";
  return (data[0]?.role as string | undefined) ?? null;
}

async function profilesByUniversityId(
  adminClient: SupabaseClient,
  universityIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < universityIds.length; i += 200) {
    const chunk = universityIds.slice(i, i + 200);
    const { data } = await adminClient
      .from("profiles")
      .select("id, university_id, full_name, email, department_id, programme, gender")
      .in("university_id", chunk);
    for (const profile of data ?? []) {
      map.set(String(profile.university_id).toLowerCase(), profile as Record<string, unknown>);
    }
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  if ((await getRole(adminClient, userRes.user.id)) !== "admin") {
    return jsonResponse(req, { error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return jsonResponse(req, { error: "rows are required" }, 400);
  }
  if (rows.length > 500) {
    return jsonResponse(req, { error: "maximum 500 students per import" }, 400);
  }
  const dryRun = body.dry_run === true;

  const students = rows.map((row) => normalizeStudent((row ?? {}) as IncomingStudent));
  const validStudents = students.filter((student) => !validateStudent(student));
  const universityIds = validStudents.map((student) => student.university_id);

  const { data: departments } = await adminClient
    .from("departments")
    .select("id, name, code");
  const departmentByKey = new Map<string, string>();
  for (const department of departments ?? []) {
    departmentByKey.set(String(department.name).trim().toLowerCase(), String(department.id));
    departmentByKey.set(String(department.code).trim().toLowerCase(), String(department.id));
  }

  const { data: courses } = await adminClient
    .from("courses")
    .select("id, code");
  const aliasByCode = new Map<string, string>();
  for (const course of courses ?? []) {
    aliasByCode.set(String(course.code).toUpperCase(), String(course.id));
  }

  const { data: aliases } = await adminClient
    .from("course_code_aliases")
    .select("external_code, course_id");
  for (const alias of aliases ?? []) {
    aliasByCode.set(String(alias.external_code).toUpperCase(), String(alias.course_id));
  }

  const existingProfiles = await profilesByUniversityId(adminClient, universityIds);
  const results: Array<Record<string, unknown>> = [];

  for (let index = 0; index < students.length; index++) {
    const student = students[index];
    const validationError = validateStudent(student);
    if (validationError) {
      results.push({
        ok: false,
        university_id: student.university_id,
        full_name: student.full_name,
        error: validationError,
      });
      continue;
    }

    const departmentId = student.department_raw
      ? departmentByKey.get(student.department_raw.toLowerCase()) ?? null
      : null;
    const unmatchedModules = student.modules.filter((module) => !aliasByCode.has(module));
    const existingProfileFound = Boolean(
      existingProfiles.get(student.university_id.toLowerCase())?.id,
    );

    if (dryRun) {
      results.push({
        ok: true,
        dry_run: true,
        university_id: student.university_id,
        full_name: student.full_name,
        registry_id: null,
        existing_profile_found: existingProfileFound,
        department_resolved: Boolean(departmentId),
        department_raw: student.department_raw,
        unmatched_modules: unmatchedModules,
      });
      continue;
    }

    const payload: Record<string, unknown> = {
      university_id: student.university_id,
      full_name: student.full_name,
      department_id: departmentId,
      department_raw: student.department_raw,
      programme: student.programme,
      status: student.status,
      source: "csv",
      last_synced_at: new Date().toISOString(),
    };
    if (student.admission_number) payload.admission_number = student.admission_number;
    if (student.email) payload.email = student.email;
    if (student.gender) payload.gender = student.gender;
    if (student.study_year) payload.study_year = student.study_year;
    if (student.semester) payload.semester = student.semester;
    if (student.academic_year) payload.academic_year = student.academic_year;
    if (student.phone) payload.phone = student.phone;

    const { data: registryRow, error: upsertError } = await adminClient
      .from("student_registry")
      .upsert(payload, { onConflict: "university_id" })
      .select("id, profile_id")
      .single();

    if (upsertError || !registryRow) {
      results.push({
        ok: false,
        university_id: student.university_id,
        full_name: student.full_name,
        error: upsertError?.message ?? "registry upsert failed",
      });
      continue;
    }

    const registryId = String(registryRow.id);
    const linkedProfileId = registryRow.profile_id ? String(registryRow.profile_id) : null;

    if (student.modules.length > 0) {
      const enrollmentRows = student.modules.map((module) => {
        const courseId = aliasByCode.get(module) ?? null;
        return {
          registry_id: registryId,
          external_code: module,
          course_id: courseId,
          mapping_status: courseId ? "mapped" : "unmapped",
          semester: student.semester,
          academic_year: student.academic_year,
        };
      });
      const { error: enrollmentError } = await adminClient
        .from("student_registry_enrollments")
        .upsert(enrollmentRows, { onConflict: "registry_id,external_code" });
      if (enrollmentError) {
        results.push({
          ok: false,
          university_id: student.university_id,
          full_name: student.full_name,
          error: enrollmentError.message,
        });
        continue;
      }

      if (linkedProfileId) {
        const courseIds = Array.from(
          new Set(
            enrollmentRows
              .map((row) => row.course_id)
              .filter((courseId): courseId is string => Boolean(courseId)),
          ),
        );
        if (courseIds.length > 0) {
          const { error: courseEnrollmentError } = await adminClient
            .from("course_enrollments")
            .upsert(
              courseIds.map((courseId) => ({ course_id: courseId, user_id: linkedProfileId })),
              { onConflict: "course_id,user_id", ignoreDuplicates: true },
            );
          if (courseEnrollmentError) {
            results.push({
              ok: false,
              university_id: student.university_id,
              full_name: student.full_name,
              error: courseEnrollmentError.message,
            });
            continue;
          }
        }
      }
    }

    results.push({
      ok: true,
      university_id: student.university_id,
      full_name: student.full_name,
      registry_id: registryId,
      existing_profile_found: Boolean(linkedProfileId || existingProfileFound),
      department_resolved: Boolean(departmentId),
      department_raw: student.department_raw,
      unmatched_modules: unmatchedModules,
    });
  }

  const okCount = results.filter((result) => result.ok).length;
  return jsonResponse(req, {
    ok: true,
    dry_run: dryRun,
    imported: okCount,
    failed: results.length - okCount,
    results,
  });
});
