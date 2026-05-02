-- 1) must_change_password flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- 2) Tighten OTP verification log SELECT policy (admins + own only)
DROP POLICY IF EXISTS "Users view own otp logs" ON public.otp_verification_log;
CREATE POLICY "Admins or self view otp logs"
  ON public.otp_verification_log
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3) Helper to resolve a login identifier (university_id or email) to email.
-- SECURITY DEFINER + restricted search_path so anon can call it during sign-in.
CREATE OR REPLACE FUNCTION public.email_for_login_id(_login_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE university_id = _login_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.email_for_login_id(TEXT) TO anon, authenticated;