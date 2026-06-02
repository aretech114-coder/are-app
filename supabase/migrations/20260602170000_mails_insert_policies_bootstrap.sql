-- Bootstrap policies INSERT sur mails (Production partielle)
-- Corrige: new row violates row-level security policy for table "mails"
-- Cause: "Authenticated users can insert mail" supprimée sans recréer les policies par rôle

DROP POLICY IF EXISTS "Reception can insert mail" ON public.mails;
CREATE POLICY "Reception can insert mail"
  ON public.mails FOR INSERT TO authenticated
  WITH CHECK (
    registered_by = auth.uid()
    AND public.has_role(auth.uid(), 'reception'::public.app_role)
  );

DROP POLICY IF EXISTS "Secretariat can insert mail" ON public.mails;
CREATE POLICY "Secretariat can insert mail"
  ON public.mails FOR INSERT TO authenticated
  WITH CHECK (
    registered_by = auth.uid()
    AND public.has_role(auth.uid(), 'secretariat'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin and SuperAdmin can insert mail" ON public.mails;
CREATE POLICY "Admin and SuperAdmin can insert mail"
  ON public.mails FOR INSERT TO authenticated
  WITH CHECK (
    registered_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

-- Réception : mise à jour de ses propres enregistrements (routage post-insert)
DROP POLICY IF EXISTS "Reception can update own registered mail" ON public.mails;
CREATE POLICY "Reception can update own registered mail"
  ON public.mails FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'reception'::public.app_role)
    AND registered_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'reception'::public.app_role)
    AND registered_by = auth.uid()
  );

-- Notifications : réception autorisée à notifier lors de l'enregistrement
DROP POLICY IF EXISTS "Authorized roles can insert notifications" ON public.notifications;
CREATE POLICY "Authorized roles can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'reception'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
  );

NOTIFY pgrst, 'reload schema';
