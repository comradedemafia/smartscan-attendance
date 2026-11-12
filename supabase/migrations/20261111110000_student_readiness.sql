-- Attendance readiness for students: avatar, verified TOTP, registry status.
-- Only admins (or the student themselves) may inspect TOTP readiness.

CREATE OR REPLACE FUNCTION public.user_has_verified_totp(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_totp_secrets t
    WHERE t.user_id = _user_id
      AND t.verified
      AND t.secret IS NOT NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_verified_totp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_verified_totp(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_student_attendance_readiness
WITH (security_invoker = true) AS
SELECT
  p.id AS profile_id,
  p.university_id,
  p.full_name,
  p.email,
  p.department_id,
  p.programme,
  p.avatar_url IS NOT NULL AS has_avatar,
  public.user_has_verified_totp(p.id) AS totp_enabled,
  r.id AS registry_id,
  r.status AS registry_status,
  (r.profile_id = p.id) AS registry_linked,
  CASE
    WHEN p.avatar_url IS NULL THEN 'missing_avatar'
    WHEN NOT public.user_has_verified_totp(p.id) THEN 'missing_totp'
    WHEN r.id IS NULL THEN 'missing_registry'
    WHEN r.status <> 'active' THEN 'inactive'
    ELSE 'ready'
  END AS readiness_status
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'student'
LEFT JOIN public.student_registry r ON r.university_id = p.university_id;

GRANT SELECT ON public.v_student_attendance_readiness TO authenticated;

-- Only student profiles belong in the missing-registry reconciliation list.
CREATE OR REPLACE VIEW public.v_profiles_missing_registry
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.university_id,
  p.full_name,
  p.email,
  p.department_id,
  p.programme,
  p.gender,
  p.created_at
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'student'
LEFT JOIN public.student_registry r ON r.university_id = p.university_id
WHERE r.id IS NULL
  AND p.university_id IS NOT NULL
  AND p.university_id <> '';

GRANT SELECT ON public.v_profiles_missing_registry TO authenticated;
