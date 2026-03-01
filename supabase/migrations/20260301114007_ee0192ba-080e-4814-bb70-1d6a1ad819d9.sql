-- Allow Ministre to update mail (needed for workflow transitions)
CREATE POLICY "Ministre can update mail"
ON public.mails
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'ministre'::app_role));
