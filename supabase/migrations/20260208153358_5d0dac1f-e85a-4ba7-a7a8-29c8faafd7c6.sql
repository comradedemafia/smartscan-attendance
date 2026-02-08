
-- Fix infinite recursion: create helper function for enrollment check
CREATE OR REPLACE FUNCTION public.is_enrolled_in_course(_user_id uuid, _course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_enrollments
    WHERE user_id = _user_id AND course_id = _course_id
  )
$$;

-- Drop and recreate courses SELECT policy using the function
DROP POLICY IF EXISTS "Enrolled users can view courses" ON public.courses;
CREATE POLICY "Enrolled users can view courses"
ON public.courses FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid())
  OR is_enrolled_in_course(auth.uid(), id)
);

-- Fix sessions SELECT policy too
DROP POLICY IF EXISTS "View sessions" ON public.sessions;
CREATE POLICY "View sessions"
ON public.sessions FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid())
  OR is_enrolled_in_course(auth.uid(), course_id)
);

-- Fix course_enrollments SELECT policy
DROP POLICY IF EXISTS "View enrollments" ON public.course_enrollments;
CREATE POLICY "View enrollments"
ON public.course_enrollments FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (user_id = auth.uid())
  OR (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_enrollments.course_id
    AND courses.created_by = auth.uid()
  ))
);

-- Fix course_enrollments INSERT policy
DROP POLICY IF EXISTS "Lecturers can enroll students" ON public.course_enrollments;
CREATE POLICY "Lecturers can enroll students"
ON public.course_enrollments FOR INSERT
WITH CHECK (
  (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_enrollments.course_id
    AND courses.created_by = auth.uid()
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix course_enrollments DELETE policy
DROP POLICY IF EXISTS "Manage enrollments" ON public.course_enrollments;
CREATE POLICY "Manage enrollments"
ON public.course_enrollments FOR DELETE
USING (
  (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_enrollments.course_id
    AND courses.created_by = auth.uid()
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
);
