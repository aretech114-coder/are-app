-- Replace permissive WITH CHECK(true) with a bounded workflow-aware check
DROP POLICY IF EXISTS "Users can update mail at assigned step" ON public.mails;

CREATE POLICY "Users can update mail at assigned step"
ON public.mails
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.mail_assignments ma
    WHERE ma.mail_id = mails.id
      AND ma.assigned_to = auth.uid()
      AND ma.step_number = mails.current_step
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.mail_assignments ma
    WHERE ma.mail_id = mails.id
      AND ma.assigned_to = auth.uid()
      AND ma.step_number = mails.current_step
  )
  OR EXISTS (
    SELECT 1
    FROM public.workflow_transitions wt
    WHERE wt.mail_id = mails.id
      AND wt.to_step = mails.current_step
      AND wt.performed_by = auth.uid()
      AND wt.created_at > now() - interval '2 minutes'
  )
);