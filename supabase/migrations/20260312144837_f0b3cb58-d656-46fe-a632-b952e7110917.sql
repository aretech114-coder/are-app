-- 1. Fix mails INSERT: add registered_by = auth.uid() to Reception policy
DROP POLICY IF EXISTS "Reception can insert mail" ON public.mails;
CREATE POLICY "Reception can insert mail"
ON public.mails FOR INSERT TO authenticated
WITH CHECK (
  registered_by = auth.uid() AND
  public.has_role(auth.uid(), 'reception'::public.app_role)
);

-- 2. Fix mails INSERT: add registered_by = auth.uid() to Secretariat policy
DROP POLICY IF EXISTS "Secretariat can insert mail" ON public.mails;
CREATE POLICY "Secretariat can insert mail"
ON public.mails FOR INSERT TO authenticated
WITH CHECK (
  registered_by = auth.uid() AND
  public.has_role(auth.uid(), 'secretariat'::public.app_role)
);

-- 3. Restrict site_settings SELECT to admin roles only
DROP POLICY IF EXISTS "Authenticated read site_settings" ON public.site_settings;
CREATE POLICY "Authorized roles read site_settings"
ON public.site_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'superadmin'::public.app_role) OR
  public.has_role(auth.uid(), 'admin'::public.app_role) OR
  public.has_role(auth.uid(), 'ministre'::public.app_role) OR
  public.has_role(auth.uid(), 'dircab'::public.app_role) OR
  public.has_role(auth.uid(), 'dircaba'::public.app_role) OR
  public.has_role(auth.uid(), 'secretariat'::public.app_role) OR
  public.has_role(auth.uid(), 'reception'::public.app_role) OR
  public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role) OR
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
);