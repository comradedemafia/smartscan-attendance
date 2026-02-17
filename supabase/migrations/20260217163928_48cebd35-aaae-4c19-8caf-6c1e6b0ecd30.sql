-- Allow lecturers to search all profiles (needed for adding students to courses)
CREATE POLICY "Lecturers can search all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'lecturer'::app_role));
