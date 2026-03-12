
-- Fix workflow_transitions: restrict SELECT and INSERT to involved users/roles

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated read transitions" ON public.workflow_transitions;
DROP POLICY IF EXISTS "Authenticated insert transitions" ON public.workflow_transitions;

-- SELECT: privileged roles see all, others only see transitions for mails they're assigned to
CREATE POLICY "Privileged roles read all transitions"
ON public.workflow_transitions
FOR SELECT TO public
USING (
  has_role(auth.uid(), 'superadmin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dircab'::app_role)
  OR has_role(auth.uid(), 'dircaba'::app_role)
  OR has_role(auth.uid(), 'secretariat'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'ministre'::app_role)
  OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
);

CREATE POLICY "Users read own mail transitions"
ON public.workflow_transitions
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM mail_assignments
    WHERE mail_assignments.mail_id = workflow_transitions.mail_id
      AND mail_assignments.assigned_to = auth.uid()
  )
  OR performed_by = auth.uid()
);

-- INSERT: only authorized roles can record transitions, and must be the performer
CREATE POLICY "Authorized roles insert transitions"
ON public.workflow_transitions
FOR INSERT TO public
WITH CHECK (
  performed_by = auth.uid()
  AND (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dircab'::app_role)
    OR has_role(auth.uid(), 'dircaba'::app_role)
    OR has_role(auth.uid(), 'secretariat'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'ministre'::app_role)
    OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
    OR has_role(auth.uid(), 'conseiller'::app_role)
  )
);
