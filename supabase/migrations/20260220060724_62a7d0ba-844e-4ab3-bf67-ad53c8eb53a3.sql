
-- Auto-enroll all students of a department into a new course created in that department
CREATE OR REPLACE FUNCTION public.auto_enroll_department_students()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-enroll if the course has a department
  IF NEW.department_id IS NOT NULL THEN
    INSERT INTO public.course_enrollments (course_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.department_id = NEW.department_id
      AND ur.role = 'student'
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_enroll_students_on_course_create
AFTER INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.auto_enroll_department_students();
