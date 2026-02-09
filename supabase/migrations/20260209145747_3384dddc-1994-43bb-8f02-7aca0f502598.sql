
-- Allow students to self-enroll in courses
CREATE POLICY "Students can self-enroll"
ON public.course_enrollments
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  has_role(auth.uid(), 'student'::app_role)
);

-- Allow all authenticated users to view all courses (for browsing/enrollment)
DROP POLICY IF EXISTS "Enrolled users can view courses" ON public.courses;
CREATE POLICY "Authenticated users can view courses"
ON public.courses
FOR SELECT
USING (true);

-- Allow students to unenroll themselves
CREATE POLICY "Students can unenroll themselves"
ON public.course_enrollments
FOR DELETE
USING (user_id = auth.uid() AND has_role(auth.uid(), 'student'::app_role));
