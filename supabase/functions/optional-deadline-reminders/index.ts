import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeadersFor } from "../_shared/cors.ts";

// Thresholds (in minutes) for sending reminders before the optional selection deadline closes.
const THRESHOLDS: { key: string; minutes: number; label: string }[] = [
  { key: "7d", minutes: 7 * 24 * 60, label: "7 days" },
  { key: "24h", minutes: 24 * 60, label: "24 hours" },
  { key: "30m", minutes: 30, label: "30 minutes" },
];

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // This function is a scheduled job. Require a shared secret so it cannot be
  // triggered by arbitrary clients to spam notifications or burn resources.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret =
    req.headers.get("x-cron-secret") ||
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = Date.now();
  let totalSent = 0;

  // Fetch all optional courses with a future deadline within the largest window
  const maxWindowMs = THRESHOLDS[0].minutes * 60_000;
  const upperBound = new Date(now + maxWindowMs).toISOString();
  const lowerBound = new Date(now).toISOString();

  const { data: courses, error: coursesErr } = await supabase
    .from("courses")
    .select("id, name, code, department_id, level_id, selection_deadline, is_core")
    .eq("is_core", false)
    .not("selection_deadline", "is", null)
    .gte("selection_deadline", lowerBound)
    .lte("selection_deadline", upperBound);

  if (coursesErr) {
    return new Response(JSON.stringify({ error: coursesErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const course of courses ?? []) {
    const deadlineMs = new Date(course.selection_deadline as string).getTime();
    const diffMin = Math.round((deadlineMs - now) / 60_000);

    // Find the smallest threshold the deadline currently falls under (and we haven't sent yet)
    const matched = THRESHOLDS.find((t) => diffMin <= t.minutes && diffMin > 0);
    if (!matched) continue;

    // Find candidate students: same department; not yet enrolled in this optional module
    const { data: deptStudents } = await supabase
      .from("profiles")
      .select("id, user_roles!inner(role)")
      .eq("department_id", course.department_id)
      .eq("user_roles.role", "student");

    const studentIds = (deptStudents ?? []).map((s) => s.id);
    if (studentIds.length === 0) continue;

    const { data: alreadyEnrolled } = await supabase
      .from("course_enrollments")
      .select("user_id")
      .eq("course_id", course.id)
      .in("user_id", studentIds);
    const enrolledSet = new Set((alreadyEnrolled ?? []).map((e) => e.user_id));

    // Notify both: students who haven't selected yet AND those who are enrolled (in case they want to reconsider).
    // Reason: selection window closes — they need to know either way.
    for (const sid of studentIds) {
      // Skip if reminder already sent for this threshold
      const { data: existing } = await supabase
        .from("deadline_reminders_sent")
        .select("id")
        .eq("course_id", course.id)
        .eq("user_id", sid)
        .eq("threshold", matched.key)
        .maybeSingle();
      if (existing) continue;

      const isEnrolled = enrolledSet.has(sid);
      const title = `Optional module deadline in ${matched.label}`;
      const message = isEnrolled
        ? `Reminder: selection for "${course.code} — ${course.name}" closes in ${matched.label}. You are currently enrolled.`
        : `Reminder: selection for optional module "${course.code} — ${course.name}" closes in ${matched.label}. Choose now if you want to take it.`;

      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: sid,
        title,
        message,
        type: "warning",
      });
      if (notifErr) continue;

      await supabase.from("deadline_reminders_sent").insert({
        course_id: course.id,
        user_id: sid,
        threshold: matched.key,
      });
      totalSent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: totalSent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});