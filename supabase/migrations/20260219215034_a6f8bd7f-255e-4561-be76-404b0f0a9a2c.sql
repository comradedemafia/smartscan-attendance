-- Fix 1: Restrict self-registration roles to student/lecturer only
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Only allow student or lecturer from self-registration
  user_role := COALESCE(
    CASE WHEN (NEW.raw_user_meta_data->>'role') IN ('student', 'lecturer')
      THEN (NEW.raw_user_meta_data->>'role')::app_role
      ELSE 'student'::app_role
    END,
    'student'::app_role
  );

  INSERT INTO public.profiles (id, university_id, full_name, email, gender, department_id, phone, academic_year, study_year)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'university_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'gender',
    (NEW.raw_user_meta_data->>'department_id')::uuid,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'academic_year',
    CASE WHEN NEW.raw_user_meta_data->>'study_year' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'study_year')::integer
      ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);

  RETURN NEW;
END;
$$;