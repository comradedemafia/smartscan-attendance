// Admin-only edge function: creates a lecturer account.
// - Verifies caller is authenticated AND has the 'admin' role.
// - Creates auth user (email confirmed) with a one-time password.
// - Inserts profile fields and assigns 'lecturer' role.
// - Marks must_change_password=true so the lecturer is forced to change password on first login.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

interface Payload {
  full_name: string;
  university_id: string;
  email: string;
  phone?: string;
  gender?: "M" | "F";
  department_id?: string;
  level_id?: string;
  password: string;
}

function validate(p: Partial<Payload>): string | null {
  if (!p.full_name || p.full_name.trim().length < 2) return "full_name required";
  if (!p.university_id || p.university_id.trim().length < 3) return "university_id required";
  if (!p.email || !/^\S+@\S+\.\S+$/.test(p.email)) return "valid email required";
  if (!p.password || p.password.length < 12) return "password must be >= 12 chars";
  if (p.gender && !["M", "F"].includes(p.gender)) return "gender must be M or F";
  return null;
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

  // Verify caller identity using anon key + their JWT
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }
  const callerId = userRes.user.id;

  // Admin client (service role) for privileged checks + writes
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

  // Confirm caller is admin
  const { data: roleRow, error: roleErr } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleErr || !roleRow) {
    return jsonResponse(req, { error: "forbidden" }, 403);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }

  const vErr = validate(payload);
  if (vErr) return jsonResponse(req, { error: vErr }, 400);

  // Create the auth user (email pre-confirmed so they can sign in immediately)
  const { data: created, error: createErr } = await adminClient.auth.admin
    .createUser({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.full_name,
        university_id: payload.university_id,
        role: "lecturer",
      },
    });
  if (createErr || !created.user) {
    return jsonResponse(req, { error: createErr?.message ?? "create_failed" }, 400);
  }

  const newUserId = created.user.id;

  // The handle_new_user trigger created a profile + role row.
  // Force role to lecturer (trigger downgrades non-student/lecturer self-signups
  // to student, but lecturer self-registration is now disabled, so we re-assert).
  await adminClient.from("user_roles").delete().eq("user_id", newUserId);
  await adminClient
    .from("user_roles")
    .insert({ user_id: newUserId, role: "lecturer" });

  // Update profile with admin-supplied fields and the must-change-password flag
  const { error: profileErr } = await adminClient
    .from("profiles")
    .update({
      full_name: payload.full_name,
      university_id: payload.university_id,
      email: payload.email.trim().toLowerCase(),
      phone: payload.phone ?? null,
      gender: payload.gender ?? null,
      department_id: payload.department_id ?? null,
      must_change_password: true,
    })
    .eq("id", newUserId);
  if (profileErr) {
    return jsonResponse(
      req,
      { error: `profile_update_failed: ${profileErr.message}` },
      400,
    );
  }

  return jsonResponse(req, {
    ok: true,
    user_id: newUserId,
    email: payload.email,
    university_id: payload.university_id,
  });
});