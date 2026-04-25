import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Configurable TOTP settings (via env vars) ─────────────────────────────
// Defaults match RFC 6238 + Google Authenticator: 30s step, 6 digits, ±1 window.
function getIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}
export const TOTP_TIME_STEP = getIntEnv("TOTP_TIME_STEP", 30, 5, 300);
export const TOTP_DIGITS = getIntEnv("TOTP_DIGITS", 6, 6, 8);
export const TOTP_WINDOW = getIntEnv("TOTP_WINDOW", 1, 0, 5);

// Base32 decoding for TOTP
export function base32Decode(str: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = str.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  // Allocate a fresh ArrayBuffer (not SharedArrayBuffer) so the result is
  // unambiguously a `Uint8Array<ArrayBuffer>` and satisfies WebCrypto's
  // `BufferSource` typing under strict TS settings.
  const buf = new ArrayBuffer(output.length);
  const view = new Uint8Array(buf);
  view.set(output);
  return view;
}

export async function generateTOTP(
  secret: string,
  timeStep: number = TOTP_TIME_STEP,
  digits: number = TOTP_DIGITS,
): Promise<string> {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBytes = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 |
    (hmac[offset + 1] & 0xff) << 16 |
    (hmac[offset + 2] & 0xff) << 8 |
    (hmac[offset + 3] & 0xff)) % Math.pow(10, digits);

  return code.toString().padStart(digits, "0");
}

// Deterministic helper for tests: generate TOTP at a specific counter value
// (so tests don't depend on wall-clock time).
export async function generateTOTPAt(
  secret: string,
  counter: number,
  digits: number = TOTP_DIGITS,
): Promise<string> {
  const key = base32Decode(secret);
  const counterBytes = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 |
    (hmac[offset + 1] & 0xff) << 16 |
    (hmac[offset + 2] & 0xff) << 8 |
    (hmac[offset + 3] & 0xff)) % Math.pow(10, digits);
  return code.toString().padStart(digits, "0");
}

// Returns the matched offset if valid, otherwise null.
// Also returns the absolute counter that matched (for replay protection).
export async function verifyTOTPDetailed(
  secret: string,
  token: string,
  timeStep: number = TOTP_TIME_STEP,
  digits: number = TOTP_DIGITS,
  window: number = TOTP_WINDOW,
): Promise<{ valid: boolean; offset: number | null; counter: number | null }> {
  const offsets: number[] = [0];
  for (let i = 1; i <= window; i++) {
    offsets.push(-i, i);
  }
  const baseCounter = Math.floor(Date.now() / 1000 / timeStep);
  for (const offset of offsets) {
    const counter = baseCounter + offset;
    const counterBytes = new Uint8Array(8);
    let tmp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }

    const key = base32Decode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));
    const off = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[off] & 0x7f) << 24 |
      (hmac[off + 1] & 0xff) << 16 |
      (hmac[off + 2] & 0xff) << 8 |
      (hmac[off + 3] & 0xff)) % Math.pow(10, digits);
    if (code.toString().padStart(digits, "0") === token) {
      return { valid: true, offset, counter };
    }
  }
  return { valid: false, offset: null, counter: null };
}

// Backwards-compatible boolean wrapper
export async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  const r = await verifyTOTPDetailed(secret, token);
  return r.valid;
}

