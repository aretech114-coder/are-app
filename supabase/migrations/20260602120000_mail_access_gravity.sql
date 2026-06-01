-- Gravity access model: assignment-based mail visibility + mail_contributions
-- DirCab: steps 3 and 5 only (global read on those steps). Admin/superadmin: all.

-- ---------------------------------------------------------------------------
-- 0. Bootstrap colonnes / tables manquantes (base Staging partielle)
-- ---------------------------------------------------------------------------
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 1;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS deadline_at timestamptz;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS mail_type text DEFAULT 'standard';
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS workflow_started_at timestamptz DEFAULT now();
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS workflow_completed_at timestamptz;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS ministre_absent boolean NOT NULL DEFAULT false;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.mails SET current_step = 1 WHERE current_step IS NULL;

CREATE TABLE IF NOT EXISTS public.mail_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  step_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  instructions text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.mail_assignments ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.mail_assignments ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;
ALTER TABLE public.mail_assignments ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE TABLE IF NOT EXISTS public.workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  from_step integer NOT NULL,
  to_step integer NOT NULL,
  action text NOT NULL,
  performed_by uuid NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  mail_id uuid REFERENCES public.mails(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number integer NOT NULL UNIQUE,
  step_name text NOT NULL,
  default_hours integer NOT NULL DEFAULT 48,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_order integer NOT NULL,
  name text NOT NULL,
  description text,
  responsible_role text,
  is_active boolean NOT NULL DEFAULT true,
  conditions jsonb DEFAULT '{}'::jsonb,
  action_labels jsonb DEFAULT '{}'::jsonb,
  assignment_mode text DEFAULT 'default_user',
  color_class text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.mail_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1. mail_assignments.access_mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.mail_assignments
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'contributor';

ALTER TABLE public.mail_assignments
  DROP CONSTRAINT IF EXISTS mail_assignments_access_mode_check;

ALTER TABLE public.mail_assignments
  ADD CONSTRAINT mail_assignments_access_mode_check
  CHECK (access_mode IN ('custodian', 'contributor', 'viewer'));

-- ---------------------------------------------------------------------------
-- 2. mail_contributions (per-user treatment at step 4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_number integer NOT NULL DEFAULT 4,
  body text,
  attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_contributions_status_check CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT mail_contributions_mail_user_step_key UNIQUE (mail_id, user_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_mail_contributions_mail_id
  ON public.mail_contributions(mail_id);

ALTER TABLE public.mail_contributions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. can_access_mail(_mail_id, _mode)  _mode: 'read' | 'write'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_mail(_mail_id uuid, _mode text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_step integer;
  v_registered_by uuid;
  v_is_read boolean;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL OR _mail_id IS NULL THEN
    RETURN false;
  END IF;

  v_is_read := (_mode = 'read');

  SELECT m.current_step, m.registered_by
  INTO v_step, v_registered_by
  FROM public.mails m
  WHERE m.id = _mail_id;

  IF v_step IS NULL THEN
    RETURN false;
  END IF;

  -- Admin / superadmin
  IF has_role(v_user, 'superadmin') OR has_role(v_user, 'admin') THEN
    RETURN true;
  END IF;

  -- Reception: own registrations at step 1
  IF has_role(v_user, 'reception') AND v_registered_by = v_user AND v_step = 1 THEN
    RETURN true;
  END IF;

  -- DirCab: mails at steps 3 or 5, or assigned on those steps
  IF has_role(v_user, 'dircab') THEN
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

  -- DG roles: custodian / steps 2, 4, 6 visibility
  IF has_role(v_user, 'directeur')
     OR has_role(v_user, 'ministre')
     OR has_role(v_user, 'dg')
     OR has_role(v_user, 'autorite_1')
  THEN
    IF v_step IN (2, 4, 6) THEN
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
    -- Read contributions while mail at step 4+
    IF v_is_read AND v_step >= 4 THEN
      RETURN true;
    END IF;
    IF NOT v_is_read AND v_step IN (2, 6) THEN
      RETURN true;
    END IF;
  END IF;

  -- Assignment-based access
  IF EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.assigned_to = v_user
      AND (
        -- Viewer: read-only anytime
        (v_is_read AND ma.access_mode = 'viewer')
        OR
        -- Contributor at current step
        (ma.access_mode = 'contributor' AND ma.step_number = v_step
         AND ma.status IN ('pending', 'proposed', 'completed', 'submitted', 'acknowledged'))
        OR
        -- Proposed step-4: read only once mail reached step 4+
        (v_is_read AND ma.access_mode = 'contributor' AND ma.step_number = 4
         AND ma.status = 'proposed' AND v_step >= 4)
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
        AND ma.status IN ('pending', 'proposed', 'completed', 'submitted')
    );
  END IF;

  -- Workflow step default responsible (e.g. DG at step 2)
  IF v_is_read AND EXISTS (
    SELECT 1 FROM public.workflow_step_responsibles wsr
    WHERE wsr.step_number = v_step
      AND wsr.is_active = true
      AND wsr.default_user_id = v_user
  ) THEN
    RETURN true;
  END IF;

  -- Legacy assigned_agent_id
  IF EXISTS (
    SELECT 1 FROM public.mails m
    WHERE m.id = _mail_id AND m.assigned_agent_id = v_user
  ) THEN
    RETURN v_is_read;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_mail(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Drop conflicting mails SELECT/UPDATE policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins see all mail" ON public.mails;
DROP POLICY IF EXISTS "Supervisors see all mail" ON public.mails;
DROP POLICY IF EXISTS "Agents see assigned mail" ON public.mails;
DROP POLICY IF EXISTS "Ministre sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Ministre sees addressed mail" ON public.mails;
DROP POLICY IF EXISTS "DirCab sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Dircab sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Dircaba sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Conseiller juridique sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Secretariat sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Direction sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Conseillers see assigned mail via assignments" ON public.mails;
DROP POLICY IF EXISTS "Users see mail at assigned step" ON public.mails;
DROP POLICY IF EXISTS "SuperAdmin sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Reception sees province mail" ON public.mails;

DROP POLICY IF EXISTS "Admins can update any mail" ON public.mails;
DROP POLICY IF EXISTS "Assigned agents can update mail" ON public.mails;
DROP POLICY IF EXISTS "Users can update mail at assigned step" ON public.mails;
DROP POLICY IF EXISTS "Ministre can update mail" ON public.mails;
DROP POLICY IF EXISTS "Dircab can update mail" ON public.mails;
DROP POLICY IF EXISTS "Dircaba can update mail" ON public.mails;
DROP POLICY IF EXISTS "Conseiller juridique can update mail" ON public.mails;
DROP POLICY IF EXISTS "Secretariat can update mail" ON public.mails;
DROP POLICY IF EXISTS "Direction can update mail" ON public.mails;
DROP POLICY IF EXISTS "Conseillers can update assigned mail via assignments" ON public.mails;
DROP POLICY IF EXISTS "Reception can update own registered mail" ON public.mails;

-- Keep insert/delete for admins + reception policies added elsewhere if needed
CREATE POLICY "mails_select_by_access"
  ON public.mails FOR SELECT TO authenticated
  USING (public.can_access_mail(id, 'read'));

CREATE POLICY "mails_update_by_access"
  ON public.mails FOR UPDATE TO authenticated
  USING (public.can_access_mail(id, 'write'))
  WITH CHECK (public.can_access_mail(id, 'write'));

-- Admin delete preserved
DROP POLICY IF EXISTS "Admins can delete mail" ON public.mails;
CREATE POLICY "Admins can delete mail"
  ON public.mails FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

-- ---------------------------------------------------------------------------
-- 5. mail_assignments RLS (simplified)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users see own assignments" ON public.mail_assignments;
DROP POLICY IF EXISTS "Admins see all assignments" ON public.mail_assignments;
DROP POLICY IF EXISTS "Direction sees all assignments" ON public.mail_assignments;

CREATE POLICY "mail_assignments_select_by_mail_access"
  ON public.mail_assignments FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

CREATE POLICY "mail_assignments_insert_authorized"
  ON public.mail_assignments FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
  );

CREATE POLICY "mail_assignments_update_own_or_admin"
  ON public.mail_assignments FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'superadmin')
  );

-- ---------------------------------------------------------------------------
-- 6. workflow_transitions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read transitions" ON public.workflow_transitions;
DROP POLICY IF EXISTS "Authenticated insert transitions" ON public.workflow_transitions;
DROP POLICY IF EXISTS "Authorized roles insert transitions" ON public.workflow_transitions;
DROP POLICY IF EXISTS "Privileged roles read all transitions" ON public.workflow_transitions;
DROP POLICY IF EXISTS "Direction insert transitions" ON public.workflow_transitions;
DROP POLICY IF EXISTS "Direction read all transitions" ON public.workflow_transitions;

CREATE POLICY "workflow_transitions_select_by_mail_access"
  ON public.workflow_transitions FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

CREATE POLICY "workflow_transitions_insert_by_mail_write"
  ON public.workflow_transitions FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
  );

-- ---------------------------------------------------------------------------
-- 7. mail_contributions RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mail_contributions_select" ON public.mail_contributions;
DROP POLICY IF EXISTS "mail_contributions_insert" ON public.mail_contributions;
DROP POLICY IF EXISTS "mail_contributions_update" ON public.mail_contributions;

CREATE POLICY "mail_contributions_select"
  ON public.mail_contributions FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

CREATE POLICY "mail_contributions_insert"
  ON public.mail_contributions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
    AND EXISTS (
      SELECT 1 FROM public.mails m
      WHERE m.id = mail_id AND m.current_step = step_number
    )
  );

