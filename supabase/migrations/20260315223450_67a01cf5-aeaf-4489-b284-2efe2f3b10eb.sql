-- Ensure workflow updates do not fail when current_step changes during the same UPDATE
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
WITH CHECK (true);