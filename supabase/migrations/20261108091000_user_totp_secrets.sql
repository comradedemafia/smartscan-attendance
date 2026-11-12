-- Move TOTP secrets out of `profiles` into a table that is only reachable by
-- the service role (edge functions). Previously `totp_secret` was a normal
-- profile column, so row-level RLS exposed it to lecturers (enrolled students)
-- and admins, and users could overwrite it directly via PostgREST.

CREATE TABLE IF NOT EXISTS public.user_totp_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_secret TEXT,
  secret TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_totp_secrets ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: with RLS enabled and no policy they get
-- zero access. Only the service role (used by edge functions) may read/write.
REVOKE ALL ON public.user_totp_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_totp_secrets TO service_role;

-- Carry over any existing (already working) secrets as verified.
INSERT INTO public.user_totp_secrets (user_id, secret, verified)
SELECT id, totp_secret, true
FROM public.profiles
WHERE totp_secret IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Remove the exposed column.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS totp_secret;

-- Keep 2FA adoption stats working against the new table.
CREATE OR REPLACE FUNCTION public.get_2fa_stats()
RETURNS TABLE(total_students bigint, totp_enabled bigint, phone_set bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) AS total_students,
    COUNT(t.secret) FILTER (WHERE t.verified) AS totp_enabled,
    COUNT(p.phone) AS phone_set
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.user_totp_secrets t ON t.user_id = p.id
  WHERE ur.role = 'student';
$$;

REVOKE EXECUTE ON FUNCTION public.get_2fa_stats() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Protect `must_change_password` from being cleared without an actual
-- password change. A trigger on auth.users clears the flag when the encrypted
-- password changes; the profile trigger stops users from editing it directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    -- Allow this nested profile update to bypass the guard below even when the
    -- password change was initiated by the user's own (non-admin) session.
    PERFORM set_config('app.bypass_profile_guard', 'on', true);
    UPDATE public.profiles
    SET must_change_password = false
    WHERE id = NEW.id;
    PERFORM set_config('app.bypass_profile_guard', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_password_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_password_changed ON auth.users;
CREATE TRIGGER on_auth_user_password_changed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_password_change();

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted internal update (e.g. the password-change trigger).
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Service role (no JWT) and admins may change the flag.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Everyone else: keep the existing value.
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    NEW.must_change_password := OLD.must_change_password;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_security_fields ON public.profiles;
CREATE TRIGGER protect_profile_security_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();
