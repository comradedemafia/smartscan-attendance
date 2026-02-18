
-- Step 1: Drop the overly permissive policy that exposes ALL profiles to lecturers
DROP POLICY IF EXISTS "Lecturers can search all profiles" ON public.profiles;

-- Step 2: Create a SECURITY DEFINER function for searching profiles
-- This returns only id, full_name, university_id — NO email or other sensitive fields
CREATE OR REPLACE FUNCTION public.search_profiles_for_enrollment(search_term text)
RETURNS TABLE(id uuid, full_name text, university_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.university_id
  FROM public.profiles p
  WHERE
    p.full_name ILIKE '%' || search_term || '%'
    OR p.university_id ILIKE '%' || search_term || '%'
  LIMIT 10;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.search_profiles_for_enrollment(text) TO authenticated;
