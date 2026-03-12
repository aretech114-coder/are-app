
-- Fix 1: mail_assignments INSERT - restrict to authorized roles and enforce assigned_by = auth.uid()
DROP POLICY IF EXISTS "Authorized users can insert" ON public.mail_assignments;

CREATE POLICY "Authorized roles can insert assignments"
ON public.mail_assignments
FOR INSERT
TO public
WITH CHECK (
  assigned_by = auth.uid()
  AND (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dircab'::app_role)
    OR has_role(auth.uid(), 'dircaba'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  )
);

-- Fix 2: notifications INSERT - restrict to privileged roles
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Authorized roles can insert notifications"
ON public.notifications
FOR INSERT
TO public
WITH CHECK (
  has_role(auth.uid(), 'superadmin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dircab'::app_role)
  OR has_role(auth.uid(), 'dircaba'::app_role)
  OR has_role(auth.uid(), 'secretariat'::app_role)
  OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'ministre'::app_role)
);
