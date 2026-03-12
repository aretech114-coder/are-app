-- #2: Remove overly permissive user_roles SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read roles for routing" ON public.user_roles;

-- Add scoped policies for privileged roles that need to see other users' roles
CREATE POLICY "Privileged roles read all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'superadmin'::app_role) OR
  has_role(auth.uid(), 'dircab'::app_role) OR
  has_role(auth.uid(), 'dircaba'::app_role) OR
  has_role(auth.uid(), 'ministre'::app_role) OR
  has_role(auth.uid(), 'secretariat'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'conseiller_juridique'::app_role)
);

-- #5: Restrict missions INSERT to authorized roles
DROP POLICY IF EXISTS "Authorized insert missions" ON public.missions;

CREATE POLICY "Authorized insert missions"
ON public.missions FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    has_role(auth.uid(), 'superadmin'::app_role) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'dircab'::app_role) OR
    has_role(auth.uid(), 'ministre'::app_role)
  )
);