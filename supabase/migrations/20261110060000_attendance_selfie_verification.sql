ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS selfie_path text,
  ADD COLUMN IF NOT EXISTS face_match_distance double precision,
  ADD COLUMN IF NOT EXISTS gender_match boolean,
  ADD COLUMN IF NOT EXISTS face_gender text,
  ADD COLUMN IF NOT EXISTS face_verified boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Students can record own attendance" ON public.attendance_records;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-selfies',
  'attendance-selfies',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can view own attendance selfies" ON storage.objects;
CREATE POLICY "Users can view own attendance selfies"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Staff can view attendance selfies" ON storage.objects;
CREATE POLICY "Staff can view attendance selfies"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'lecturer')
  )
);
