-- Fix: Prevent admin from inserting 'admin' role (self-propagation)
DROP POLICY IF EXISTS "Admins can insert non-superadmin roles" ON public.user_roles;

CREATE POLICY "Admins can insert non-superadmin roles"
ON public.user_roles
FOR INSERT
TO public
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> 'superadmin'::app_role
  AND role <> 'admin'::app_role
);