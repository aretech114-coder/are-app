-- Allow reception role to insert mails
CREATE POLICY "Reception can insert mail"
ON public.mails
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'reception'::app_role));

-- Allow reception to see only mails they registered (for their dashboard)
CREATE POLICY "Reception sees own registered mail"
ON public.mails
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'reception'::app_role) AND registered_by = auth.uid());
