-- Student registry: admin-controlled roster imported from the college system.
-- Students do not self-register; accounts are provisioned from this registry.

-- ─── Profile identity fields ────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admission_number text,
  ADD COLUMN IF NOT EXISTS programme text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_admission_number_key
  ON public.profiles (admission_number)
  WHERE admission_number IS NOT NULL;

-- ─── Student registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id text NOT NULL UNIQUE,
  admission_number text,
  full_name text NOT NULL,
  email text,
  email_is_synthetic boolean NOT NULL DEFAULT false,
  gender text CHECK (gender IN ('M', 'F')),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  department_raw text,
  programme text,
  study_year integer,
  semester text,
  academic_year text,
  phone text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'graduated', 'inactive')),
  source text NOT NULL DEFAULT 'csv'
    CHECK (source IN ('csv', 'manual', 'api')),
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  provisioned_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS student_registry_admission_number_key
  ON public.student_registry (admission_number)
  WHERE admission_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS student_registry_email_key
  ON public.student_registry (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_registry_department
  ON public.student_registry (department_id);

CREATE INDEX IF NOT EXISTS idx_student_registry_programme
  ON public.student_registry (programme);

CREATE INDEX IF NOT EXISTS idx_student_registry_status
  ON public.student_registry (status);

ALTER TABLE public.student_registry ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_registry TO authenticated;

DROP POLICY IF EXISTS "Admins can manage student registry" ON public.student_registry;
CREATE POLICY "Admins can manage student registry"
  ON public.student_registry FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Students can view own registry row" ON public.student_registry;
CREATE POLICY "Students can view own registry row"
  ON public.student_registry FOR SELECT
  USING (profile_id = auth.uid());

DROP TRIGGER IF EXISTS update_student_registry_updated_at ON public.student_registry;
CREATE TRIGGER update_student_registry_updated_at
  BEFORE UPDATE ON public.student_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Registry module enrollments (external module codes) ────────────────────
CREATE TABLE IF NOT EXISTS public.student_registry_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id uuid NOT NULL REFERENCES public.student_registry(id) ON DELETE CASCADE,
  external_code text NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  mapping_status text NOT NULL DEFAULT 'unmapped'
    CHECK (mapping_status IN ('mapped', 'unmapped')),
  semester text,
  academic_year text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registry_id, external_code)
);

CREATE INDEX IF NOT EXISTS idx_registry_enrollments_external_code
  ON public.student_registry_enrollments (external_code);

CREATE INDEX IF NOT EXISTS idx_registry_enrollments_course
  ON public.student_registry_enrollments (course_id);

ALTER TABLE public.student_registry_enrollments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_registry_enrollments TO authenticated;

DROP POLICY IF EXISTS "Admins can manage registry enrollments" ON public.student_registry_enrollments;
CREATE POLICY "Admins can manage registry enrollments"
  ON public.student_registry_enrollments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Students can view own registry enrollments" ON public.student_registry_enrollments;
CREATE POLICY "Students can view own registry enrollments"
  ON public.student_registry_enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_registry r
      WHERE r.id = registry_id AND r.profile_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS update_registry_enrollments_updated_at ON public.student_registry_enrollments;
CREATE TRIGGER update_registry_enrollments_updated_at
  BEFORE UPDATE ON public.student_registry_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── External module code → internal course mapping ─────────────────────────
CREATE TABLE IF NOT EXISTS public.course_code_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_code text NOT NULL UNIQUE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_code_aliases_course
  ON public.course_code_aliases (course_id);

ALTER TABLE public.course_code_aliases ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_code_aliases TO authenticated;

DROP POLICY IF EXISTS "Admins can manage course code aliases" ON public.course_code_aliases;
CREATE POLICY "Admins can manage course code aliases"
  ON public.course_code_aliases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_course_code_aliases_updated_at ON public.course_code_aliases;
CREATE TRIGGER update_course_code_aliases_updated_at
  BEFORE UPDATE ON public.course_code_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Apply saved aliases to all currently unmapped registry enrollments.
CREATE OR REPLACE FUNCTION public.apply_course_code_aliases()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.student_registry_enrollments e
  SET course_id = a.course_id,
      mapping_status = 'mapped',
      updated_at = now()
  FROM public.course_code_aliases a
  WHERE e.external_code = a.external_code
    AND (e.course_id IS DISTINCT FROM a.course_id OR e.mapping_status <> 'mapped');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_course_code_aliases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_course_code_aliases() TO authenticated;

-- ─── Profile identity guard ─────────────────────────────────────────────────
-- Students may edit their name, phone and avatar, but not identity/academic
-- fields that drive attendance and roster reconciliation.
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted internal update (e.g. the password-change trigger).
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Service role (no JWT) and admins may change protected fields.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    NEW.must_change_password := OLD.must_change_password;
  END IF;
  IF NEW.university_id IS DISTINCT FROM OLD.university_id THEN
    NEW.university_id := OLD.university_id;
  END IF;
  IF NEW.admission_number IS DISTINCT FROM OLD.admission_number THEN
    NEW.admission_number := OLD.admission_number;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;
  END IF;
  IF NEW.gender IS DISTINCT FROM OLD.gender THEN
    NEW.gender := OLD.gender;
  END IF;
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    NEW.department_id := OLD.department_id;
  END IF;
  IF NEW.programme IS DISTINCT FROM OLD.programme THEN
    NEW.programme := OLD.programme;
  END IF;
  IF NEW.study_year IS DISTINCT FROM OLD.study_year THEN
    NEW.study_year := OLD.study_year;
  END IF;
  IF NEW.academic_year IS DISTINCT FROM OLD.academic_year THEN
    NEW.academic_year := OLD.academic_year;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_security_fields ON public.profiles;
CREATE TRIGGER protect_profile_security_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

-- ─── Reconciliation views ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_student_registry_reconciliation
WITH (security_invoker = true) AS
SELECT
  r.id AS registry_id,
  r.university_id,
  r.admission_number,
  r.full_name AS registry_name,
  r.department_id AS registry_department_id,
  r.programme AS registry_programme,
  r.gender AS registry_gender,
  r.profile_id,
  r.provisioned_at,
  p.full_name AS profile_name,
  p.department_id AS profile_department_id,
  p.programme AS profile_programme,
  p.gender AS profile_gender,
  CASE
    WHEN r.profile_id IS NULL THEN 'not_provisioned'
    WHEN p.id IS NULL THEN 'missing_profile'
    WHEN lower(coalesce(r.full_name, '')) <> lower(coalesce(p.full_name, '')) THEN 'name_mismatch'
    WHEN r.department_id IS DISTINCT FROM p.department_id THEN 'department_mismatch'
    WHEN r.gender IS DISTINCT FROM p.gender THEN 'gender_mismatch'
    WHEN lower(coalesce(r.programme, '')) <> lower(coalesce(p.programme, '')) THEN 'programme_mismatch'
    ELSE 'ok'
  END AS status
FROM public.student_registry r
LEFT JOIN public.profiles p ON p.id = r.profile_id;

GRANT SELECT ON public.v_student_registry_reconciliation TO authenticated;

CREATE OR REPLACE VIEW public.v_profiles_missing_registry
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.university_id,
  p.full_name,
  p.email,
  p.department_id,
  p.programme,
  p.gender,
  p.created_at
FROM public.profiles p
LEFT JOIN public.student_registry r ON r.university_id = p.university_id
WHERE r.id IS NULL
  AND p.university_id IS NOT NULL
  AND p.university_id <> '';

GRANT SELECT ON public.v_profiles_missing_registry TO authenticated;

-- ─── Audit triggers ─────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'student_registry', 'student_registry_enrollments', 'course_code_aliases'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_audit_event()',
      t, t
    );
  END LOOP;
END $$;
