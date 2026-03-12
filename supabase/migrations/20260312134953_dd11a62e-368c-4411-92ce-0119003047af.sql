
-- Replace the overly permissive ALL policy with per-command policies
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Admins can read all roles
CREATE POLICY "Admins can read all roles"
ON public.user_roles
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert roles except superadmin
CREATE POLICY "Admins can insert non-superadmin roles"
ON public.user_roles
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND role != 'superadmin'::app_role);

-- Admins can update roles but not assign superadmin
CREATE POLICY "Admins can update non-superadmin roles"
ON public.user_roles
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role) AND role != 'superadmin'::app_role)
WITH CHECK (role != 'superadmin'::app_role);

-- Admins can delete roles except superadmin
CREATE POLICY "Admins can delete non-superadmin roles"
ON public.user_roles
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role) AND role != 'superadmin'::app_role);
