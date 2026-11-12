// Real-endpoint E2E test for the attendance-otp replay-protection flow.
//
// Unlike `e2e_test.ts` (which uses in-memory Maps), this test:
//   1. Loads .env from the repo root (Deno dotenv).
//   2. Authenticates against the live Supabase project as a real student
//      using TEST_STUDENT_EMAIL / TEST_STUDENT_PASSWORD.
//   3. Calls the deployed `attendance-otp` edge function via HTTP.
//   4. Verifies the deterministic 409 + REPLAY_DETECTED contract end-to-end.
//
// Required env (in `.env` at repo root or process env):
//   - VITE_SUPABASE_URL                Supabase project URL
//   - VITE_SUPABASE_PUBLISHABLE_KEY    Anon key
//   - TEST_STUDENT_EMAIL               Auth email of a seeded student
//   - TEST_STUDENT_PASSWORD            Their password
//   - TEST_SESSION_ID                  An *active* session UUID the student is enrolled in
//   - TEST_QR_SECRET                   That session's qr_code_secret
//   - SUPABASE_SERVICE_ROLE_KEY        (optional) for cleanup
//
// If any required var is missing the test self-skips so CI doesn't break.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  generateTOTPAt,
  TOTP_TIME_STEP,
  TOTP_DIGITS,
} from "./index.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STUDENT_EMAIL = Deno.env.get("TEST_STUDENT_EMAIL");
const STUDENT_PASSWORD = Deno.env.get("TEST_STUDENT_PASSWORD");
const SESSION_ID = Deno.env.get("TEST_SESSION_ID");
const QR_SECRET = Deno.env.get("TEST_QR_SECRET");

function missing(): string | null {
  const required: Record<string, string | undefined> = {
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_ANON_KEY,
    TEST_STUDENT_EMAIL: STUDENT_EMAIL,
    TEST_STUDENT_PASSWORD: STUDENT_PASSWORD,
    TEST_SESSION_ID: SESSION_ID,
    TEST_QR_SECRET: QR_SECRET,
  };
  const blanks = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return blanks.length ? blanks.join(", ") : null;
}

async function callEdgeFn(
  action: string,
  body: Record<string, unknown>,
  jwt: string,
): Promise<{ status: number; body: any }> {
  const url = `${SUPABASE_URL}/functions/v1/attendance-otp`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
      "apikey": SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ action, ...body }),
  });
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = await res.text().catch(() => null);
  }
  return { status: res.status, body: parsed };
}

Deno.test({
  name: "E2E (live): replay protection returns deterministic 409 REPLAY_DETECTED",
  // Avoid sanitizer flakiness from the Supabase client's keep-alive sockets.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const skipReason = missing();
    if (skipReason) {
      console.warn(
        `[skip] live replay E2E — missing env: ${skipReason}. ` +
          "Set TEST_STUDENT_EMAIL/PASSWORD + TEST_SESSION_ID + TEST_QR_SECRET to enable.",
      );
      return;
    }

    // 1. Authenticate as the test student.
    const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    const { data: signIn, error: signInErr } =
      await userClient.auth.signInWithPassword({
        email: STUDENT_EMAIL!,
        password: STUDENT_PASSWORD!,
      });
    if (signInErr || !signIn.session) {
      throw new Error(`sign-in failed: ${signInErr?.message ?? "no session"}`);
    }
    const jwt = signIn.session.access_token;
    const userId = signIn.user!.id;

    // 2. Read the student's TOTP secret (requires service role) and clear any
    //    pre-existing replay-guard / attendance row so the test is repeatable.
    let totpSecret: string | null = null;
    if (SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL!, SERVICE_ROLE);
      const { data: totpRow } = await admin
        .from("user_totp_secrets")
        .select("secret, verified")
        .eq("user_id", userId)
        .maybeSingle();
      totpSecret = totpRow?.verified ? totpRow?.secret ?? null : null;

      // Best-effort cleanup so the test can re-run.
      await admin
        .from("attendance_records")
        .delete()
        .eq("session_id", SESSION_ID!)
        .eq("user_id", userId);
    }
    if (!totpSecret) {
      console.warn(
        "[skip] live replay E2E — could not read totp_secret " +
          "(needs SUPABASE_SERVICE_ROLE_KEY + a seeded TOTP profile).",
      );
      try { await userClient.auth.signOut(); } catch { /* ignore */ }
      return;
    }

    // 3. Initiate (validates QR + enrollment).
    const initiate = await callEdgeFn(
      "initiate",
      { session_id: SESSION_ID, secret: QR_SECRET },
      jwt,
    );
    assert(
      initiate.status === 200,
      `initiate failed: ${initiate.status} ${JSON.stringify(initiate.body)}`,
    );

    // 4. Generate a TOTP for the *current* counter and submit it.
    const counter = Math.floor(Date.now() / 1000 / TOTP_TIME_STEP);
    const code = await generateTOTPAt(totpSecret, counter, TOTP_DIGITS);

    const first = await callEdgeFn(
      "verify-scan-totp",
      { session_id: SESSION_ID, code },
      jwt,
    );
    assertEquals(
      first.status,
      200,
      `first verify expected 200, got ${first.status}: ${JSON.stringify(first.body)}`,
    );
    assertEquals(first.body?.success, true);

    // 5. Replay the SAME code → must be a deterministic 409 REPLAY_DETECTED.
    //    We accept the DUPLICATE path too (attendance row already exists),
    //    but explicitly clear it via service role first if available so the
    //    replay-guard path is what gets hit.
    if (SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL!, SERVICE_ROLE);
      await admin
        .from("attendance_records")
        .delete()
        .eq("session_id", SESSION_ID!)
        .eq("user_id", userId);
    }

    const second = await callEdgeFn(
      "verify-scan-totp",
      { session_id: SESSION_ID, code },
      jwt,
    );
    assertEquals(
      second.status,
      409,
      `replay expected 409, got ${second.status}: ${JSON.stringify(second.body)}`,
    );
    assertEquals(second.body?.error, "REPLAY_DETECTED");
    assertEquals(second.body?.code, "REPLAY_DETECTED");
    assert(
      typeof second.body?.message === "string" && second.body.message.length > 0,
      "replay response should include a human-readable message",
    );

    // 6. Verify the audit log captured both attempts.
    if (SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL!, SERVICE_ROLE);
      const { data: logs } = await admin
        .from("otp_verification_log")
        .select("success, failure_reason")
        .eq("user_id", userId)
        .eq("session_id", SESSION_ID!)
        .order("created_at", { ascending: false })
        .limit(2);
      assert((logs?.length ?? 0) >= 2, "expected at least 2 audit log rows");
      assert(
        logs!.some((l) => l.failure_reason === "REPLAY_DETECTED"),
        "expected an audit row with REPLAY_DETECTED reason",
      );
    }

    try { await userClient.auth.signOut(); } catch { /* ignore */ }
  },
});
