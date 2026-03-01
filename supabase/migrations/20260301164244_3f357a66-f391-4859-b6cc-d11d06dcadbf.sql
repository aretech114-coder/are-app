
-- Allow conseillers to see mails they are assigned to via mail_assignments
CREATE POLICY "Conseillers see assigned mail via assignments"
ON public.mails
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mail_assignments
    WHERE mail_assignments.mail_id = mails.id
    AND mail_assignments.assigned_to = auth.uid()
  )
);

-- Allow conseillers to update mails they are assigned to via mail_assignments
CREATE POLICY "Conseillers can update assigned mail via assignments"
ON public.mails
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.mail_assignments
    WHERE mail_assignments.mail_id = mails.id
    AND mail_assignments.assigned_to = auth.uid()
  )
);
