// Admin-only edge function for managing app users.
//
// Actions:
//   create          - create a student/lecturer/admin account
//   update          - update profile fields, email, department and role
//   delete          - delete an auth user (with course/session reassignment)
//   reset_password  - set a new temporary password and force a change
//   reset_totp      - clear a user's authenticator so they can set it up again
//   bulk_create     - create many student accounts (optionally enrolling them)
//
// Every action verifies that the caller is authenticated AND has the admin role.
// Guard rails: an admin cannot remove/demote themselves or the last admin.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";

type Role = "admin" | "lecturer" | "student";

const ROLES: Role[] = ["admin", "lecturer", "student"];

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
  const pick = (set: string, b: number) => set[b % set.length];
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

function passwordError(password: string): string | null {
  if (password.length < 12) return "password must be at least 12 characters";
  if (!/[A-Z]/.test(password)) return "password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "password must contain a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "password must contain a symbol";
  return null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown): string | null {
  const s = normalizeString(value);
  return s.length > 0 ? s : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface CreateInput {
  role: Role;
  full_name: string;
  university_id: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  department_id?: string | null;
  academic_year?: string | null;
  study_year?: number | null;
  password?: string;
  course_id?: string | null;
}

function validateCreateInput(raw: Record<string, unknown>): string | null {
  const role = normalizeString(raw.role) as Role;
  if (!ROLES.includes(role)) return "invalid role";
  if (normalizeString(raw.full_name).length < 2) return "full name is required";
  if (normalizeString(raw.university_id).length < 3) return "university ID is required";
  const email = normalizeString(raw.email).toLowerCase();
  if (!email || !isEmail(email)) return "a valid email is required";
  const gender = optionalString(raw.gender);
  if (gender && !["M", "F"].includes(gender)) return "gender must be M or F";
  if (role === "student" && !optionalString(raw.department_id)) {
    return "department is required for students";
  }
  if (raw.password !== undefined && raw.password !== null && raw.password !== "") {
    const err = passwordError(String(raw.password));
    if (err) return err;
  }
  if (raw.study_year !== undefined && raw.study_year !== null && raw.study_year !== "") {
    const n = Number(raw.study_year);
    if (!Number.isFinite(n)) return "study year must be a number";
  }
  return null;
}

async function getRole(adminClient: SupabaseClient, userId: string): Promise<Role | null> {
  const { data } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data || data.length === 0) return null;
  if (data.some((row) => row.role === "admin")) return "admin";
  if (data.some((row) => row.role === "lecturer")) return "lecturer";
  return (data[0]?.role as Role | undefined) ?? null;
}

async function isLastAdmin(adminClient: SupabaseClient, userId: string): Promise<boolean> {
  if ((await getRole(adminClient, userId)) !== "admin") return false;
  const { count, error } = await adminClient
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return (count ?? 0) <= 1;
}

