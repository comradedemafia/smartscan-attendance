// Admin-only provisioning of student accounts from student_registry.
//
// Accounts are created with a temporary password and must_change_password.
// When the CSV has no email, a synthetic login email is generated. The
// registration number remains the student-facing login identifier.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";

interface RegistryRow {
  id: string;
  university_id: string;
  admission_number: string | null;
  full_name: string;
  email: string | null;
  email_is_synthetic: boolean;
  gender: string | null;
  department_id: string | null;
  programme: string | null;
  study_year: number | null;
  semester: string | null;
  academic_year: string | null;
  phone: string | null;
  profile_id: string | null;
  status: string;
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function randomPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*?";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const pick = (set: string, byte: number) => set[byte % set.length];
  const chars = [
    pick(upper, bytes[0]),
    pick(lower, bytes[1]),
    pick(digits, bytes[2]),
    pick(symbols, bytes[3]),
  ];
  for (let i = 4; i < length; i++) chars.push(pick(all, bytes[i]));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function isEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

function syntheticEmail(universityId: string, registryId: string): string {
  const local =
    universityId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") || "student";
  return `${local}.${registryId.slice(0, 8)}@students.smartscan.app`;
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

async function enrollModules(
  adminClient: SupabaseClient,
  registryId: string,
  userId: string,
): Promise<{ enrolled: number; errors: string[] }> {
  const { data: registryEnrollments, error: readError } = await adminClient
    .from("student_registry_enrollments")
    .select("course_id")
    .eq("registry_id", registryId)
    .not("course_id", "is", null);

  if (readError) return { enrolled: 0, errors: [readError.message] };

  let enrolled = 0;
  const errors: string[] = [];
  for (const row of registryEnrollments ?? []) {
    if (!row.course_id) continue;
    const { error } = await adminClient
      .from("course_enrollments")
      .insert({ user_id: userId, course_id: row.course_id });
    if (!error) enrolled++;
    else if (error.code !== "23505") errors.push(error.message);
  }
  return { enrolled, errors };
}

async function linkRegistry(
  adminClient: SupabaseClient,
  registryId: string,
  userId: string,
  email: string,
  emailIsSynthetic: boolean,
): Promise<string | null> {
  const { error } = await adminClient
    .from("student_registry")
    .update({
      profile_id: userId,
      provisioned_at: new Date().toISOString(),
      email,
      email_is_synthetic: emailIsSynthetic,
    })
    .eq("id", registryId);
  return error?.message ?? null;
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

  const registryIds = Array.isArray(body.registry_ids)
    ? body.registry_ids.map((id) => String(id)).filter(Boolean)
    : [];
  const allUnprovisioned = body.all_unprovisioned === true;

  if (!allUnprovisioned && registryIds.length === 0) {
    return jsonResponse(req, { error: "registry_ids are required" }, 400);
  }
  if (registryIds.length > 100) {
    return jsonResponse(req, { error: "maximum 100 students per batch" }, 400);
  }

  let query = adminClient
    .from("student_registry")
    .select(
      "id, university_id, admission_number, full_name, email, email_is_synthetic, gender, department_id, programme, study_year, semester, academic_year, phone, profile_id, status",
    )
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(100);

  if (!allUnprovisioned) {
    query = query.in("id", registryIds);
  } else {
    query = query.is("profile_id", null);
  }

  const { data: registryRows, error: registryError } = await query;
  if (registryError) {
    return jsonResponse(req, { error: registryError.message }, 500);
  }
  if (!registryRows || registryRows.length === 0) {
    return jsonResponse(req, { ok: true, provisioned: 0, linked: 0, failed: 0, results: [] });
  }

  const universityIds = registryRows.map((row) => String(row.university_id));
  const { data: existingProfiles } = await adminClient
    .from("profiles")
    .select(
      "id, university_id, email, admission_number, department_id, programme, gender, phone, academic_year, study_year",
    )
    .in("university_id", universityIds);
  const profileByUniversityId = new Map<string, Record<string, unknown>>();
  for (const profile of existingProfiles ?? []) {
    profileByUniversityId.set(String(profile.university_id).toLowerCase(), profile as Record<string, unknown>);
  }

  const results: Array<Record<string, unknown>> = [];
  let provisioned = 0;
  let linked = 0;
  let failed = 0;

  for (const rawRow of registryRows as RegistryRow[]) {
    const registry = rawRow;

    if (registry.profile_id) {
      results.push({
        ok: true,
        already_provisioned: true,
        university_id: registry.university_id,
        full_name: registry.full_name,
        user_id: registry.profile_id,
      });
      continue;
    }

    if (!registry.department_id) {
      failed++;
      results.push({
        ok: false,
        university_id: registry.university_id,
        full_name: registry.full_name,
        error: "department is not mapped",
      });
      continue;
    }

    const existing = profileByUniversityId.get(registry.university_id.toLowerCase());
    if (existing?.id) {
      const userId = String(existing.id);
      const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
      if (authUserError || !authUser?.user) {
        failed++;
        results.push({
          ok: false,
          university_id: registry.university_id,
          full_name: registry.full_name,
          error: authUserError?.message ?? "existing auth user not found",
        });
        continue;
      }

      const authEmail = String(authUser.user.email ?? "").trim().toLowerCase();
      const registryEmail = registry.email && isEmail(registry.email) ? registry.email.toLowerCase() : null;
      const email = authEmail || registryEmail || syntheticEmail(registry.university_id, registry.id);
      const emailIsSynthetic = email.endsWith("@students.smartscan.app");

      if (!authEmail) {
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
          email,
          email_confirm: true,
        });
        if (authUpdateError) {
          failed++;
          results.push({
            ok: false,
            university_id: registry.university_id,
            full_name: registry.full_name,
            error: authUpdateError.message,
          });
          continue;
        }
      }

      const profileUpdate: Record<string, unknown> = { email };
      if (!existing.admission_number) profileUpdate.admission_number = registry.admission_number;
      if (!existing.department_id) profileUpdate.department_id = registry.department_id;
      if (!existing.programme) profileUpdate.programme = registry.programme;
      if (!existing.gender) profileUpdate.gender = registry.gender;
      if (!existing.phone) profileUpdate.phone = registry.phone;
      if (!existing.academic_year) profileUpdate.academic_year = registry.academic_year;
      if (!existing.study_year) profileUpdate.study_year = registry.study_year;

      const { error: profileError } = await adminClient
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);
      if (profileError) {
        failed++;
        results.push({
          ok: false,
          university_id: registry.university_id,
          full_name: registry.full_name,
          error: profileError.message,
        });
        continue;
      }

      const linkError = await linkRegistry(adminClient, registry.id, userId, email, emailIsSynthetic);
      if (linkError) {
        failed++;
        results.push({
          ok: false,
          university_id: registry.university_id,
          full_name: registry.full_name,
          error: linkError,
        });
        continue;
      }
      const enrollment = await enrollModules(adminClient, registry.id, userId);
      linked++;
      results.push({
        ok: true,
        linked_existing: true,
        university_id: registry.university_id,
        full_name: registry.full_name,
        user_id: userId,
        email,
        email_is_synthetic: emailIsSynthetic,
        password: null,
        enrolled_modules: enrollment.enrolled,
        enrollment_errors: enrollment.errors,
      });
      continue;
    }

