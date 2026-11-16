import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";

const PASSWORD_POLICY =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!token) {
    return json(req, { error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  const userClient = createClient(supabaseUrl, anonKey, authOptions);
  const { data: userRes, error: userError } =
    await userClient.auth.getUser(token);
  if (userError || !userRes?.user) {
    return json(req, { error: "unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceKey, authOptions);
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("must_change_password")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("profile lookup failed", profileError.message);
    return json(req, { error: "profile_lookup_failed" }, 500);
  }
  if (!profile?.must_change_password) {
    return json(req, { error: "not_required" }, 403);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(req, { error: "invalid_json" }, 400);
  }

  const password =
    typeof (payload as { password?: unknown }).password === "string"
      ? (payload as { password: string }).password
      : "";
  if (!PASSWORD_POLICY.test(password)) {
    return json(req, { error: "password_policy" }, 400);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    userRes.user.id,
    { password },
  );
  if (updateError) {
    console.error("password update failed", updateError.message);
    return json(req, { error: "password_update_failed" }, 400);
  }

  const { error: flagError } = await adminClient
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userRes.user.id);

  if (flagError) {
    console.error("must_change_password clear failed", flagError.message);
    return json(req, { error: "profile_update_failed" }, 500);
  }

  return json(req, { ok: true });
});
