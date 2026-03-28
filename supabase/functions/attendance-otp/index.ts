import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Base32 decoding for TOTP
function base32Decode(str: string): Uint8Array {
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
  return new Uint8Array(output);
}

async function generateTOTP(secret: string, timeStep = 30, digits = 6): Promise<string> {
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

async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  // Check current and adjacent time steps (±1) for clock skew
  for (const offset of [0, -1, 1]) {
    const timeStep = 30;
    const counter = Math.floor(Date.now() / 1000 / timeStep) + offset;
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
      (hmac[off + 3] & 0xff)) % 1000000;
    if (code.toString().padStart(6, "0") === token) return true;
  }
  return false;
}

function generateRandomOTP(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1000000).toString().padStart(6, "0");
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

    if (action === "initiate") {
      // Called after QR scan validation. Creates OTP record.
      const { session_id, secret } = body;
      if (!session_id || !secret) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate QR (same logic as verify-attendance)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(session_id)) {
        return new Response(JSON.stringify({ error: "Invalid session ID" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: session } = await adminClient
        .from("sessions")
        .select("id, qr_code_secret, qr_expires_at, status, course_id")
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
        .select("totp_secret, phone")
        .eq("id", user.id)
        .single();

      const hasTotp = !!profile?.totp_secret;
      const hasPhone = !!profile?.phone;

      // Generate a random OTP for SMS method
      const otpCode = generateRandomOTP();

      // Create OTP record (expires in 5 minutes)
      const { data: otpRecord, error: otpError } = await adminClient
        .from("attendance_otp")
        .insert({
          user_id: user.id,
          session_id: session_id,
          otp_code: otpCode,
          method: "pending",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (otpError) {
        console.error("OTP create error:", otpError);
        return new Response(JSON.stringify({ error: "Failed to create OTP" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        otp_required: true,
        token: otpRecord.id,
        methods: {
          totp: hasTotp,
          sms: hasPhone,
        },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "send-sms") {
      // Send SMS OTP (requires Twilio - placeholder for now)
      const { token } = body;
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: otpRecord } = await adminClient
        .from("attendance_otp")
        .select("*")
        .eq("id", token)
        .eq("user_id", user.id)
        .eq("used", false)
        .single();

      if (!otpRecord || new Date(otpRecord.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "OTP expired or invalid" }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update method to SMS
      await adminClient
        .from("attendance_otp")
        .update({ method: "sms" })
        .eq("id", token);

      // Get user phone
      const { data: profile } = await adminClient
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();

      if (!profile?.phone) {
        return new Response(JSON.stringify({ error: "No phone number" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // TODO: Send SMS via Twilio when connected
      // For now, we'll log the OTP (in production, this would be sent via SMS)
      console.log(`[SMS OTP] User ${user.id} - Code: ${otpRecord.otp_code} - Phone: ${profile.phone}`);

      // Check if Twilio is configured
      const twilioKey = Deno.env.get("TWILIO_API_KEY");
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");

      if (twilioKey && lovableKey) {
        try {
          const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
          const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": twilioKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: profile.phone,
              From: Deno.env.get("TWILIO_PHONE_NUMBER") || "+15005550006",
              Body: `Your attendance OTP code is: ${otpRecord.otp_code}. Valid for 5 minutes.`,
            }),
          });

          if (!response.ok) {
            console.error("Twilio SMS failed:", await response.text());
          }
        } catch (e) {
          console.error("Twilio error:", e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: "OTP sent",
        phone_hint: profile.phone.slice(-4),
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "verify") {
      const { token, code, method } = body;
      if (!token || !code || !method) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (typeof code !== "string" || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ error: "Invalid OTP format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get OTP record
      const { data: otpRecord } = await adminClient
        .from("attendance_otp")
        .select("*")
        .eq("id", token)
        .eq("user_id", user.id)
        .eq("used", false)
        .single();

      if (!otpRecord) {
        return new Response(JSON.stringify({ error: "OTP not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(otpRecord.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "OTP_EXPIRED" }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let valid = false;

      if (method === "totp") {
        // Verify TOTP from authenticator app
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

        valid = await verifyTOTP(profile.totp_secret, code);
      } else if (method === "sms") {
        // Verify SMS OTP code
        valid = otpRecord.otp_code === code;
      } else {
        return new Response(JSON.stringify({ error: "Invalid method" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!valid) {
        return new Response(JSON.stringify({ error: "INVALID_OTP" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark OTP as used
      await adminClient
        .from("attendance_otp")
        .update({ used: true, method })
        .eq("id", token);

      // Record attendance
      const { error: insertError } = await adminClient
        .from("attendance_records")
        .insert({
          session_id: otpRecord.session_id,
          user_id: user.id,
          status: "present",
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

    } else if (action === "setup-totp") {
      // Generate TOTP secret for user
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

      // Save to profile
      const { error } = await adminClient
        .from("profiles")
        .update({ totp_secret: secret })
        .eq("id", user.id);

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to save TOTP secret" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user email for TOTP URI
      const { data: profile } = await adminClient
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .single();

      const issuer = "AttendanceSystem";
      const account = profile?.email || profile?.full_name || user.id;
      const uri = `otpauth://totp/${issuer}:${encodeURIComponent(account)}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;

      return new Response(JSON.stringify({ secret, uri }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

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
