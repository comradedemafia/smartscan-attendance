
-- =============================================
-- 1. Create departments table
-- =============================================
CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view departments
CREATE POLICY "Anyone can view departments"
  ON public.departments FOR SELECT
  USING (true);

-- Only admins can manage departments
CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- 2. Add columns to profiles
-- =============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS academic_year text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS study_year integer;

-- =============================================
-- 3. Add department_id to courses
-- =============================================
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

-- =============================================
-- 4. Create course_lecturers table (admin assigns lecturers to courses)
-- =============================================
CREATE TABLE public.course_lecturers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lecturer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL,
  UNIQUE(course_id, lecturer_id)
);

ALTER TABLE public.course_lecturers ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage course lecturers"
  ON public.course_lecturers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Lecturers can view their own assignments
CREATE POLICY "Lecturers can view own assignments"
  ON public.course_lecturers FOR SELECT
  USING (lecturer_id = auth.uid() OR has_role(auth.uid(), 'lecturer'::app_role));

-- Students can view course-lecturer assignments (to see who teaches what)
CREATE POLICY "Students can view course lecturers"
  ON public.course_lecturers FOR SELECT
  USING (has_role(auth.uid(), 'student'::app_role));

-- =============================================
-- 5. Insert sample departments
-- =============================================
INSERT INTO public.departments (name, code, description) VALUES
  ('Computer Science', 'CS', 'Department of Computer Science and Information Technology'),
  ('Electrical Engineering', 'EE', 'Department of Electrical and Electronic Engineering'),
  ('Business Administration', 'BA', 'Department of Business and Management Studies'),
  ('Mathematics', 'MATH', 'Department of Mathematics and Statistics'),
  ('Physics', 'PHY', 'Department of Physics and Applied Sciences')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 6. Security definer function: get lecturer profile for course
-- =============================================
CREATE OR REPLACE FUNCTION public.get_department_lecturers(_department_id uuid)
RETURNS TABLE(
  lecturer_id uuid,
  full_name text,
  university_id text,
  course_id uuid,
  course_name text,
  course_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id as lecturer_id,
    p.full_name,
    p.university_id,
    c.id as course_id,
    c.name as course_name,
    c.code as course_code
  FROM public.course_lecturers cl
  JOIN public.profiles p ON p.id = cl.lecturer_id
  JOIN public.courses c ON c.id = cl.course_id
  WHERE c.department_id = _department_id;
$$;
