
-- Drop the recursive policy causing the infinite loop
DROP POLICY IF EXISTS "Conseillers see own mail assignments" ON public.mail_assignments;

-- Replace with a simple non-recursive policy
CREATE POLICY "Conseillers see own mail assignments"
ON public.mail_assignments
FOR SELECT
USING (assigned_to = auth.uid() OR assigned_by = auth.uid());
