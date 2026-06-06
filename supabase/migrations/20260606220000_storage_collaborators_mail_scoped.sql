-- Co-assignés (contributor + viewer) : lecture Storage mail-documents scoping par mail_id
-- Path attendu : treatments/{mail_id}/… ou annotations/{mail_id}/…

CREATE OR REPLACE FUNCTION public.storage_mail_id_from_documents_path(_object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(_object_name, '/', 1) IN ('treatments', 'annotations')
      AND split_part(_object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_object_name, '/', 2)::uuid
    ELSE NULL
  END;
$$;

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
    OR (
      public.storage_mail_id_from_documents_path(name) IS NOT NULL
      AND public.can_access_mail(public.storage_mail_id_from_documents_path(name), 'read')
    )
  )
);

NOTIFY pgrst, 'reload schema';
