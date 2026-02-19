import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // 2. Parse and validate input
    const body = await req.json();
    const sessionId = body?.session_id;
    const secret = body?.secret;

    if (
      !sessionId || typeof sessionId !== "string" ||
      !secret || typeof secret !== "string" ||
      secret.length > 200
    ) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UUID v4 regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return new Response(JSON.stringify({ error: "Invalid session ID format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Use service role to query session (students can't see qr_code_secret)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: session, error: sessionError } = await adminClient
      .from("sessions")
      .select("id, qr_code_secret, qr_expires_at, status, course_id, subject_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Verify secret matches
    if (session.qr_code_secret !== secret) {
      return new Response(JSON.stringify({ error: "Invalid QR code" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Check session is active and QR not expired
    if (
      session.status !== "active" ||
      !session.qr_expires_at ||
      new Date(session.qr_expires_at) < new Date()
    ) {
      return new Response(JSON.stringify({ error: "QR_EXPIRED" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Verify student is enrolled in the course or subject
    let enrolled = false;

    const { data: courseEnroll } = await adminClient
      .from("course_enrollments")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", session.course_id)
      .maybeSingle();

    if (courseEnroll) enrolled = true;

    if (!enrolled && session.subject_id) {
      const { data: subjectEnroll } = await adminClient
        .from("subject_enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("subject_id", session.subject_id)
        .maybeSingle();

      if (subjectEnroll) enrolled = true;
    }

    if (!enrolled) {
      return new Response(JSON.stringify({ error: "Not enrolled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Check duplicate attendance
    const { data: existing } = await adminClient
      .from("attendance_records")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "DUPLICATE" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Record attendance
    const { error: insertError } = await adminClient
      .from("attendance_records")
      .insert({
        session_id: sessionId,
        user_id: userId,
        status: "present",
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to record attendance" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
