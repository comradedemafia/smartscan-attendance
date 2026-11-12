// Shared CORS helper for edge functions.
//
// Set ALLOWED_ORIGINS to a comma-separated list of trusted origins
// (e.g. "https://app.example.com,http://localhost:5173"). When unset we fall
// back to "*" so local development keeps working.
export function corsHeadersFor(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin =
    allowed.length === 0
      ? "*"
      : allowed.includes(origin)
        ? origin
        : allowed[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
