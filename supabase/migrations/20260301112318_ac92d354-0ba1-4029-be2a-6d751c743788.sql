
-- Allow ministre role to see all mail addressed to them
CREATE POLICY "Ministre sees addressed mail"
ON public.mails
FOR SELECT
USING (has_role(auth.uid(), 'ministre'::app_role));

-- Allow dircab to see and update mail
CREATE POLICY "Dircab sees all mail"
ON public.mails
FOR SELECT
USING (has_role(auth.uid(), 'dircab'::app_role));

CREATE POLICY "Dircab can update mail"
ON public.mails
FOR UPDATE
USING (has_role(auth.uid(), 'dircab'::app_role));

-- Allow dircaba to see assigned mail
CREATE POLICY "Dircaba sees all mail"
ON public.mails
FOR SELECT
USING (has_role(auth.uid(), 'dircaba'::app_role));

-- Allow conseiller_juridique to see assigned mail
CREATE POLICY "Conseiller juridique sees all mail"
ON public.mails
FOR SELECT
USING (has_role(auth.uid(), 'conseiller_juridique'::app_role));

-- Allow secretariat to see and insert mail
CREATE POLICY "Secretariat sees all mail"
ON public.mails
FOR SELECT
USING (has_role(auth.uid(), 'secretariat'::app_role));

CREATE POLICY "Secretariat can insert mail"
ON public.mails
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'secretariat'::app_role));
