
-- Create subjects table (subjects belong to courses)
CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Everyone can view subjects
CREATE POLICY "Authenticated users can view subjects"
ON public.subjects FOR SELECT
USING (true);

-- Admins full control
CREATE POLICY "Admins can manage subjects"
ON public.subjects FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Lecturers can create subjects for their courses
CREATE POLICY "Lecturers can create subjects"
ON public.subjects FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'lecturer'::app_role) AND created_by = auth.uid());

-- Owners can update subjects
CREATE POLICY "Owners can update subjects"
ON public.subjects FOR UPDATE
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Owners can delete subjects
CREATE POLICY "Owners can delete subjects"
ON public.subjects FOR DELETE
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Create subject_enrollments table (students enroll in subjects)
CREATE TABLE public.subject_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject_id)
);

-- Enable RLS
ALTER TABLE public.subject_enrollments ENABLE ROW LEVEL SECURITY;

-- View enrollments
CREATE POLICY "View subject enrollments"
ON public.subject_enrollments FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) 
  OR public.has_role(auth.uid(), 'lecturer'::app_role) 
  OR user_id = auth.uid()
);

-- Students can self-enroll
CREATE POLICY "Students can enroll in subjects"
ON public.subject_enrollments FOR INSERT
WITH CHECK (
  (user_id = auth.uid() AND public.has_role(auth.uid(), 'student'::app_role))
  OR public.has_role(auth.uid(), 'lecturer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Students can unenroll, admins/lecturers can remove
CREATE POLICY "Can remove subject enrollments"
ON public.subject_enrollments FOR DELETE
USING (
  (user_id = auth.uid() AND public.has_role(auth.uid(), 'student'::app_role))
  OR public.has_role(auth.uid(), 'lecturer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Add subject_id to sessions table (optional, session can be for a subject)
ALTER TABLE public.sessions ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- Create function to check if user is enrolled in a subject
CREATE OR REPLACE FUNCTION public.is_enrolled_in_subject(_user_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subject_enrollments
    WHERE user_id = _user_id AND subject_id = _subject_id
  )
$$;

-- Update session view policy to include subject enrollment
DROP POLICY IF EXISTS "View sessions" ON public.sessions;
CREATE POLICY "View sessions"
ON public.sessions FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) 
  OR created_by = auth.uid() 
  OR public.is_enrolled_in_course(auth.uid(), course_id)
  OR (subject_id IS NOT NULL AND public.is_enrolled_in_subject(auth.uid(), subject_id))
);