// Calculate distance between two GPS points using Haversine formula (returns meters)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Validate student location against session location
function validateLocation(
  session: { latitude: number | null; longitude: number | null; location_radius_meters: number | null },
  studentLat: number | null | undefined,
  studentLon: number | null | undefined
): { valid: boolean; distance?: number } {
  // If session has no GPS set, skip validation (allow)
  if (!session.latitude || !session.longitude) {
    return { valid: true };
  }

  // If student didn't send location but session requires it
  if (studentLat == null || studentLon == null) {
    return { valid: false };
  }

  const radius = session.location_radius_meters || 100;
  const distance = haversineDistance(session.latitude, session.longitude, studentLat, studentLon);

  return { valid: distance <= radius, distance };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const action = body?.action;

    // ─── INITIATE: After QR scan, validate QR, GPS, and check TOTP status ───
    if (action === "initiate") {
      const { session_id, secret, latitude, longitude } = body;
      if (!session_id || !secret) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(session_id)) {
        return new Response(JSON.stringify({ error: "Invalid session ID" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: session } = await adminClient
        .from("sessions")
        .select("id, qr_code_secret, qr_expires_at, status, course_id, latitude, longitude, location_radius_meters")
        .eq("id", session_id)
        .single();

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (session.qr_code_secret !== secret) {
        return new Response(JSON.stringify({ error: "Invalid QR code" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (session.status !== "active" || !session.qr_expires_at || new Date(session.qr_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "QR_EXPIRED" }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // GPS Geofencing validation
      const locationCheck = validateLocation(session, latitude, longitude);
      if (!locationCheck.valid) {
        return new Response(JSON.stringify({ error: "OUTSIDE_RADIUS", distance: locationCheck.distance }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check enrollment
      const { data: enrollment } = await adminClient
        .from("course_enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", session.course_id)
        .maybeSingle();

      if (!enrollment) {
        return new Response(JSON.stringify({ error: "Not enrolled" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check duplicate attendance
      const { data: existing } = await adminClient
        .from("attendance_records")
        .select("id")
        .eq("session_id", session_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "DUPLICATE" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if student has TOTP set up
      const { data: profile } = await adminClient
        .from("profiles")
        .select("totp_secret")
        .eq("id", user.id)
        .single();

      const hasTotp = !!profile?.totp_secret;

      if (hasTotp) {
        return new Response(JSON.stringify({
          needs_totp: true,
          session_id,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // No TOTP set up
      return new Response(JSON.stringify({
        needs_totp: false,
        no_totp: true,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ─── VERIFY-SCAN-TOTP: Student enters TOTP code to record attendance ───
    } else if (action === "verify-scan-totp") {
      const { session_id, code, latitude, longitude } = body;
      if (!session_id || !code) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (typeof code !== "string" || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ error: "Invalid OTP format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Re-validate session is still active
      const { data: session } = await adminClient
        .from("sessions")
        .select("id, status, course_id, latitude, longitude, location_radius_meters")
        .eq("id", session_id)
        .single();

      if (!session || session.status !== "active") {
        return new Response(JSON.stringify({ error: "Session not active" }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Re-validate GPS location
      const locationCheck = validateLocation(session, latitude, longitude);
      if (!locationCheck.valid) {
        return new Response(JSON.stringify({ error: "OUTSIDE_RADIUS", distance: locationCheck.distance }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check duplicate
      const { data: existing } = await adminClient
        .from("attendance_records")
        .select("id")
        .eq("session_id", session_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "DUPLICATE" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get TOTP secret
      const { data: profile } = await adminClient
        .from("profiles")
        .select("totp_secret")
        .eq("id", user.id)
        .single();

      if (!profile?.totp_secret) {
        return new Response(JSON.stringify({ error: "TOTP not set up" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await verifyTOTP(profile.totp_secret, code);
      if (!valid) {
        return new Response(JSON.stringify({ error: "INVALID_OTP" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record attendance with GPS coordinates
      const { error: insertError } = await adminClient
        .from("attendance_records")
        .insert({
          session_id,
          user_id: user.id,
          status: "present",
          latitude: latitude || null,
          longitude: longitude || null,
        });

      if (insertError) {
        console.error("Attendance insert error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to record attendance" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ─── GET-TOTP-CODE: Return current TOTP code for display in Settings ───
    } else if (action === "get-totp-code") {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("totp_secret")
        .eq("id", user.id)
        .single();

      if (!profile?.totp_secret) {
        return new Response(JSON.stringify({ error: "TOTP not set up" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const code = await generateTOTP(profile.totp_secret);
      const timeStep = 30;
      const secondsRemaining = timeStep - (Math.floor(Date.now() / 1000) % timeStep);

      return new Response(JSON.stringify({ code, seconds_remaining: secondsRemaining }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ─── SETUP-TOTP: Generate TOTP secret ───
    } else if (action === "setup-totp") {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let secret = "";
      let bits = 0;
      let value = 0;
      for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
          secret += alphabet[(value >>> (bits - 5)) & 0x1f];
          bits -= 5;
        }
      }

      const { error } = await adminClient
        .from("profiles")
        .update({ totp_secret: secret })
        .eq("id", user.id);

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to save TOTP secret" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ secret, success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ─── VERIFY-SETUP: Verify first TOTP code to confirm setup works ───
    } else if (action === "verify-setup") {
      const { code } = body;
      if (!code || typeof code !== "string" || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ error: "Invalid code format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("totp_secret")
        .eq("id", user.id)
        .single();

      if (!profile?.totp_secret) {
        return new Response(JSON.stringify({ error: "TOTP not set up" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await verifyTOTP(profile.totp_secret, code);
      if (!valid) {
        return new Response(JSON.stringify({ error: "INVALID_OTP" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ─── DISABLE-TOTP ───
    } else if (action === "disable-totp") {
      await adminClient
        .from("profiles")
        .update({ totp_secret: null })
        .eq("id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
