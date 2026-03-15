-- Fix 1: UPDATE policy needs WITH CHECK (true) so advancing current_step doesn't fail
DROP POLICY IF EXISTS "Users can update mail at assigned step" ON public.mails;
CREATE POLICY "Users can update mail at assigned step"
ON public.mails
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM mail_assignments
    WHERE mail_assignments.mail_id = mails.id
    AND mail_assignments.assigned_to = auth.uid()
    AND mail_assignments.step_number = mails.current_step
  )
)
WITH CHECK (true);

-- Fix 2: Add ministre and conseiller to mail_assignments INSERT policy
DROP POLICY IF EXISTS "Authorized roles can insert assignments" ON public.mail_assignments;
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
    OR has_role(auth.uid(), 'ministre'::app_role)
    OR has_role(auth.uid(), 'conseiller'::app_role)
  )
);