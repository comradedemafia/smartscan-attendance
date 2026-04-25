-- 1) Audit log of every OTP verification attempt
CREATE TABLE public.otp_verification_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID,
  success BOOLEAN NOT NULL,
  matched_offset INTEGER,
  failure_reason TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_log_user ON public.otp_verification_log(user_id, created_at DESC);
CREATE INDEX idx_otp_log_session ON public.otp_verification_log(session_id, created_at DESC);

ALTER TABLE public.otp_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own otp logs"
  ON public.otp_verification_log FOR SELECT
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'lecturer'));

CREATE POLICY "Block direct otp log inserts"
  ON public.otp_verification_log FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block direct otp log updates"
  ON public.otp_verification_log FOR UPDATE
  USING (false);

CREATE POLICY "Block direct otp log deletes"
  ON public.otp_verification_log FOR DELETE
  USING (false);

-- 2) Replay-protection: each accepted (session, user, counter) is unique
CREATE TABLE public.otp_replay_guard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID NOT NULL,
  counter BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id, counter)
);

CREATE INDEX idx_otp_replay_user_session ON public.otp_replay_guard(user_id, session_id);

ALTER TABLE public.otp_replay_guard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own replay guard"
  ON public.otp_replay_guard FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Block direct replay guard inserts"
  ON public.otp_replay_guard FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block direct replay guard updates"
  ON public.otp_replay_guard FOR UPDATE
  USING (false);

CREATE POLICY "Block direct replay guard deletes"
  ON public.otp_replay_guard FOR DELETE
  USING (false);