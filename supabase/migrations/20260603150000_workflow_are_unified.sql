-- Workflow ARE unifié : étapes 1/3/5/7 désactivées, accès alignés, garde-fous assignation, list_assignable_users

-- ---------------------------------------------------------------------------
-- 1. Configuration des étapes actives (parcours 2 → 4 → 6 → 8 → 9)
-- ---------------------------------------------------------------------------
UPDATE public.workflow_steps
SET is_active = false
WHERE step_order IN (1, 3, 5, 7);

UPDATE public.workflow_steps
SET is_active = true
WHERE step_order IN (2, 4, 6, 8, 9);

UPDATE public.workflow_steps
SET responsible_roles = ARRAY['directeur', 'dg', 'autorite_1', 'ministre']::text[]
WHERE step_order = 2;

UPDATE public.workflow_steps
SET responsible_roles = ARRAY['conseiller_juridique', 'autorite_4', 'agent']::text[]
WHERE step_order = 4;

UPDATE public.workflow_steps
SET responsible_roles = ARRAY['directeur', 'dg', 'autorite_1', 'ministre']::text[]
WHERE step_order = 6;

UPDATE public.workflow_steps
SET responsible_roles = ARRAY['secretariat']::text[]
WHERE step_order IN (8, 9);

-- ---------------------------------------------------------------------------
-- 2. Réparation courriers bloqués sur étapes inactives
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_next integer;
BEGIN
  FOR r IN
    SELECT m.id, m.current_step, m.registered_by
    FROM public.mails m
    WHERE m.current_step IN (1, 3, 5, 7)
      AND m.status IN ('pending', 'in_progress')
  LOOP
    SELECT MIN(ws.step_order) INTO v_next
    FROM public.workflow_steps ws
    WHERE ws.is_active = true AND ws.step_order > r.current_step;

    IF v_next IS NULL THEN
      SELECT MIN(ws.step_order) INTO v_next
      FROM public.workflow_steps ws
      WHERE ws.is_active = true;
    END IF;

    IF v_next IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.mails
    SET
      current_step = v_next,
      status = CASE WHEN status = 'pending' THEN 'in_progress'::public.mail_status ELSE status END,
      workflow_started_at = COALESCE(workflow_started_at, now())
    WHERE id = r.id;

    INSERT INTO public.workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
    VALUES (
      r.id,
      r.current_step,
      v_next,
      'skip',
      COALESCE(r.registered_by, r.id),
      'Reprise automatique — étape ' || r.current_step || ' désactivée (workflow ARE).'
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. can_access_mail — DG 2-6, pré-assignés dès étape 2, secrétariat 8-9
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_mail(_mail_id uuid, _mode text DEFAULT 'read')
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

  IF has_role(v_user, 'secretariat') THEN
    IF v_step IN (8, 9) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number IN (8, 9)
    ) THEN
      RETURN true;
    END IF;
    IF NOT v_is_read THEN
      RETURN false;
    END IF;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.can_access_mail(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. list_assignable_users — liste complète sans dépendre du RLS client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_assignable_users()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH roles_ranked AS (
    SELECT
      ur.user_id,
      ur.role::text AS role,
      ROW_NUMBER() OVER (PARTITION BY ur.user_id ORDER BY ur.role::text) AS rn
    FROM public.user_roles ur
    WHERE ur.role::text <> 'superadmin'
  ),
  first_role AS (
    SELECT user_id, role FROM roles_ranked WHERE rn = 1
  )
  SELECT
    p.id,
    COALESCE(NULLIF(trim(p.full_name), ''), p.email, 'Utilisateur') AS full_name,
    p.email,
    COALESCE(fr.role, 'agent') AS role
  FROM public.profiles p
  INNER JOIN first_role fr ON fr.user_id = p.id
  ORDER BY full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_assignable_users() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. advance_workflow_step — rôles élargis + garde-fous assignation étape 4
-- ---------------------------------------------------------------------------
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
SET search_path = public
SET row_security = off
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
  v_has_step4_contributors boolean;
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
    OR has_role(_performed_by, 'dircab')
    OR has_role(_performed_by, 'dircaba')
    OR has_role(_performed_by, 'autorite_2')
    OR has_role(_performed_by, 'autorite_3')
    OR has_role(_performed_by, 'dga')
    OR (has_role(_performed_by, 'secretariat') AND v_current_step IN (8, 9))
  );

  IF NOT v_has_access AND _action <> 'dg_advance' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé');
  END IF;

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

  IF v_current_step = 2 AND _action IN ('approve', 'complete') THEN
    IF COALESCE(array_length(_assignee_ids, 1), 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM mail_assignments ma
         WHERE ma.mail_id = _mail_id
           AND ma.step_number = 4
           AND ma.access_mode = 'contributor'
           AND ma.status IN ('proposed', 'pending')
       )
    THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Assignez au moins une personne au traitement avant de transmettre.'
      );
    END IF;
  END IF;

  IF v_current_step = 5 AND _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
    DELETE FROM mail_assignments
    WHERE mail_id = _mail_id AND step_number = 4 AND status IN ('pending', 'proposed');
    INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode, instructions)
    SELECT _mail_id, _performed_by, aid, 4,
      CASE WHEN _action = 'reject' THEN 'pending' ELSE 'completed' END,
      'contributor', _notes
    FROM unnest(_assignee_ids) AS aid;
  END IF;

  SELECT MAX(ws.step_order) INTO v_max_step FROM workflow_steps ws WHERE ws.is_active = true;
  v_max_step := COALESCE(v_max_step, 9);
  v_archive_step := v_max_step;
  v_new_status := 'in_progress';

  IF _action = 'dg_advance' THEN
    SELECT MIN(ws.step_order) INTO v_new_step
    FROM workflow_steps ws
    WHERE ws.step_order > 4 AND ws.is_active = true;
    v_new_step := COALESCE(v_new_step, 6);
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
          v_new_step := COALESCE(v_new_step, 2);
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

  IF v_new_step = 4 AND _action IN ('approve', 'complete') THEN
    IF COALESCE(array_length(_assignee_ids, 1), 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM mail_assignments ma
         WHERE ma.mail_id = _mail_id
           AND ma.step_number = 4
           AND ma.access_mode = 'contributor'
           AND ma.status IN ('proposed', 'pending')
       )
    THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Assignez au moins une personne au traitement avant de transmettre.'
      );
    END IF;
  END IF;

  IF v_new_step >= v_archive_step THEN
    v_new_step := v_archive_step;
    v_new_status := 'archived';
  END IF;

  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, v_current_step, v_new_step, _action, _performed_by, _notes);

  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_new_step;
  v_deadline := now() + make_interval(hours => COALESCE(v_sla_hours, 48));

  IF v_new_step = 2 OR v_current_step = 2 THEN
    IF NOT EXISTS (
      SELECT 1 FROM mail_assignments
      WHERE mail_id = _mail_id AND step_number = 2 AND access_mode = 'custodian'
    ) THEN
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
      VALUES (_mail_id, _performed_by, _performed_by, 2, 'pending', 'custodian');
    END IF;
  END IF;

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

    SELECT EXISTS (
      SELECT 1 FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.step_number = 4
        AND ma.access_mode = 'contributor'
        AND ma.status = 'pending'
    ) INTO v_has_step4_contributors;

    IF NOT v_has_step4_contributors THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Assignez au moins une personne au traitement avant de transmettre.'
      );
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
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 AND v_current_step <> 5 THEN
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

NOTIFY pgrst, 'reload schema';
