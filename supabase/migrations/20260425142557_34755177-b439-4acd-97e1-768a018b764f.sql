-- Tighten audit log insert: only allow inserts from the trigger (security definer), block direct user inserts
DROP POLICY IF EXISTS "System can insert audit logs" ON public.enrollment_audit_log;
CREATE POLICY "Block direct audit inserts"
ON public.enrollment_audit_log FOR INSERT
WITH CHECK (false);
-- Note: trigger runs SECURITY DEFINER as table owner and bypasses RLS

-- Tighten deadline reminders: only service role / definer functions write
DROP POLICY IF EXISTS "Service can manage reminders" ON public.deadline_reminders_sent;
CREATE POLICY "Block direct reminder writes (insert)"
ON public.deadline_reminders_sent FOR INSERT
WITH CHECK (false);
CREATE POLICY "Block direct reminder writes (update)"
ON public.deadline_reminders_sent FOR UPDATE
USING (false);
CREATE POLICY "Block direct reminder writes (delete)"
ON public.deadline_reminders_sent FOR DELETE
USING (false);