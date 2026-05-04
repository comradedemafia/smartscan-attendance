-- Allow lecturers to create sessions for modules they're ASSIGNED to via course_lecturers
-- (not only modules they created), and restrict venue_name to allowed list.

DROP POLICY IF EXISTS "Lecturers and admins can create sessions" ON public.sessions;

CREATE POLICY "Lecturers and admins can create sessions"
ON public.sessions
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'lecturer'::app_role)
    AND created_by = auth.uid()
    AND (
      -- Module they created (legacy)
      EXISTS (SELECT 1 FROM public.courses c WHERE c.id = sessions.course_id AND c.created_by = auth.uid())
      -- OR module admin assigned them to
      OR EXISTS (SELECT 1 FROM public.course_lecturers cl WHERE cl.course_id = sessions.course_id AND cl.lecturer_id = auth.uid())
    )
  )
);

-- Validate venue_name against allowed institutional list (lecturers only — admin can override)
CREATE OR REPLACE FUNCTION public.validate_session_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins may set any venue (or null)
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Lecturers must pick from allowed list when venue is provided
  IF NEW.venue_name IS NOT NULL AND NEW.venue_name NOT IN (
    'VIP','NGUVANA HALL','MSIGALA HALL','LIBRARY','COMPUTER ROOM','OLD LIBRARY'
  ) THEN
    RAISE EXCEPTION 'Invalid venue. Allowed: VIP, NGUVANA HALL, MSIGALA HALL, LIBRARY, COMPUTER ROOM, OLD LIBRARY';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_session_venue ON public.sessions;
CREATE TRIGGER trg_validate_session_venue
BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_session_venue();