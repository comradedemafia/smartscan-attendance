
CREATE OR REPLACE FUNCTION public.notify_users_by_role(
  _role app_role,
  _title text,
  _message text,
  _type text DEFAULT 'info'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message, type)
  SELECT ur.user_id, _title, _message, _type
  FROM user_roles ur
  WHERE ur.role = _role;
END;
$$;
