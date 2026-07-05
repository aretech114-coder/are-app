-- Migration AK — Module GED interne (ged_documents + bucket)

CREATE TABLE IF NOT EXISTS public.ged_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  reference_number text,
  sender_name text,
  pdf_storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ged_documents_mail_id_key UNIQUE (mail_id)
);

CREATE INDEX IF NOT EXISTS idx_ged_documents_reference ON public.ged_documents(reference_number);
CREATE INDEX IF NOT EXISTS idx_ged_documents_sender ON public.ged_documents(sender_name);

ALTER TABLE public.ged_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ged_documents_select" ON public.ged_documents;
CREATE POLICY "ged_documents_select"
  ON public.ged_documents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'archiviste')
    OR public.can_access_mail(mail_id, 'read')
  );

DROP POLICY IF EXISTS "ged_documents_insert_service" ON public.ged_documents;
CREATE POLICY "ged_documents_insert_service"
  ON public.ged_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'archiviste')
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('ged-documents', 'ged-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "GED documents read" ON storage.objects;
CREATE POLICY "GED documents read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ged-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'archiviste'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR (
      split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.can_access_mail(split_part(name, '/', 1)::uuid, 'read')
    )
  )
);

DROP POLICY IF EXISTS "GED documents upload" ON storage.objects;
CREATE POLICY "GED documents upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ged-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'archiviste'::public.app_role)
  )
);

NOTIFY pgrst, 'reload schema';
