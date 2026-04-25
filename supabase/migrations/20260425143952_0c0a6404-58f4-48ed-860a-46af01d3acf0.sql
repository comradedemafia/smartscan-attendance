-- Fix WARN: Public Bucket Allows Listing
-- Restrict SELECT on avatars and excuse-attachments so users can only access their own files
-- (folder is named after auth.uid())

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view excuse attachments" ON storage.objects;

-- Avatars: each user can read only their own avatar (foldername = uid)
CREATE POLICY "Users can view own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Avatars: lecturers and admins can view any avatar (needed for rosters / displays)
CREATE POLICY "Staff can view all avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'lecturer'::app_role)
  )
);

-- Excuse attachments: owner only
CREATE POLICY "Students can view own excuse attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'excuse-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Excuse attachments: lecturer/admin can view (needed to review excuses)
CREATE POLICY "Staff can view excuse attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'excuse-attachments'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'lecturer'::app_role)
  )
);