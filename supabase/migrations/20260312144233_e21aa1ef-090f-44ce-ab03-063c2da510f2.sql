-- 1. Drop overly permissive INSERT policy on mails
DROP POLICY IF EXISTS "Authenticated users can insert mail" ON public.mails;

-- 2. Drop overly permissive INSERT policy on calendar_events
DROP POLICY IF EXISTS "Insert events" ON public.calendar_events;

-- 3. Create role-restricted INSERT policy for calendar_events
CREATE POLICY "Authorized roles insert events"
ON public.calendar_events FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'ministre'::public.app_role) OR
    public.has_role(auth.uid(), 'dircab'::public.app_role) OR
    public.has_role(auth.uid(), 'dircaba'::public.app_role) OR
    public.has_role(auth.uid(), 'secretariat'::public.app_role)
  )
);