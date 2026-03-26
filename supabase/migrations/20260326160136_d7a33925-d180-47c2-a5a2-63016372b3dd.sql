CREATE OR REPLACE FUNCTION public.search_profiles_for_enrollment(search_term text)
 RETURNS TABLE(id uuid, full_name text, university_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.university_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'student'
    AND (
      p.full_name ILIKE '%' || search_term || '%'
      OR p.university_id ILIKE '%' || search_term || '%'
    )
  LIMIT 10;
$$;