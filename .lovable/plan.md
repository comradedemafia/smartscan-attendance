

# Security Fixes Plan

## Overview
There are several security vulnerabilities to fix, prioritized by severity. This plan addresses all active (non-ignored) error-level and warning-level findings.

---

## 1. CRITICAL: Admin Role Escalation During Self-Registration

**Problem:** The `handle_new_user()` database trigger accepts any role from the client, including 'admin'. A user could modify their signup request to gain admin access.

**Fix:** Update the trigger to only allow 'student' or 'lecturer' roles during self-registration. Force any other value to 'student'.

```text
Database migration:
- Replace handle_new_user() function
- Add validation: IF role NOT IN ('student','lecturer') THEN role = 'student'
```

---

## 2. CRITICAL: QR Code Secrets Exposed to Students

**Problem:** Students can query the `qr_code_secret` from the sessions table, allowing them to forge attendance without scanning.

**Fix:** Create an edge function `verify-attendance` that handles QR validation server-side. Students submit session_id + secret to the edge function, which verifies and records attendance. The client no longer queries qr_code_secret directly.

```text
Changes:
- Create edge function: supabase/functions/verify-attendance/index.ts
- Update ScanQR.tsx to call edge function instead of querying sessions directly
- Add zod validation for QR input (also fixes finding #5)
```

---

## 3. WARNING: QR Code Input Lacks Validation

**Problem:** No schema validation on scanned QR data before processing.

**Fix:** Add zod schema validation in ScanQR.tsx (combined with fix #2 above).

---

## 4. WARNING: Leaked Password Protection Disabled

**Problem:** The authentication system doesn't check if passwords have been leaked in known breaches.

**Fix:** Enable leaked password protection via the auth configuration tool.

---

## 5. INFO-level and accepted-risk items

The following will be marked as acknowledged/ignored with justification:
- **Avatar bucket public** - Acceptable for profile pictures in educational context
- **Profile search function** - Returns limited fields by design
- **Bulk delete cascade** - Complex change (soft delete), marked as hard difficulty
- **Location data in attendance** - Not currently collected by frontend
- **Profiles exposure** - Already restricted by RLS to own/admin/lecturer-of-enrolled

---

## Technical Details

### Database Migration
```sql
-- Fix 1: Restrict self-registration roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Only allow student or lecturer from self-registration
  user_role := COALESCE(
    CASE WHEN (NEW.raw_user_meta_data->>'role') IN ('student', 'lecturer')
      THEN (NEW.raw_user_meta_data->>'role')::app_role
      ELSE 'student'::app_role
    END,
    'student'::app_role
  );

  INSERT INTO public.profiles (id, university_id, full_name, email, gender, department_id, phone, academic_year, study_year)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'university_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'gender',
    (NEW.raw_user_meta_data->>'department_id')::uuid,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'academic_year',
    CASE WHEN NEW.raw_user_meta_data->>'study_year' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'study_year')::integer
      ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);

  RETURN NEW;
END;
$$;
```

### Edge Function: verify-attendance
- Receives `{ session_id, secret }` from authenticated student
- Uses service role key to query session's qr_code_secret server-side
- Validates secret match, expiry, and active status
- Checks for duplicate attendance
- Inserts attendance record
- Returns success/error without exposing the secret

### ScanQR.tsx Changes
- Add zod schema: `z.object({ session_id: z.string().uuid(), secret: z.string().min(1).max(200) })`
- Replace direct Supabase query with `supabase.functions.invoke('verify-attendance', { body: parsed })`
- Handle response codes for success/duplicate/expired/error

### Files to Create/Modify
1. **New:** `supabase/functions/verify-attendance/index.ts`
2. **Modify:** `src/pages/ScanQR.tsx` - use edge function + zod validation
3. **Database migration:** Fix handle_new_user() trigger
4. **Update:** `supabase/config.toml` entry for verify-attendance (auto-handled)
5. **Security findings:** Update/delete resolved findings

