-- ============================================================
-- Bootstrap Storage : mail-incoming + mail-documents + branding
-- Courriers principaux (formulaires) → mail-incoming/YYYY/MM/REF/
-- Workflow (annotations, traitements) → mail-documents/
-- Idempotent — safe to re-run
-- ============================================================

-- 1) Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('mail-incoming',  'mail-incoming',  false),
  ('mail-documents', 'mail-documents', false),
  ('branding',       'branding',       true),
  ('avatars',        'avatars',        true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ---- mail-incoming : INSERT (upload formulaires) ----
DROP POLICY IF EXISTS "Incoming mail upload by authorized roles" ON storage.objects;
CREATE POLICY "Incoming mail upload by authorized roles"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'mail-incoming'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'reception'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
);

-- ---- mail-incoming : SELECT (lecture courriers principaux) ----
DROP POLICY IF EXISTS "Incoming mail read by authorized roles" ON storage.objects;
CREATE POLICY "Incoming mail read by authorized roles"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'mail-incoming'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'reception'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.assigned_to = auth.uid()
    )
  )
);

-- ---- mail-incoming : DELETE (admin seulement) ----
DROP POLICY IF EXISTS "Incoming mail delete by admin" ON storage.objects;
CREATE POLICY "Incoming mail delete by admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'mail-incoming'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- ---- mail-documents : policies workflow (annotations, traitements) ----
DROP POLICY IF EXISTS "Authorized roles upload mail documents" ON storage.objects;
CREATE POLICY "Authorized roles upload mail documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'mail-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'reception'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dga'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'chef_departement'::public.app_role)
    OR public.has_role(auth.uid(), 'collaborateur'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.assigned_to = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Authorized roles read mail documents" ON storage.objects;
CREATE POLICY "Authorized roles read mail documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'mail-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'reception'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dga'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'chef_departement'::public.app_role)
    OR public.has_role(auth.uid(), 'collaborateur'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.assigned_to = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins delete mail documents" ON storage.objects;
CREATE POLICY "Admins delete mail documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'mail-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- ---- branding (config système) ----
DROP POLICY IF EXISTS "Public read branding" ON storage.objects;
CREATE POLICY "Public read branding"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admin upload branding" ON storage.objects;
CREATE POLICY "Admin upload branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admin update branding" ON storage.objects;
CREATE POLICY "Admin update branding"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admin delete branding" ON storage.objects;
CREATE POLICY "Admin delete branding"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
