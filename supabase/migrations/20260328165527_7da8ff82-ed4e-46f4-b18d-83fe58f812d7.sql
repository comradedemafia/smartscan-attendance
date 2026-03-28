
-- Add TOTP secret column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret text;

-- Create attendance OTP verification table
CREATE TABLE IF NOT EXISTS public.attendance_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  otp_code text NOT NULL,
  method text NOT NULL DEFAULT 'sms',
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_otp ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view their own OTP records
CREATE POLICY "Users can view own OTP" ON public.attendance_otp
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role has full access (used by edge functions)
CREATE POLICY "Service role full access" ON public.attendance_otp
  FOR ALL TO service_role
  USING (true);
