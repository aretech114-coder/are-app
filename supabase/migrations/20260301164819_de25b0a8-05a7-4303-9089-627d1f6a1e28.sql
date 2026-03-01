
-- Allow conseillers to see assignments for mails they are assigned to
CREATE POLICY "Conseillers see own mail assignments"
ON public.mail_assignments
FOR SELECT
USING (
  assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.mail_assignments ma2
    WHERE ma2.mail_id = mail_assignments.mail_id
    AND ma2.assigned_to = auth.uid()
  )
);

-- Allow conseillers to see calendar events for mails they are assigned to
CREATE POLICY "Conseillers see related calendar events"
ON public.calendar_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mail_assignments
    WHERE mail_assignments.mail_id = calendar_events.mail_id
    AND mail_assignments.assigned_to = auth.uid()
  )
);
