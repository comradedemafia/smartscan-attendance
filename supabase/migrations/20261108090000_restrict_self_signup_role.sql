-- Security: self-registration may only ever create a 'student' role.
-- Lecturer accounts must be created by an admin via the admin-create-lecturer
-- edge function (which re-asserts the role with the service role key).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    CASE WHEN NEW.raw_user_meta_data->>'study_year' IS NOT NULL
      THEN (NEW.raw_user_meta_data->>'study_year')::integer
      ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student'::app_role);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
