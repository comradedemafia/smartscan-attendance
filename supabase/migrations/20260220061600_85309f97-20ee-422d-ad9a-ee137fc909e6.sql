
-- Drop the RLS policy that depends on subject_id
DROP POLICY IF EXISTS "View sessions" ON public.sessions;

-- Recreate the policy without subject_id reference
CREATE POLICY "View sessions" ON public.sessions
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid())
  OR is_enrolled_in_course(auth.uid(), course_id)
);

-- Now drop subject_id column
ALTER TABLE public.sessions DROP COLUMN IF EXISTS subject_id;

-- Drop subject_enrollments table
DROP TABLE IF EXISTS public.subject_enrollments;

-- Drop subjects table
DROP TABLE IF EXISTS public.subjects;

-- Drop the is_enrolled_in_subject function
DROP FUNCTION IF EXISTS public.is_enrolled_in_subject(uuid, uuid);
