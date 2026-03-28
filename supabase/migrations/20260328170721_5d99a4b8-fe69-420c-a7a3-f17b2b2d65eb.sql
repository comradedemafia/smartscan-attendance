
CREATE OR REPLACE FUNCTION public.get_2fa_stats()
RETURNS TABLE(total_students bigint, totp_enabled bigint, phone_set bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) AS total_students,
    COUNT(p.totp_secret) AS totp_enabled,
    COUNT(p.phone) AS phone_set
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'student';
$$;
