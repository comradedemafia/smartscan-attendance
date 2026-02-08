
-- Drop all existing restrictive policies on courses
DROP POLICY IF EXISTS "Enrolled users can view courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can create courses" ON public.courses;
DROP POLICY IF EXISTS "Lecturers can create courses" ON public.courses;
DROP POLICY IF EXISTS "Owners can delete courses" ON public.courses;
DROP POLICY IF EXISTS "Owners can update courses" ON public.courses;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Enrolled users can view courses"
ON public.courses FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid())
  OR (EXISTS (
    SELECT 1 FROM course_enrollments
    WHERE course_enrollments.course_id = courses.id
    AND course_enrollments.user_id = auth.uid()
  ))
);

CREATE POLICY "Admins can create courses"
ON public.courses FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Lecturers can create courses"
ON public.courses FOR INSERT
WITH CHECK (has_role(auth.uid(), 'lecturer'::app_role) AND (created_by = auth.uid()));

CREATE POLICY "Owners can delete courses"
ON public.courses FOR DELETE
USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can update courses"
ON public.courses FOR UPDATE
USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Also fix sessions policies (same issue)
DROP POLICY IF EXISTS "View sessions" ON public.sessions;
DROP POLICY IF EXISTS "Lecturers can create sessions" ON public.sessions;
DROP POLICY IF EXISTS "Owners can delete sessions" ON public.sessions;
DROP POLICY IF EXISTS "Owners can update sessions" ON public.sessions;

CREATE POLICY "View sessions"
ON public.sessions FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (created_by = auth.uid())
  OR (EXISTS (
    SELECT 1 FROM course_enrollments
    WHERE course_enrollments.course_id = sessions.course_id
    AND course_enrollments.user_id = auth.uid()
  ))
);

CREATE POLICY "Lecturers can create sessions"
ON public.sessions FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'lecturer'::app_role) AND created_by = auth.uid()
   AND EXISTS (SELECT 1 FROM courses WHERE courses.id = sessions.course_id AND courses.created_by = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners can delete sessions"
ON public.sessions FOR DELETE
USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners can update sessions"
ON public.sessions FOR UPDATE
USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
