
-- Fix: Change sessions INSERT policy from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Lecturers can create sessions" ON public.sessions;

CREATE POLICY "Lecturers and admins can create sessions"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'lecturer'::app_role) AND created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM course_lecturers
    WHERE course_lecturers.course_id = sessions.course_id
    AND course_lecturers.lecturer_id = auth.uid()
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Also fix other session policies to be permissive
DROP POLICY IF EXISTS "View sessions" ON public.sessions;
CREATE POLICY "View sessions"
ON public.sessions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR is_enrolled_in_course(auth.uid(), course_id)
  OR (subject_id IS NOT NULL AND is_enrolled_in_subject(auth.uid(), subject_id))
);

DROP POLICY IF EXISTS "Owners can update sessions" ON public.sessions;
CREATE POLICY "Owners can update sessions"
ON public.sessions
FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Owners can delete sessions" ON public.sessions;
CREATE POLICY "Owners can delete sessions"
ON public.sessions
FOR DELETE
TO authenticated
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
