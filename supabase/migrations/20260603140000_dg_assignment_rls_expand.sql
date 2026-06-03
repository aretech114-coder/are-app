-- DG / autorités : lecture de tous les profils et rôles (assignation étape 2, intérim, admin workflow)

DROP POLICY IF EXISTS "Privileged roles read all roles" ON public.user_roles;
CREATE POLICY "Privileged roles read all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'daf'::public.app_role)
    OR public.has_role(auth.uid(), 'dt'::public.app_role)
  );

DROP POLICY IF EXISTS "Direction read all roles" ON public.user_roles;
CREATE POLICY "Direction read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dga'::public.app_role)
    OR public.has_role(auth.uid(), 'daf'::public.app_role)
    OR public.has_role(auth.uid(), 'dt'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
  );

DROP POLICY IF EXISTS "Direction can view profiles" ON public.profiles;
CREATE POLICY "Direction can view profiles"
  ON public.profiles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dga'::public.app_role)
    OR public.has_role(auth.uid(), 'daf'::public.app_role)
    OR public.has_role(auth.uid(), 'dt'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
  );

DROP POLICY IF EXISTS "Directeur can view profiles" ON public.profiles;
CREATE POLICY "Directeur can view profiles"
  ON public.profiles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
  );

NOTIFY pgrst, 'reload schema';
