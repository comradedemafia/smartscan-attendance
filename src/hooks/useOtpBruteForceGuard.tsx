import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Frontend-only advisory guard that detects brute-force patterns by
 * inspecting the user's own OTP verification audit log.
 *
 * Rule: 5 or more failed attempts within FAILURE_WINDOW_MS triggers a
 * COOLDOWN_MS soft-block. The backend remains the source of truth; this
 * exists purely to discourage retries and surface a clear UX warning.
 */
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60 * 1000; // 60s soft-block after threshold

export interface OtpGuardState {
  recentFailures: number;
  blocked: boolean;
  cooldownSecondsLeft: number;
  lastFailureAt: Date | null;
  refresh: () => void;
}

export function useOtpBruteForceGuard(sessionId?: string | null): OtpGuardState {
  const { user } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the cooldown countdown updates live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, refetch } = useQuery({
    queryKey: ["otp-failure-log", user?.id, sessionId ?? "all"],
    enabled: !!user,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async () => {
      const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
      let q = supabase
        .from("otp_verification_log")
        .select("created_at, success")
        .eq("user_id", user!.id)
        .eq("success", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      if (sessionId) q = q.eq("session_id", sessionId);
      const { data, error } = await q;
      if (error) return [] as { created_at: string }[];
      return data || [];
    },
  });

  const failures = data || [];
  const recentFailures = failures.length;
  const lastFailureAt = failures[0] ? new Date(failures[0].created_at) : null;

  let blocked = false;
  let cooldownSecondsLeft = 0;
  if (recentFailures >= FAILURE_THRESHOLD && lastFailureAt) {
    const elapsed = now - lastFailureAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      blocked = true;
      cooldownSecondsLeft = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    }
  }

  return {
    recentFailures,
    blocked,
    cooldownSecondsLeft,
    lastFailureAt,
    refresh: () => refetch(),
  };
}
