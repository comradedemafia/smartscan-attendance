
-- Update handle_new_user to also store department_id, phone, academic_year, study_year
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
    CASE 
      WHEN NEW.raw_user_meta_data->>'study_year' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'study_year')::integer 
      ELSE NULL 
    END
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE(
      CASE WHEN (NEW.raw_user_meta_data->>'role') IN ('admin', 'lecturer', 'student') 
        THEN (NEW.raw_user_meta_data->>'role')::app_role 
        ELSE 'student'::app_role 
      END,
      'student'::app_role
    )
  );
  
  RETURN NEW;
END;
$$;

-- Attach trigger if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;
