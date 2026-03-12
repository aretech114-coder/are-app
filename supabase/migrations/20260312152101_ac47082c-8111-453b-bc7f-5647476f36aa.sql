
-- 1. Revoke public execute on add_app_role to prevent direct RPC bypass
REVOKE EXECUTE ON FUNCTION public.add_app_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_app_role(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_app_role(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_app_role(text) TO service_role;

-- 2. Fix calendar_events INSERT policy to enforce created_by = auth.uid()
DROP POLICY IF EXISTS "Insert events" ON public.calendar_events;
CREATE POLICY "Insert events"
ON public.calendar_events FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND created_by = auth.uid()
);
