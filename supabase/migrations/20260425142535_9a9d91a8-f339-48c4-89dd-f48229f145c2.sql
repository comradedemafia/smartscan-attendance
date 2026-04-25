-- Audit log for course enrollment changes
CREATE TABLE IF NOT EXISTS public.enrollment_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('enrolled','unenrolled')),
  module_type TEXT NOT NULL CHECK (module_type IN ('core','optional')),
  deadline_status TEXT,
  selection_deadline TIMESTAMP WITH TIME ZONE,
  performed_by UUID,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON public.enrollment_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_course ON public.enrollment_audit_log(course_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.enrollment_audit_log(created_at DESC);

ALTER TABLE public.enrollment_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own audit logs"
ON public.enrollment_audit_log FOR SELECT
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'lecturer'::app_role));

CREATE POLICY "System can insert audit logs"
ON public.enrollment_audit_log FOR INSERT
WITH CHECK (true);

-- Trigger function: log enrollment insert
CREATE OR REPLACE FUNCTION public.log_enrollment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_core BOOLEAN;
  _deadline TIMESTAMP WITH TIME ZONE;
  _mtype TEXT;
  _dstatus TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT is_core, selection_deadline INTO _is_core, _deadline
    FROM public.courses WHERE id = NEW.course_id;
    _mtype := CASE WHEN COALESCE(_is_core, true) THEN 'core' ELSE 'optional' END;
    _dstatus := CASE
      WHEN _deadline IS NULL THEN 'no_deadline'
      WHEN _deadline > now() THEN 'before_deadline'
      ELSE 'after_deadline'
    END;
    INSERT INTO public.enrollment_audit_log
      (course_id, user_id, action, module_type, deadline_status, selection_deadline, performed_by, reason)
    VALUES
      (NEW.course_id, NEW.user_id, 'enrolled', _mtype, _dstatus, _deadline, auth.uid(),
       CASE WHEN _mtype = 'core' THEN 'Auto-enrolled (core module)'
            ELSE 'Self-selected optional module' END);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT is_core, selection_deadline INTO _is_core, _deadline
    FROM public.courses WHERE id = OLD.course_id;
    _mtype := CASE WHEN COALESCE(_is_core, true) THEN 'core' ELSE 'optional' END;
    _dstatus := CASE
      WHEN _deadline IS NULL THEN 'no_deadline'
      WHEN _deadline > now() THEN 'before_deadline'
      ELSE 'after_deadline'
    END;
    INSERT INTO public.enrollment_audit_log
      (course_id, user_id, action, module_type, deadline_status, selection_deadline, performed_by, reason)
    VALUES
      (OLD.course_id, OLD.user_id, 'unenrolled', _mtype, _dstatus, _deadline, auth.uid(),
       CASE WHEN _mtype = 'core' THEN 'Removed from core module'
            ELSE 'Left optional module' END);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_enrollment_insert ON public.course_enrollments;
CREATE TRIGGER trg_log_enrollment_insert
AFTER INSERT ON public.course_enrollments
FOR EACH ROW EXECUTE FUNCTION public.log_enrollment_change();

DROP TRIGGER IF EXISTS trg_log_enrollment_delete ON public.course_enrollments;
CREATE TRIGGER trg_log_enrollment_delete
AFTER DELETE ON public.course_enrollments
FOR EACH ROW EXECUTE FUNCTION public.log_enrollment_change();

-- Track sent deadline reminders to avoid duplicates
CREATE TABLE IF NOT EXISTS public.deadline_reminders_sent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL,
  user_id UUID NOT NULL,
  threshold TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id, threshold)
);

ALTER TABLE public.deadline_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reminders sent"
ON public.deadline_reminders_sent FOR SELECT
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can manage reminders"
ON public.deadline_reminders_sent FOR ALL
USING (true) WITH CHECK (true);