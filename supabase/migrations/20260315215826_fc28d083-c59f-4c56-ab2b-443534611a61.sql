-- ============================================================
-- GRAVITY FLOW: Assignment-based visibility for mails
-- Only assigned users at the current step can see/update mail
-- ============================================================

-- 1) Remove broad role-based SELECT policies
DROP POLICY IF EXISTS "Ministre sees addressed mail" ON public.mails;
DROP POLICY IF EXISTS "Dircab sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Dircaba sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Conseiller juridique sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Secretariat sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Supervisors see all mail" ON public.mails;

-- 2) Remove broad role-based UPDATE policies
DROP POLICY IF EXISTS "Ministre can update mail" ON public.mails;
DROP POLICY IF EXISTS "Dircab can update mail" ON public.mails;
DROP POLICY IF EXISTS "Dircaba can update mail" ON public.mails;
DROP POLICY IF EXISTS "Conseiller juridique can update mail" ON public.mails;
DROP POLICY IF EXISTS "Secretariat can update mail" ON public.mails;

-- 3) Replace old assignment-based SELECT with step-aware version
DROP POLICY IF EXISTS "Conseillers see assigned mail via assignments" ON public.mails;
CREATE POLICY "Users see mail at assigned step"
ON public.mails
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM mail_assignments
    WHERE mail_assignments.mail_id = mails.id
    AND mail_assignments.assigned_to = auth.uid()
    AND mail_assignments.step_number = mails.current_step
  )
);

-- 4) Replace old assignment-based UPDATE with step-aware version
DROP POLICY IF EXISTS "Conseillers can update assigned mail via assignments" ON public.mails;
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
);