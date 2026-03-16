-- Workflow assignment configuration per step
CREATE TABLE IF NOT EXISTS public.workflow_step_responsibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number integer NOT NULL,
  assignment_mode text NOT NULL DEFAULT 'default_user',
  default_user_id uuid NULL,
  fallback_step_number integer NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_step_responsibles_step_number_key UNIQUE (step_number),
  CONSTRAINT workflow_step_responsibles_step_check CHECK (step_number BETWEEN 2 AND 9),
  CONSTRAINT workflow_step_responsibles_mode_check CHECK (
    assignment_mode IN ('default_user', 'default_user_with_fallback', 'dynamic_by_previous_step')
  ),
  CONSTRAINT workflow_step_responsibles_fallback_check CHECK (
    (assignment_mode = 'default_user_with_fallback' AND fallback_step_number IS NOT NULL)
    OR
    (assignment_mode <> 'default_user_with_fallback' AND fallback_step_number IS NULL)
  ),
  CONSTRAINT workflow_step_responsibles_default_user_fk
    FOREIGN KEY (default_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT workflow_step_responsibles_created_by_fk
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_responsibles_default_user
  ON public.workflow_step_responsibles(default_user_id);

ALTER TABLE public.workflow_step_responsibles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workflow responsibles are readable by workflow actors" ON public.workflow_step_responsibles;
CREATE POLICY "Workflow responsibles are readable by workflow actors"
ON public.workflow_step_responsibles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'superadmin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ministre'::app_role)
  OR has_role(auth.uid(), 'dircab'::app_role)
  OR has_role(auth.uid(), 'dircaba'::app_role)
  OR has_role(auth.uid(), 'secretariat'::app_role)
  OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
  OR has_role(auth.uid(), 'conseiller'::app_role)
);

DROP POLICY IF EXISTS "Workflow responsibles are manageable by delegated admins" ON public.workflow_step_responsibles;
CREATE POLICY "Workflow responsibles are manageable by delegated admins"
ON public.workflow_step_responsibles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.admin_permissions ap
      WHERE ap.permission_key = 'manage_workflow_assignments'
        AND ap.is_enabled = true
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.admin_permissions ap
      WHERE ap.permission_key = 'manage_workflow_assignments'
        AND ap.is_enabled = true
    )
  )
);

DROP TRIGGER IF EXISTS update_workflow_step_responsibles_updated_at ON public.workflow_step_responsibles;
CREATE TRIGGER update_workflow_step_responsibles_updated_at
BEFORE UPDATE ON public.workflow_step_responsibles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Resolve default assignee for a step (with fallback support)
CREATE OR REPLACE FUNCTION public.resolve_step_assignee(_step_number integer, _mail_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_user uuid;
  v_mode text;
  v_fallback_step integer;
  v_fallback_user uuid;
BEGIN
  SELECT wsr.default_user_id, wsr.assignment_mode, wsr.fallback_step_number
  INTO v_default_user, v_mode, v_fallback_step
  FROM public.workflow_step_responsibles wsr
  WHERE wsr.step_number = _step_number
    AND wsr.is_active = true
  LIMIT 1;

  IF v_default_user IS NOT NULL THEN
    RETURN v_default_user;
  END IF;

  IF v_mode = 'default_user_with_fallback' AND _mail_id IS NOT NULL THEN
    SELECT ma.assigned_to
    INTO v_fallback_user
    FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.step_number = v_fallback_step
    ORDER BY ma.created_at ASC
    LIMIT 1;

    RETURN v_fallback_user;
  END IF;

  RETURN NULL;
END;
$$;

-- Transition-window helper for RLS-safe multi-query workflow updates
CREATE OR REPLACE FUNCTION public.can_transition_update_mail(_mail_id uuid, _step integer, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workflow_transitions wt
    WHERE wt.mail_id = _mail_id
      AND wt.to_step = _step
      AND wt.performed_by = _user_id
      AND wt.created_at > now() - interval '15 minutes'
  );
$$;

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_mail_step_actor_time
  ON public.workflow_transitions(mail_id, to_step, performed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_assignments_mail_step_assignee
  ON public.mail_assignments(mail_id, step_number, assigned_to);

-- Harden and deconflict UPDATE policy on mails
DROP POLICY IF EXISTS "Users can update mail at assigned step" ON public.mails;
CREATE POLICY "Users can update mail at assigned step"
ON public.mails
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.mail_assignments ma
    WHERE ma.mail_id = mails.id
      AND ma.assigned_to = auth.uid()
      AND ma.step_number = mails.current_step
  )
  OR public.can_transition_update_mail(mails.id, mails.current_step, auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.mail_assignments ma
    WHERE ma.mail_id = mails.id
      AND ma.assigned_to = auth.uid()
      AND ma.step_number = mails.current_step
  )
  OR public.can_transition_update_mail(mails.id, mails.current_step, auth.uid())
);

DROP POLICY IF EXISTS "Assigned agents can update mail" ON public.mails;
CREATE POLICY "Assigned agents can update mail"
ON public.mails
FOR UPDATE
TO authenticated
USING (
  assigned_agent_id = auth.uid()
)
WITH CHECK (
  assigned_agent_id = auth.uid()
  OR public.can_transition_update_mail(mails.id, mails.current_step, auth.uid())
);
