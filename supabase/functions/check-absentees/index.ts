import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all courses with enrollments
    const { data: courses } = await supabase.from("courses").select("id, name, code");
    if (!courses?.length) {
      return new Response(JSON.stringify({ checked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let alertsSent = 0;
    const THRESHOLD = 75;
    const CONSECUTIVE_LIMIT = 3;

    for (const course of courses) {
      // Get completed sessions for this course
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, session_date, title")
        .eq("course_id", course.id)
        .in("status", ["completed", "active"])
        .order("session_date", { ascending: false });

      if (!sessions?.length) continue;

      // Get enrollments
      const { data: enrollments } = await supabase
        .from("course_enrollments")
        .select("user_id")
        .eq("course_id", course.id);

      if (!enrollments?.length) continue;

      const sessionIds = sessions.map((s) => s.id);
      const { data: records } = await supabase
        .from("attendance_records")
        .select("user_id, session_id")
        .in("session_id", sessionIds);

      const recordSet = new Set((records || []).map((r) => `${r.user_id}_${r.session_id}`));

      for (const enrollment of enrollments) {
        const userId = enrollment.user_id;
        const attended = sessions.filter((s) => recordSet.has(`${userId}_${s.id}`)).length;
        const total = sessions.length;
        const pct = total > 0 ? Math.round((attended / total) * 100) : 100;

        // Check below threshold
        if (total >= 3 && pct < THRESHOLD) {
          // Check if we already sent this alert today
          const today = new Date().toISOString().split("T")[0];
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "warning")
            .gte("created_at", today)
            .ilike("title", `%${course.code}%`)
            .limit(1);

          if (!existing?.length) {
            await supabase.from("notifications").insert({
              user_id: userId,
              title: `⚠️ Low Attendance: ${course.code}`,
              message: `Your attendance for ${course.name} (${course.code}) is at ${pct}%, below the required ${THRESHOLD}%. Please improve your attendance.`,
              type: "warning",
            });
            alertsSent++;
          }
        }

        // Check consecutive misses (last N sessions)
        let consecutiveMisses = 0;
        for (const session of sessions) {
          if (!recordSet.has(`${userId}_${session.id}`)) {
            consecutiveMisses++;
          } else {
            break;
          }
        }

        if (consecutiveMisses >= CONSECUTIVE_LIMIT) {
          const today = new Date().toISOString().split("T")[0];
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "alert")
            .gte("created_at", today)
            .ilike("title", `%${course.code}%`)
            .limit(1);

          if (!existing?.length) {
            await supabase.from("notifications").insert({
              user_id: userId,
              title: `🚨 ${consecutiveMisses} Consecutive Absences: ${course.code}`,
              message: `You have missed ${consecutiveMisses} consecutive sessions for ${course.name} (${course.code}). Please attend the next session.`,
              type: "alert",
            });
            alertsSent++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, alertsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
