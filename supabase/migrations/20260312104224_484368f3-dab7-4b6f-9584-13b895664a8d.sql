
-- Create branding storage bucket (public so images are accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true);

-- Allow authenticated users to read branding files
CREATE POLICY "Public read branding" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

-- Only superadmin/admin can upload branding files
CREATE POLICY "Admin upload branding" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'branding'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Only superadmin/admin can update branding files
CREATE POLICY "Admin update branding" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'branding'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Only superadmin/admin can delete branding files
CREATE POLICY "Admin delete branding" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'branding'
    AND (
      public.has_role(auth.uid(), 'superadmin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );
