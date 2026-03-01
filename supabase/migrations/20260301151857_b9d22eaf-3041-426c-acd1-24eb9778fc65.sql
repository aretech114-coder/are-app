-- Allow superadmin to view all profiles
CREATE POLICY "SuperAdmin can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Allow superadmin to update any profile
CREATE POLICY "SuperAdmin can update any profile"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'superadmin'::app_role));