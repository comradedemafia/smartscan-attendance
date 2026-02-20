
-- Fix: Allow lecturers assigned via course_lecturers to create sessions (not just course creators)
DROP POLICY IF EXISTS "Lecturers can create sessions" ON public.sessions;

CREATE POLICY "Lecturers can create sessions"
ON public.sessions
FOR INSERT
WITH CHECK (
  (
    has_role(auth.uid(), 'lecturer'::app_role)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.course_lecturers
      WHERE course_lecturers.course_id = sessions.course_id
        AND course_lecturers.lecturer_id = auth.uid()
    )
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);
