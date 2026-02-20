
-- Notifications table for students
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (user_id = auth.uid());

-- Lecturers and admins can insert notifications
CREATE POLICY "Lecturers and admins can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'lecturer'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Function to notify enrolled students when session is created/activated
CREATE OR REPLACE FUNCTION public.notify_enrolled_students(
  _session_id UUID,
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'info'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _course_id UUID;
  _subject_id UUID;
BEGIN
  SELECT course_id, subject_id INTO _course_id, _subject_id
  FROM sessions WHERE id = _session_id;

  -- Notify course-enrolled students
  INSERT INTO notifications (user_id, title, message, type, session_id)
  SELECT DISTINCT ce.user_id, _title, _message, _type, _session_id
  FROM course_enrollments ce
  WHERE ce.course_id = _course_id
  ON CONFLICT DO NOTHING;
END;
$$;