    const realEmail = registry.email && isEmail(registry.email) ? registry.email.toLowerCase() : null;
    const email = realEmail ?? syntheticEmail(registry.university_id, registry.id);
    const emailIsSynthetic = !realEmail;
    const password = randomPassword();

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: registry.full_name,
        university_id: registry.university_id,
        admission_number: registry.admission_number,
        role: "student",
        department_id: registry.department_id,
        programme: registry.programme,
        phone: registry.phone,
        gender: registry.gender,
        academic_year: registry.academic_year,
        study_year: registry.study_year,
      },
    });

    if (createError || !created.user) {
      failed++;
      results.push({
        ok: false,
        university_id: registry.university_id,
        full_name: registry.full_name,
        error: createError?.message ?? "failed to create account",
      });
      continue;
    }

    const userId = created.user.id;

    try {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: userId, role: "student" }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);

      const { error: profileError } = await adminClient
        .from("profiles")
        .update({
          full_name: registry.full_name,
          university_id: registry.university_id,
          admission_number: registry.admission_number,
          email,
          phone: registry.phone,
          gender: registry.gender,
          department_id: registry.department_id,
          programme: registry.programme,
          academic_year: registry.academic_year,
          study_year: registry.study_year,
          must_change_password: true,
        })
        .eq("id", userId);
      if (profileError) throw new Error(profileError.message);

      const linkError = await linkRegistry(adminClient, registry.id, userId, email, emailIsSynthetic);
      if (linkError) throw new Error(linkError);

      const enrollment = await enrollModules(adminClient, registry.id, userId);

      provisioned++;
      results.push({
        ok: true,
        university_id: registry.university_id,
        full_name: registry.full_name,
        user_id: userId,
        email,
        email_is_synthetic: emailIsSynthetic,
        password,
        enrolled_modules: enrollment.enrolled,
        enrollment_errors: enrollment.errors,
      });
    } catch (err) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      failed++;
      results.push({
        ok: false,
        university_id: registry.university_id,
        full_name: registry.full_name,
        error: err instanceof Error ? err.message : "provisioning failed",
      });
    }
  }

  return jsonResponse(req, {
    ok: true,
    provisioned,
    linked,
    failed,
    results,
  });
});