async function createOneUser(
  adminClient: SupabaseClient,
  input: CreateInput,
): Promise<{ user_id: string; email: string; password: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password?.trim() || randomPassword();
  const pwErr = passwordError(password);
  if (pwErr) throw new Error(pwErr);

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name.trim(),
      university_id: input.university_id.trim(),
      role: input.role,
      department_id: input.department_id ?? null,
      phone: input.phone ?? null,
      gender: input.gender ?? null,
      academic_year: input.academic_year ?? null,
      study_year: input.study_year ?? null,
    },
  });
  if (createErr || !created.user) throw new Error(createErr?.message ?? "create failed");

  const userId = created.user.id;
  try {
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role: input.role }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);

    const { error: deleteRolesErr } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .neq("role", input.role);
    if (deleteRolesErr) throw new Error(deleteRolesErr.message);

    const { error: profileErr } = await adminClient
      .from("profiles")
      .update({
        full_name: input.full_name.trim(),
        university_id: input.university_id.trim(),
        email,
        phone: input.phone ?? null,
        gender: input.gender ?? null,
        department_id: input.department_id ?? null,
        academic_year: input.academic_year ?? null,
        study_year: input.study_year ?? null,
        must_change_password: true,
      })
      .eq("id", userId);
    if (profileErr) throw new Error(profileErr.message);

    if (input.course_id) {
      const { error: enrollErr } = await adminClient
        .from("course_enrollments")
        .insert({ user_id: userId, course_id: input.course_id });
      if (enrollErr && enrollErr.code !== "23505") throw new Error(enrollErr.message);
    }

    return { user_id: userId, email, password };
  } catch (err) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }
  const callerId = userRes.user.id;

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

  if ((await getRole(adminClient, callerId)) !== "admin") {
    return jsonResponse(req, { error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }

  const action = normalizeString(body.action);

  try {
    if (action === "create") {
      const vErr = validateCreateInput(body);
      if (vErr) return jsonResponse(req, { error: vErr }, 400);
      const input: CreateInput = {
        role: normalizeString(body.role) as Role,
        full_name: normalizeString(body.full_name),
        university_id: normalizeString(body.university_id),
        email: normalizeString(body.email).toLowerCase(),
        phone: optionalString(body.phone),
        gender: optionalString(body.gender),
        department_id: optionalString(body.department_id),
        academic_year: optionalString(body.academic_year),
        study_year: optionalNumber(body.study_year),
        password: optionalString(body.password) ?? undefined,
        course_id: optionalString(body.course_id),
      };
      const result = await createOneUser(adminClient, input);
      return jsonResponse(req, { ok: true, ...result, role: input.role });
    }

    if (action === "update") {
      const userId = normalizeString(body.user_id);
      if (!userId) return jsonResponse(req, { error: "user_id is required" }, 400);

      const { data: target, error: targetErr } = await adminClient.auth.admin.getUserById(userId);
      if (targetErr || !target?.user) {
        return jsonResponse(req, { error: targetErr?.message ?? "user_not_found" }, 404);
      }

      const currentRole = await getRole(adminClient, userId);
      const newRole = optionalString(body.role) as Role | null;
      if (newRole && !ROLES.includes(newRole)) {
        return jsonResponse(req, { error: "invalid role" }, 400);
      }

      if (newRole && newRole !== currentRole) {
        if (userId === callerId) {
          return jsonResponse(req, { error: "you cannot change your own role" }, 400);
        }
        if (currentRole === "admin" && newRole !== "admin") {
          if (await isLastAdmin(adminClient, userId)) {
            return jsonResponse(req, { error: "you cannot remove the last admin" }, 400);
          }
        }

        const { error: roleErr } = await adminClient
          .from("user_roles")
          .upsert({ user_id: userId, role: newRole }, { onConflict: "user_id,role" });
        if (roleErr) return jsonResponse(req, { error: roleErr.message }, 400);

        const { error: deleteRolesErr } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .neq("role", newRole);
        if (deleteRolesErr) return jsonResponse(req, { error: deleteRolesErr.message }, 400);

        if (newRole !== "lecturer") {
          await adminClient.from("course_lecturers").delete().eq("lecturer_id", userId);
        }
        if (newRole !== "student") {
          await adminClient.from("course_enrollments").delete().eq("user_id", userId);
        }
      }

      const email = optionalString(body.email)?.toLowerCase() ?? null;
      if (email && !isEmail(email)) {
        return jsonResponse(req, { error: "a valid email is required" }, 400);
      }

      const profileUpdate: Record<string, unknown> = {};
      if (body.full_name !== undefined) profileUpdate.full_name = normalizeString(body.full_name);
      if (body.university_id !== undefined) profileUpdate.university_id = normalizeString(body.university_id);
      if (email) profileUpdate.email = email;
      if (body.phone !== undefined) profileUpdate.phone = optionalString(body.phone);
      if (body.gender !== undefined) profileUpdate.gender = optionalString(body.gender);
      if (body.department_id !== undefined) profileUpdate.department_id = optionalString(body.department_id);
      if (body.academic_year !== undefined) profileUpdate.academic_year = optionalString(body.academic_year);
      if (body.study_year !== undefined) profileUpdate.study_year = optionalNumber(body.study_year);

      if (email && email !== target.user.email) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, {
          email,
          email_confirm: true,
        });
        if (authErr) return jsonResponse(req, { error: authErr.message }, 400);
      }

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileErr } = await adminClient
          .from("profiles")
          .update(profileUpdate)
          .eq("id", userId);
        if (profileErr) return jsonResponse(req, { error: profileErr.message }, 400);
      }

      const metadata = {
        ...(target.user.user_metadata ?? {}),
        full_name: profileUpdate.full_name ?? target.user.user_metadata?.full_name,
        university_id: profileUpdate.university_id ?? target.user.user_metadata?.university_id,
        role: newRole ?? currentRole ?? target.user.user_metadata?.role,
        department_id: profileUpdate.department_id ?? target.user.user_metadata?.department_id,
        phone: profileUpdate.phone ?? target.user.user_metadata?.phone,
        gender: profileUpdate.gender ?? target.user.user_metadata?.gender,
        academic_year: profileUpdate.academic_year ?? target.user.user_metadata?.academic_year,
        study_year: profileUpdate.study_year ?? target.user.user_metadata?.study_year,
      };
      await adminClient.auth.admin.updateUserById(userId, { user_metadata: metadata });

      return jsonResponse(req, { ok: true, user_id: userId, role: newRole ?? currentRole });
    }

    if (action === "delete") {
      const userId = normalizeString(body.user_id);
      if (!userId) return jsonResponse(req, { error: "user_id is required" }, 400);
      if (userId === callerId) {
        return jsonResponse(req, { error: "you cannot delete your own account" }, 400);
      }
      if (await isLastAdmin(adminClient, userId)) {
        return jsonResponse(req, { error: "you cannot remove the last admin" }, 400);
      }

      const { error: courseErr } = await adminClient
        .from("courses")
        .update({ created_by: callerId })
        .eq("created_by", userId);
      if (courseErr) return jsonResponse(req, { error: courseErr.message }, 400);

      const { error: sessionErr } = await adminClient
        .from("sessions")
        .update({ created_by: callerId })
        .eq("created_by", userId);
      if (sessionErr) return jsonResponse(req, { error: sessionErr.message }, 400);

      await adminClient.from("notifications").delete().eq("user_id", userId);

      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteErr) return jsonResponse(req, { error: deleteErr.message }, 400);

      return jsonResponse(req, { ok: true, user_id: userId });
    }

    if (action === "reset_password") {
      const userId = normalizeString(body.user_id);
      if (!userId) return jsonResponse(req, { error: "user_id is required" }, 400);

      const password = optionalString(body.password) ?? randomPassword();
      const pwErr = passwordError(password);
      if (pwErr) return jsonResponse(req, { error: pwErr }, 400);

      const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (authErr) return jsonResponse(req, { error: authErr.message }, 400);

      await adminClient
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", userId);

      return jsonResponse(req, { ok: true, user_id: userId, password });
    }

    if (action === "reset_totp") {
      const userId = normalizeString(body.user_id);
      if (!userId) return jsonResponse(req, { error: "user_id is required" }, 400);

      const { error: totpErr } = await adminClient
        .from("user_totp_secrets")
        .delete()
        .eq("user_id", userId);
      if (totpErr) return jsonResponse(req, { error: totpErr.message }, 400);

      return jsonResponse(req, { ok: true, user_id: userId });
    }

    if (action === "bulk_create") {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return jsonResponse(req, { error: "rows are required" }, 400);
      }
      if (rows.length > 100) {
        return jsonResponse(req, { error: "maximum 100 rows per import" }, 400);
      }

      const results: Array<Record<string, unknown>> = [];
      for (const rawRow of rows) {
        const row = (rawRow ?? {}) as Record<string, unknown>;
        const identifiers = {
          full_name: normalizeString(row.full_name),
          university_id: normalizeString(row.university_id),
          email: normalizeString(row.email).toLowerCase(),
        };
        const vErr = validateCreateInput({ ...row, role: "student" });
        if (vErr) {
          results.push({ ok: false, ...identifiers, error: vErr });
          continue;
        }
        const input: CreateInput = {
          role: "student",
          full_name: identifiers.full_name,
          university_id: identifiers.university_id,
          email: identifiers.email,
          phone: optionalString(row.phone),
          gender: optionalString(row.gender),
          department_id: optionalString(row.department_id),
          academic_year: optionalString(row.academic_year),
          study_year: optionalNumber(row.study_year),
          password: optionalString(row.password) ?? undefined,
          course_id: optionalString(row.course_id),
        };
        try {
          const result = await createOneUser(adminClient, input);
          results.push({ ok: true, ...identifiers, ...result });
        } catch (err) {
          results.push({ ok: false, ...identifiers, error: err instanceof Error ? err.message : "create failed" });
        }
      }

      return jsonResponse(req, {
        ok: true,
        results,
        created: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      });
    }

    return jsonResponse(req, { error: "unknown action" }, 400);
  } catch (err) {
    return jsonResponse(req, { error: err instanceof Error ? err.message : "unexpected error" }, 500);
  }
});
