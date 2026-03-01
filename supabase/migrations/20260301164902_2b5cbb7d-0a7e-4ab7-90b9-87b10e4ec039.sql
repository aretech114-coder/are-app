
-- Allow conseillers to view profiles (needed to resolve names in Step4ContextPanel)
CREATE POLICY "Conseillers can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'conseiller'::app_role));
