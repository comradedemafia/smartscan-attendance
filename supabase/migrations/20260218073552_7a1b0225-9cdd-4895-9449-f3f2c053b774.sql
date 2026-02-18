-- Allow any lecturer to enroll students into any course (not just their own)
DROP POLICY IF EXISTS "Lecturers can enroll students" ON public.course_enrollments;

CREATE POLICY "Lecturers can enroll students in any course"
ON public.course_enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'lecturer'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow any lecturer to remove students from any course
DROP POLICY IF EXISTS "Manage enrollments" ON public.course_enrollments;

CREATE POLICY "Lecturers can remove students from any course"
ON public.course_enrollments
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'lecturer'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Also allow lecturers to view all enrollments (not just their courses)
DROP POLICY IF EXISTS "View enrollments" ON public.course_enrollments;

CREATE POLICY "View enrollments"
ON public.course_enrollments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'lecturer'::app_role)
  OR user_id = auth.uid()
);