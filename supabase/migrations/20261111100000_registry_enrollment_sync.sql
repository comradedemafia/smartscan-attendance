-- Resolve registry module codes against saved aliases and direct course codes,
-- then backfill course enrollments for registry rows already linked to a profile.

CREATE OR REPLACE FUNCTION public.apply_course_code_aliases()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  mapped_count integer;
  direct_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.student_registry_enrollments e
  SET course_id = a.course_id,
      mapping_status = 'mapped',
      updated_at = now()
  FROM public.course_code_aliases a
  WHERE e.external_code = a.external_code
    AND (e.course_id IS DISTINCT FROM a.course_id OR e.mapping_status <> 'mapped');

  GET DIAGNOSTICS mapped_count = ROW_COUNT;

  UPDATE public.student_registry_enrollments e
  SET course_id = c.id,
      mapping_status = 'mapped',
      updated_at = now()
  FROM public.courses c
  WHERE upper(e.external_code) = upper(c.code)
    AND (e.course_id IS DISTINCT FROM c.id OR e.mapping_status <> 'mapped');

  GET DIAGNOSTICS direct_count = ROW_COUNT;
  mapped_count := mapped_count + direct_count;

  INSERT INTO public.course_enrollments (course_id, user_id)
  SELECT DISTINCT e.course_id, r.profile_id
  FROM public.student_registry_enrollments e
  JOIN public.student_registry r ON r.id = e.registry_id
  WHERE e.course_id IS NOT NULL
    AND r.profile_id IS NOT NULL
  ON CONFLICT (course_id, user_id) DO NOTHING;

  RETURN mapped_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_course_code_aliases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_course_code_aliases() TO authenticated;