CREATE POLICY "mail_contributions_update"
  ON public.mail_contributions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. list_my_mails — filtered inbox for current user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_mails(
  _statuses text[] DEFAULT ARRAY['pending', 'in_progress']::text[]
)
RETURNS SETOF public.mails
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.mails m
  WHERE (_statuses IS NULL OR m.status::text = ANY(_statuses))
    AND public.can_access_mail(m.id, 'read')
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_mails(text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. advance_workflow_step — custodian, access_mode, dg_advance
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.advance_workflow_step(uuid, text, uuid, text, boolean, uuid[]);

CREATE OR REPLACE FUNCTION public.advance_workflow_step(
  _mail_id uuid,
  _action text,
  _performed_by uuid,
  _notes text DEFAULT NULL,
  _skip_auto_assign boolean DEFAULT false,
  _assignee_ids uuid[] DEFAULT NULL,
  _viewer_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_step integer;
  v_new_step integer;
  v_new_status text;
  v_resolved_assignee uuid;
  v_has_access boolean;
  v_sla_hours integer;
  v_deadline timestamptz;
  v_ministre_absent boolean;
  v_mail_type text;
  v_max_step integer;
  v_step_conditions jsonb;
  v_archive_step integer;
  v_aid uuid;
BEGIN
  SELECT m.current_step, m.ministre_absent, m.mail_type
  INTO v_current_step, v_ministre_absent, v_mail_type
  FROM mails m WHERE m.id = _mail_id;

  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;

  v_has_access := (
    EXISTS(
      SELECT 1 FROM mail_assignments
      WHERE mail_id = _mail_id AND assigned_to = _performed_by
        AND step_number = v_current_step
        AND access_mode IN ('contributor', 'custodian')
    )
    OR has_role(_performed_by, 'superadmin')
    OR has_role(_performed_by, 'admin')
    OR has_role(_performed_by, 'directeur')
    OR has_role(_performed_by, 'ministre')
    OR has_role(_performed_by, 'dg')
    OR has_role(_performed_by, 'autorite_1')
  );

  IF NOT v_has_access AND _action <> 'dg_advance' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé');
  END IF;

  -- DG force advance from step 4 (skip waiting for all assignees)
  IF _action = 'dg_advance' THEN
    IF NOT (
      has_role(_performed_by, 'directeur')
      OR has_role(_performed_by, 'ministre')
      OR has_role(_performed_by, 'dg')
      OR has_role(_performed_by, 'autorite_1')
      OR has_role(_performed_by, 'superadmin')
      OR has_role(_performed_by, 'admin')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Action réservée au DG');
    END IF;
    IF v_current_step <> 4 THEN
      RETURN jsonb_build_object('success', false, 'error', 'dg_advance uniquement à l''étape 4');
    END IF;
  END IF;

  SELECT MAX(ws.step_order) INTO v_max_step FROM workflow_steps ws WHERE ws.is_active = true;
  v_max_step := COALESCE(v_max_step, 9);
  v_archive_step := v_max_step;
  v_new_status := 'in_progress';

  IF _action = 'dg_advance' THEN
    -- Target step 6, or skip 5 if not note_technique
    IF v_mail_type IS DISTINCT FROM 'note_technique' THEN
      v_new_step := 6;
    ELSE
      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
      WHERE ws.step_order > 4 AND ws.is_active = true AND ws.step_order >= 5;
      v_new_step := COALESCE(v_new_step, 6);
    END IF;
  ELSE
    CASE _action
      WHEN 'approve', 'complete', 'acknowledge' THEN
        SELECT MIN(ws.step_order) INTO v_new_step
        FROM workflow_steps ws WHERE ws.step_order > v_current_step AND ws.is_active = true;
        v_new_step := COALESCE(v_new_step, v_archive_step);
      WHEN 'reject' THEN
        IF v_current_step IN (5, 6) THEN
          SELECT MAX(ws.step_order) INTO v_new_step
          FROM workflow_steps ws
          WHERE ws.step_order < v_current_step AND ws.is_active = true AND ws.step_order >= 4;
          v_new_step := COALESCE(v_new_step, 4);
        ELSE
          SELECT MAX(ws.step_order) INTO v_new_step
          FROM workflow_steps ws
          WHERE ws.step_order < v_current_step AND ws.is_active = true;
          v_new_step := COALESCE(v_new_step, 1);
        END IF;
      WHEN 'archive' THEN
        v_new_step := v_archive_step;
        v_new_status := 'archived';
      ELSE
        SELECT MIN(ws.step_order) INTO v_new_step
        FROM workflow_steps ws WHERE ws.step_order > v_current_step AND ws.is_active = true;
        v_new_step := COALESCE(v_new_step, v_archive_step);
    END CASE;
  END IF;

  LOOP
    SELECT ws.conditions INTO v_step_conditions
    FROM workflow_steps ws WHERE ws.step_order = v_new_step AND ws.is_active = true;
    IF v_step_conditions IS NULL OR v_step_conditions = '{}'::jsonb THEN EXIT; END IF;
    IF (v_step_conditions->>'skip_if_ministre_absent')::boolean IS TRUE AND v_ministre_absent THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — DG absent.');
      SELECT MIN(ws.step_order) INTO v_new_step FROM workflow_steps ws
      WHERE ws.step_order > v_new_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
      CONTINUE;
    END IF;
    IF (v_step_conditions->>'skip_if_not_note_technique')::boolean IS TRUE
       AND v_mail_type IS DISTINCT FROM 'note_technique' THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — type non technique.');
      SELECT MIN(ws.step_order) INTO v_new_step FROM workflow_steps ws
      WHERE ws.step_order > v_new_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
      CONTINUE;
    END IF;
    EXIT;
  END LOOP;

  IF v_new_step >= v_archive_step THEN
    v_new_step := v_archive_step;
    v_new_status := 'archived';
  END IF;

  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, v_current_step, v_new_step, _action, _performed_by, _notes);

  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_new_step;
  v_deadline := now() + make_interval(hours => COALESCE(v_sla_hours, 48));

  -- Ensure DG custodian at step 2 when mail enters step 2
  IF v_new_step = 2 OR v_current_step = 2 THEN
    IF NOT EXISTS (
      SELECT 1 FROM mail_assignments
      WHERE mail_id = _mail_id AND step_number = 2 AND access_mode = 'custodian'
    ) THEN
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
      VALUES (_mail_id, _performed_by, _performed_by, 2, 'pending', 'custodian');
    END IF;
  END IF;

  -- Step 2: pre-assign contributors + viewers
  IF v_current_step = 2 AND _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
    DELETE FROM mail_assignments
    WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed' AND access_mode = 'contributor';
    INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode, instructions)
    SELECT _mail_id, _performed_by, aid, 4, 'proposed', 'contributor', _notes
    FROM unnest(_assignee_ids) AS aid;
    INSERT INTO notifications (user_id, title, message, mail_id)
    SELECT aid, 'Pré-assignation par le Directeur général',
      'Le courrier vous a été pré-assigné pour traitement.', _mail_id
    FROM unnest(_assignee_ids) AS aid;
  END IF;

  IF v_current_step = 2 AND _viewer_ids IS NOT NULL AND array_length(_viewer_ids, 1) > 0 THEN
    FOREACH v_aid IN ARRAY _viewer_ids LOOP
      IF NOT EXISTS (
        SELECT 1 FROM mail_assignments ma
        WHERE ma.mail_id = _mail_id AND ma.assigned_to = v_aid AND ma.step_number = 4
      ) THEN
        INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
        VALUES (_mail_id, _performed_by, v_aid, 4, 'proposed', 'viewer');
      END IF;
    END LOOP;
  END IF;

  IF v_new_step = 4 THEN
    UPDATE mail_assignments SET status = 'pending', access_mode = 'contributor'
    WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed' AND access_mode = 'contributor';
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
      DELETE FROM mail_assignments WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed';
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
      SELECT _mail_id, _performed_by, aid, 4, 'pending', 'contributor' FROM unnest(_assignee_ids) AS aid;
      v_resolved_assignee := _assignee_ids[1];
    ELSE
      SELECT ma.assigned_to INTO v_resolved_assignee
      FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending'
      ORDER BY ma.created_at ASC LIMIT 1;
    END IF;
    INSERT INTO notifications (user_id, title, message, mail_id)
    SELECT ma.assigned_to, 'Courrier en attente — Traitement',
      'Un courrier requiert votre attention pour traitement.', _mail_id
    FROM mail_assignments ma
    WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending';
  ELSIF v_new_step = 7 THEN
    INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode, instructions)
    SELECT _mail_id, _performed_by, ma.assigned_to, 7, 'pending', 'contributor', 'Consultation de la validation'
    FROM mail_assignments ma WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.access_mode = 'contributor';
  ELSE
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
      SELECT _mail_id, _performed_by, aid, v_new_step, 'pending', 'contributor' FROM unnest(_assignee_ids) AS aid;
      v_resolved_assignee := _assignee_ids[1];
    ELSIF NOT _skip_auto_assign THEN
      v_resolved_assignee := resolve_step_assignee(v_new_step, _mail_id);
      IF v_resolved_assignee IS NOT NULL THEN
        INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
        VALUES (_mail_id, _performed_by, v_resolved_assignee, v_new_step, 'pending', 'contributor');
      END IF;
    END IF;
  END IF;

  UPDATE mails SET
    current_step = v_new_step,
    status = v_new_status::mail_status,
    deadline_at = v_deadline,
    assigned_agent_id = COALESCE(v_resolved_assignee, assigned_agent_id),
    workflow_completed_at = CASE WHEN v_new_step = v_archive_step THEN now() ELSE workflow_completed_at END,
    updated_at = now()
  WHERE id = _mail_id;

  RETURN jsonb_build_object(
    'success', true, 'new_step', v_new_step, 'from_step', v_current_step,
    'assigned_to', v_resolved_assignee::text, 'ministre_absent', v_ministre_absent
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.advance_workflow_step(uuid, text, uuid, text, boolean, uuid[], uuid[]) TO authenticated;

-- Align workflow step 2 with directeur role
UPDATE public.workflow_steps
SET responsible_role = 'directeur',
    name = COALESCE(NULLIF(name, ''), 'Traitement DG'),
    description = COALESCE(description, 'Orientation et instructions du Directeur général')
WHERE step_order = 2;
