
-- Allow ministre, dircab, dircaba, conseiller_juridique, secretariat to read profiles for assignments
CREATE POLICY "Ministre can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'ministre'::app_role));

CREATE POLICY "Dircab can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'dircab'::app_role));

CREATE POLICY "Dircaba can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'dircaba'::app_role));

CREATE POLICY "Conseiller can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'conseiller_juridique'::app_role));

CREATE POLICY "Secretariat can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'secretariat'::app_role));
