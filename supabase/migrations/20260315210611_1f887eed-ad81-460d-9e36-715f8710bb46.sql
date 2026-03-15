
-- 1. Allow reception to UPDATE mails they registered (for auto-routing after insert)
CREATE POLICY "Reception can update own registered mail"
ON public.mails FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'reception'::app_role) AND registered_by = auth.uid());

-- 2. Allow reception to INSERT workflow_transitions
CREATE POLICY "Reception can insert transitions"
ON public.workflow_transitions FOR INSERT
TO authenticated
WITH CHECK (performed_by = auth.uid() AND has_role(auth.uid(), 'reception'::app_role));

-- 3. Allow reception to INSERT notifications
CREATE POLICY "Reception can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'reception'::app_role));

-- 4. Allow reception to read workflow_transitions for their mails
CREATE POLICY "Reception read own mail transitions"
ON public.workflow_transitions FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'reception'::app_role) AND EXISTS (
  SELECT 1 FROM mails WHERE mails.id = workflow_transitions.mail_id AND mails.registered_by = auth.uid()
));

-- 5. Allow reception to INSERT mail_assignments (for auto-routing)
CREATE POLICY "Reception can insert assignments"
ON public.mail_assignments FOR INSERT
TO authenticated
WITH CHECK (assigned_by = auth.uid() AND has_role(auth.uid(), 'reception'::app_role));

-- 6. Allow reception to read SLA config (already covered by "Authenticated read sla" policy)
-- No action needed

-- 7. Allow reception to read mail_assignments for their mails
CREATE POLICY "Reception see own mail assignments"
ON public.mail_assignments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'reception'::app_role) AND EXISTS (
  SELECT 1 FROM mails WHERE mails.id = mail_assignments.mail_id AND mails.registered_by = auth.uid()
));
