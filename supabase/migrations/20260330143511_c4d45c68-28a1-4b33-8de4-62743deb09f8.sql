
-- Excuses/Permission requests table
CREATE TABLE public.excuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.excuses ENABLE ROW LEVEL SECURITY;

-- Students can create their own excuses
CREATE POLICY "Students can create own excuses" ON public.excuses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND has_role(auth.uid(), 'student'));

-- Students can view own excuses
CREATE POLICY "Students can view own excuses" ON public.excuses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Lecturers can view excuses for their sessions
CREATE POLICY "Lecturers can view session excuses" ON public.excuses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = excuses.session_id AND s.created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
  );

-- Lecturers can update excuses (approve/reject) for their sessions
CREATE POLICY "Lecturers can update excuses" ON public.excuses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s WHERE s.id = excuses.session_id AND s.created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
  );

-- Admins full access
CREATE POLICY "Admins can manage excuses" ON public.excuses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Students can delete their own pending excuses
CREATE POLICY "Students can delete own pending excuses" ON public.excuses
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');
