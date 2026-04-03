
ALTER TABLE public.excuses ADD COLUMN attachment_url text DEFAULT NULL;

-- Create storage bucket for excuse attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('excuse-attachments', 'excuse-attachments', true);

-- Storage policies: students can upload to their own folder
CREATE POLICY "Students can upload excuse attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'excuse-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone authenticated can view excuse attachments
CREATE POLICY "Authenticated can view excuse attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'excuse-attachments');

-- Students can delete own attachments
CREATE POLICY "Students can delete own excuse attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'excuse-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
