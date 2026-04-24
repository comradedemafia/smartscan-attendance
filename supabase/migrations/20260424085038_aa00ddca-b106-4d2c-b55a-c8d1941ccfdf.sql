-- 1. Add columns to courses
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_core BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS selection_deadline TIMESTAMP WITH TIME ZONE;

-- 2. Replace the auto-enroll trigger function so it only auto-enrolls for CORE modules,
--    matching by department + level (not just department).
CREATE OR REPLACE FUNCTION public.auto_enroll_department_students()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only auto-enroll students in CORE modules
  IF NEW.is_core = true AND NEW.department_id IS NOT NULL THEN
    INSERT INTO public.course_enrollments (course_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.department_id = NEW.department_id
      AND ur.role = 'student'
      AND (
        NEW.level_id IS NULL
        OR p.study_year IS NULL
        OR EXISTS (
          SELECT 1 FROM public.levels l
          WHERE l.id = NEW.level_id AND l.department_id = p.department_id
        )
      )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger on INSERT (create the trigger if missing)
DROP TRIGGER IF EXISTS trg_auto_enroll_on_course_insert ON public.courses;
CREATE TRIGGER trg_auto_enroll_on_course_insert
AFTER INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.auto_enroll_department_students();

-- 4. Trigger on UPDATE: when a module is changed to core, auto-enroll
DROP TRIGGER IF EXISTS trg_auto_enroll_on_course_update ON public.courses;
CREATE TRIGGER trg_auto_enroll_on_course_update
AFTER UPDATE OF is_core, department_id, level_id ON public.courses
FOR EACH ROW
WHEN (NEW.is_core = true)
EXECUTE FUNCTION public.auto_enroll_department_students();

-- 5. RLS: Block students from self-enrolling in CORE modules (must be auto) and
--    block self-enroll/unenroll on OPTION modules after the selection deadline.
DROP POLICY IF EXISTS "Students can self-enroll" ON public.course_enrollments;
CREATE POLICY "Students can self-enroll in optional modules before deadline"
ON public.course_enrollments
FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid()
  AND has_role(auth.uid(), 'student'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_enrollments.course_id
      AND c.is_core = false
      AND (c.selection_deadline IS NULL OR c.selection_deadline > now())
  )
);

DROP POLICY IF EXISTS "Students can unenroll themselves" ON public.course_enrollments;
CREATE POLICY "Students can unenroll from optional modules before deadline"
ON public.course_enrollments
FOR DELETE
TO public
USING (
  user_id = auth.uid()
  AND has_role(auth.uid(), 'student'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_enrollments.course_id
      AND c.is_core = false
      AND (c.selection_deadline IS NULL OR c.selection_deadline > now())
  )
);
