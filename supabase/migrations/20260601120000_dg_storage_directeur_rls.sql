-- DG (directeur) : autoriser upload/lecture des pièces jointes workflow (bucket mail-documents)
-- Cause typique : "new row violates row-level security policy" à l'étape 2 avec fichier joint

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
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
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
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
);

GRANT EXECUTE ON FUNCTION public.advance_workflow_step(
  uuid, text, uuid, text, boolean, uuid[]
) TO authenticated;
