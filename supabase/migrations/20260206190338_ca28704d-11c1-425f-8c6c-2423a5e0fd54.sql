
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'lecturer', 'student');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- 4. Courses table
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Course enrollments
CREATE TABLE public.course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(course_id, user_id)
);

-- 6. Sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  qr_code_secret TEXT,
  qr_expires_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_radius_meters INTEGER DEFAULT 100,
  venue_name TEXT,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Attendance records
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'present',
  UNIQUE(session_id, user_id)
);

-- 8. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 9. Security definer helper: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 10. Security definer helper: get_user_role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 11. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 12. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, university_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'university_id', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'student')
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. RLS Policies

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Lecturers can view enrolled student profiles" ON public.profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'lecturer') AND EXISTS (
    SELECT 1 FROM public.course_enrollments ce
    JOIN public.courses c ON c.id = ce.course_id
    WHERE ce.user_id = profiles.id AND c.created_by = auth.uid()
  )
);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- courses
CREATE POLICY "Enrolled users can view courses" ON public.courses FOR SELECT USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.course_enrollments WHERE course_id = courses.id AND user_id = auth.uid())
);
CREATE POLICY "Lecturers can create courses" ON public.courses FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'lecturer') AND created_by = auth.uid()
);
CREATE POLICY "Admins can create courses" ON public.courses FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners can update courses" ON public.courses FOR UPDATE USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners can delete courses" ON public.courses FOR DELETE USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- course_enrollments
CREATE POLICY "View enrollments" ON public.course_enrollments FOR SELECT USING (
  public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.courses WHERE id = course_enrollments.course_id AND created_by = auth.uid())
);
CREATE POLICY "Lecturers can enroll students" ON public.course_enrollments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.courses WHERE id = course_enrollments.course_id AND created_by = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Manage enrollments" ON public.course_enrollments FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.courses WHERE id = course_enrollments.course_id AND created_by = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- sessions
CREATE POLICY "View sessions" ON public.sessions FOR SELECT USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.course_enrollments WHERE course_id = sessions.course_id AND user_id = auth.uid())
);
CREATE POLICY "Lecturers can create sessions" ON public.sessions FOR INSERT WITH CHECK (
  (public.has_role(auth.uid(), 'lecturer') AND created_by = auth.uid()
   AND EXISTS (SELECT 1 FROM public.courses WHERE id = sessions.course_id AND created_by = auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Owners can update sessions" ON public.sessions FOR UPDATE USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners can delete sessions" ON public.sessions FOR DELETE USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- attendance_records
CREATE POLICY "View own attendance" ON public.attendance_records FOR SELECT USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = attendance_records.session_id AND s.created_by = auth.uid())
);
CREATE POLICY "Students can record own attendance" ON public.attendance_records FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.course_enrollments ce
    JOIN public.sessions s ON s.course_id = ce.course_id
    WHERE s.id = attendance_records.session_id AND ce.user_id = auth.uid())
);
CREATE POLICY "Admins can manage attendance" ON public.attendance_records FOR ALL USING (public.has_role(auth.uid(), 'admin'));
