-- Allow lecturers to enter a custom venue name while keeping basic validation.
-- Admins may still set any value (including null).

CREATE OR REPLACE FUNCTION public.validate_session_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.venue_name IS NOT NULL THEN
    IF length(btrim(NEW.venue_name)) < 2 OR length(btrim(NEW.venue_name)) > 120 THEN
      RAISE EXCEPTION 'Venue name must be between 2 and 120 characters';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_session_venue ON public.sessions;
CREATE TRIGGER trg_validate_session_venue
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_session_venue();
