-- Migration AB — Inbox strict : list_my_mails sans bypass pilotage global
-- Le Suivi (/suivi) reste via list_workflow_tracking_mails + can_access_workflow_tracking()

CREATE OR REPLACE FUNCTION public.can_access_mail_inbox(_mail_id uuid, _mode text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user uuid;
  v_step integer;
  v_registered_by uuid;
  v_ministre_absent boolean;
  v_assigned_agent uuid;
  v_is_read boolean;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL OR _mail_id IS NULL THEN
    RETURN false;
  END IF;

  v_is_read := (_mode = 'read');

  SELECT m.current_step, m.registered_by, m.ministre_absent, m.assigned_agent_id
  INTO v_step, v_registered_by, v_ministre_absent, v_assigned_agent
  FROM public.mails m
  WHERE m.id = _mail_id;

  IF v_step IS NULL THEN
    RETURN false;
  END IF;

  -- Pas de bypass can_access_workflow_tracking() ici (Inbox = assigné / viewer / responsable)

  IF has_role(v_user, 'superadmin') OR has_role(v_user, 'admin') THEN
    RETURN true;
  END IF;

  IF has_role(v_user, 'reception') AND v_registered_by = v_user AND v_step = 1 THEN
    RETURN true;
  END IF;

  IF COALESCE(v_ministre_absent, false) AND v_step BETWEEN 2 AND 6 THEN
    IF v_assigned_agent = v_user THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number = 2
        AND ma.access_mode = 'custodian'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF has_role(v_user, 'dircab') OR has_role(v_user, 'dircaba')
     OR has_role(v_user, 'autorite_2') OR has_role(v_user, 'autorite_3')
     OR has_role(v_user, 'dga')
  THEN
    IF v_step IN (3, 5) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number IN (3, 5)
    ) THEN
      RETURN true;
    END IF;
    IF NOT v_is_read THEN
      RETURN false;
    END IF;
  END IF;

  IF has_role(v_user, 'directeur')
     OR has_role(v_user, 'ministre')
     OR has_role(v_user, 'dg')
     OR has_role(v_user, 'autorite_1')
  THEN
    IF v_step BETWEEN 2 AND 6 THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.access_mode = 'custodian'
    ) THEN
      RETURN true;
    END IF;
    IF v_is_read AND v_step >= 4 THEN
      RETURN true;
    END IF;
    IF NOT v_is_read AND v_step BETWEEN 2 AND 6 THEN
      RETURN true;
    END IF;
  END IF;

  -- Secrétariat : pas de visibilité globale aux étapes 8/9 — assignation / responsable / viewer ci-dessous

  IF EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.assigned_to = v_user
      AND (
        (v_is_read AND ma.access_mode = 'viewer')
        OR
        (ma.access_mode = 'contributor' AND ma.step_number = v_step
         AND ma.status IN ('pending', 'proposed', 'completed', 'submitted', 'acknowledged'))
        OR
        (v_is_read AND ma.access_mode = 'contributor' AND ma.step_number = 4
         AND ma.status IN ('proposed', 'pending', 'completed', 'submitted')
         AND v_step >= 2)
        OR
        (v_is_read AND ma.access_mode = 'viewer' AND ma.step_number = 4
         AND ma.status IN ('proposed', 'pending')
         AND v_step >= 2)
      )
  ) THEN
    IF v_is_read THEN
      RETURN true;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.access_mode = 'contributor'
        AND ma.step_number = v_step
        AND ma.status IN ('pending', 'proposed')
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_step_responsibles wsr
    WHERE wsr.step_number = v_step
      AND wsr.is_active = true
      AND wsr.default_user_id = v_user
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mails m
    WHERE m.id = _mail_id AND m.assigned_agent_id = v_user
  ) THEN
    RETURN v_is_read OR (v_step BETWEEN 2 AND 6);
  END IF;

  IF v_is_read AND EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.assigned_to = v_user
      AND ma.access_mode IN ('contributor', 'viewer', 'custodian')
  ) THEN
    RETURN true;
  END IF;

  IF v_is_read AND v_registered_by = v_user THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_mail_inbox(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_mails(
  _statuses text[] DEFAULT ARRAY['pending', 'in_progress']::text[]
)
RETURNS SETOF public.mails
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT m.*
  FROM public.mails m
  WHERE (_statuses IS NULL OR m.status::text = ANY(_statuses))
    AND public.can_access_mail_inbox(m.id, 'read')
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_mails(text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
