CREATE POLICY "SuperAdmin can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'superadmin'::app_role));