// Shared CORS helper for edge functions.
//
// Set ALLOWED_ORIGINS to a comma-separated list of trusted origins
// (e.g. "https://app.example.com,http://localhost:5173"). If unset, only the
// production worker and local dev origins are allowed. Never fall back to "*".
const DEFAULT_ALLOWED_ORIGINS = [
  "https://smartscan-attendance.comradedemafia.workers.dev",
  "http://localhost:5173",
  "http://localhost:8080",
];

export function corsHeadersFor(req: Request): Record<string, string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;

  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
