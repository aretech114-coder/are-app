-- Create private bucket for mail documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('mail-documents', 'mail-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for mail-documents bucket

-- Authorized roles can upload to mail-documents
CREATE POLICY "Authorized roles upload mail documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'mail-documents' AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
    public.has_role(auth.uid(), 'reception'::public.app_role) OR
    public.has_role(auth.uid(), 'dircab'::public.app_role) OR
    public.has_role(auth.uid(), 'dircaba'::public.app_role) OR
    public.has_role(auth.uid(), 'ministre'::public.app_role) OR
    public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role) OR
    public.has_role(auth.uid(), 'conseiller'::public.app_role) OR
    public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
);

-- Authorized roles can read mail documents
CREATE POLICY "Authorized roles read mail documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'mail-documents' AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
    public.has_role(auth.uid(), 'reception'::public.app_role) OR
    public.has_role(auth.uid(), 'dircab'::public.app_role) OR
    public.has_role(auth.uid(), 'dircaba'::public.app_role) OR
    public.has_role(auth.uid(), 'ministre'::public.app_role) OR
    public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role) OR
    public.has_role(auth.uid(), 'conseiller'::public.app_role) OR
    public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
);

-- Admins can delete mail documents
CREATE POLICY "Admins delete mail documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'mail-documents' AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);