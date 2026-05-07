
-- Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL, -- INSERT | UPDATE | DELETE
  entity_type text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log" ON public.audit_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Block direct audit inserts" ON public.audit_log;
CREATE POLICY "Block direct audit inserts" ON public.audit_log
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct audit updates" ON public.audit_log;
CREATE POLICY "Block direct audit updates" ON public.audit_log
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Block direct audit deletes" ON public.audit_log;
CREATE POLICY "Block direct audit deletes" ON public.audit_log
  FOR DELETE USING (false);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.record_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _role text;
  _eid text;
BEGIN
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = _actor LIMIT 1;
  IF TG_OP = 'DELETE' THEN
    _eid := COALESCE((to_jsonb(OLD)->>'id'), '');
    INSERT INTO public.audit_log(actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
    VALUES (_actor, _role, TG_OP, TG_TABLE_NAME, _eid, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    _eid := COALESCE((to_jsonb(NEW)->>'id'), '');
    INSERT INTO public.audit_log(actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
    VALUES (_actor, _role, TG_OP, TG_TABLE_NAME, _eid, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    _eid := COALESCE((to_jsonb(NEW)->>'id'), '');
    INSERT INTO public.audit_log(actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
    VALUES (_actor, _role, TG_OP, TG_TABLE_NAME, _eid, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_audit_event() FROM PUBLIC;

-- Attach triggers
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'courses','sessions','attendance_records','course_enrollments','course_lecturers',
    'departments','levels','semesters','user_roles','excuses','profiles'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_audit_event()', t, t);
  END LOOP;
END $$;
