
-- Drop the old restrictive INSERT policy
DROP POLICY IF EXISTS "Lecturers and admins can create sessions" ON public.sessions;

-- Create new INSERT policy that allows lecturers to create sessions for courses they created
CREATE POLICY "Lecturers and admins can create sessions"
ON public.sessions
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'lecturer'::app_role)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = sessions.course_id
      AND courses.created_by = auth.uid()
    )
  )
);
