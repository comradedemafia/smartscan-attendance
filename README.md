# SmartScan Attendance (AAS)

QR + TOTP + GPS based class attendance management for universities.

Students scan a session QR code, confirm their location, and verify a
time-based one-time code before attendance is recorded. Lecturers and admins
manage courses, sessions, enrollments, reports, excuses and notifications.

## Stack

- **Frontend:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, React Router
- **Data:** Supabase (Postgres, RLS, Auth, Storage, Edge Functions)
- **Testing:** Vitest + Testing Library; Deno tests for edge functions
- **CI/CD:** GitHub Actions (lint/typecheck/test/build), manual Cloudflare deploy,
  weekly backup and keep-alive

## Getting started

```sh
# 1. Install dependencies
npm install

# 2. Configure the frontend environment
cp .env.example .env
# then fill in VITE_SUPABASE_URL / VITE_SUPABASE_PROJECT_ID / VITE_SUPABASE_PUBLISHABLE_KEY

# 3. Run the dev server
npm run dev
```

### Supabase setup

This repository targets the project configured in `supabase/config.toml`
(`mdgglcfopiibinbrbgkl`). To use another project, change `project_id` and
re-link.

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Deploy the edge functions:

```sh
npx supabase functions deploy attendance-otp
npx supabase functions deploy check-absentees
npx supabase functions deploy admin-manage-users
npx supabase functions deploy admin-create-lecturer
npx supabase functions deploy import-student-registry
npx supabase functions deploy provision-student-accounts
npx supabase functions deploy optional-deadline-reminders
```

If the CLI cannot resolve `esm.sh` inside its Docker bundler, deploy with
`--use-api` (for example, `npx supabase functions deploy admin-manage-users --use-api`).

Set the edge function secrets (never commit these):

```sh
npx supabase secrets set \
  ALLOWED_ORIGINS="https://<your-worker>.workers.dev,http://localhost:5173" \
  CRON_SECRET="<random-long-string>" \
  TOTP_ISSUER="SmartScan Attendance"
```

- `ALLOWED_ORIGINS` — trusted browser origins for CORS. When unset, only the
  production worker and localhost dev origins are allowed; there is no `*`
  fallback.
- `CRON_SECRET` — required by `optional-deadline-reminders`. Schedule it with
  `pg_cron`/an external scheduler and send it as the `x-cron-secret` header.
- `TOTP_ISSUER` — label shown in the user's authenticator app.

> **Deploy order for upgrades:** the `20261108091000_user_totp_secrets`
> migration moves TOTP secrets into a service-role-only table and drops
> `profiles.totp_secret`. Deploy the updated `attendance-otp` function first,
> then apply the migration, to avoid a short window where the old function
> reads a removed column. For a fresh project, apply migrations first and then
> deploy the functions.
>
> The student-registry migrations (`20261111090000`, `20261111100000`,
> `20261111110000`, `20261111120000`) add the registry tables, readiness view,
> enrollment sync and custom session venues. Apply them before deploying the
> registry/attendance functions and frontend.

### Deploy the frontend (Cloudflare Workers)

The app is a static SPA served by a Cloudflare Worker (see `wrangler.jsonc`).
`not_found_handling: single-page-application` keeps client-side routes working.

```sh
npx wrangler login
npm run deploy   # npm run build && npx wrangler@4 deploy
```

Set the build-time variables in the Worker/dashboard or the GitHub Actions
secret store:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_PROJECT_ID` | `mdgglcfopiibinbrbgkl` |
| `VITE_SUPABASE_URL` | `https://mdgglcfopiibinbrbgkl.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | project publishable/anon key |

Remove any Cloudflare Access application or policy that covers the Worker
hostname, otherwise visitors are redirected to the Access login page.

### Create the first admin

Self-registration is disabled in the hosted project. Create the first admin in
**Authentication → Users**, then promote the account with SQL:

```sql
delete from public.user_roles
where user_id = (select id from auth.users where email = 'admin@example.com');

insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'admin@example.com';
```

After that, admins can create and manage students, lecturers, and admins from
the Users admin UI, which calls `admin-manage-users`.

### Student registry and imports

Admins import the student roster from **Student Registry**. CSV, XLSX and XLS
files are supported; preview the parsed rows before importing, then provision
accounts and reconcile module mappings. Fictional examples are in `samples/`:

- `samples/student-roster.csv` / `.xlsx`
- `samples/course-catalog.csv` / `.xlsx`

Course catalogs can also be imported from **Admin → Departments → Import
Modules**. Imports upsert courses by module code and never delete existing
courses. The `import-student-registry` function supports a `dry_run` flag and
falls back to direct `courses.code` matching when no alias exists.

### Attendance readiness and 2FA

Students need an avatar, a verified authenticator app, and an active registry
status before attendance is recorded. The QR scanner shows a non-blocking
setup warning when the avatar or TOTP setup is missing. Admins can clear a
user's authenticator from **Users** (Reset Authenticator) if they lose access.
Students whose registry status is `suspended`, `graduated` or `inactive` are
blocked by `attendance-otp`.

### Session scheduling

Lecturers can set a session date, start time, duration, venue (preset or
custom) and an optional GPS geofence. Leaving the geofence blank allows
attendance from anywhere; setting coordinates requires students to be within
the configured radius.

### GitHub Actions

| Workflow | Trigger | Required secrets |
| --- | --- | --- |
| `ci.yml` | push/PR | none |
| `deploy-cloudflare.yml` | manual | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_*` |
| `keepalive.yml` | every 3 days | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `backup.yml` | weekly | `SUPABASE_DB_URL` (pooler connection string) |

> Free-tier notes: Supabase pauses projects after ~7 days without activity
> (keep-alive helps). There are no automatic backups (the weekly dump keeps 90
> days of artifacts). GitHub disables scheduled workflows after 60 days without
> repository activity.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript project check |
| `npm run lint` | ESLint |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

Edge functions can be type-checked with Deno:

```sh
deno check supabase/functions/*/index.ts
deno test --allow-net --allow-env supabase/functions/
```

## Security model (high level)

- Roles live in `public.user_roles`; RLS policies use the `has_role()` helper.
- Self-registration is disabled in the hosted project. If enabled, it always
  creates a **student**. Lecturer and admin accounts are created by an admin
  through the `admin-manage-users` edge function. The older
  `admin-create-lecturer` function remains deployed for compatibility.
- TOTP secrets are stored in `public.user_totp_secrets`, which has RLS enabled
  with no policies and is only accessible to the service role. Clients never
  read the secret or a generated code; setup only returns the one-time pending
  QR payload and status checks return a boolean.
- OTP verification is replay-protected via `otp_replay_guard` and every attempt
  is written to `otp_verification_log`.
- Inactive registry students are rejected by `attendance-otp`; students with no
  registry row are still allowed for backward compatibility.
- TOTP reset is admin-only and clears the service-role-only secret row.
- `must_change_password` is cleared by a database trigger only after the
  password actually changes; users cannot edit it directly.
- Scheduled edge functions require a shared secret / privileged role.

## Project structure

```
src/
  components/        UI components (incl. TotpSetup, AppLayout)
  hooks/             useAuth, brute-force guard, mobile
  lib/               i18n, session guards, reports/export helpers (+ tests)
  pages/             Route screens
  integrations/      Supabase client + generated DB types
samples/             Fictional CSV/XLSX roster and catalog examples
supabase/
  functions/         Edge functions (attendance-otp, registry import, ...)
  migrations/        SQL migrations (schema, RLS, triggers)
```
