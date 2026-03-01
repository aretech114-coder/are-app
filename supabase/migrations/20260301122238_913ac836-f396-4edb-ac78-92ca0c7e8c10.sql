
-- Allow authenticated users to read user_roles for workflow routing
CREATE POLICY "Authenticated users can read roles for routing"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

-- Also allow secretariat to update mails (for auto-routing after insert)
CREATE POLICY "Secretariat can update mail"
ON public.mails
FOR UPDATE
USING (has_role(auth.uid(), 'secretariat'::app_role));
