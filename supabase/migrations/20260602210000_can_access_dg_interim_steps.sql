-- Accès DG étapes 2-6 + intérimaire (ministre_absent) + notification DG sur soumission étape 4

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

  -- Intérimaire DG (désigné à l'enregistrement) : étapes institutionnelles 2-6
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

  IF has_role(v_user, 'dircab') OR has_role(v_user, 'dircaba') OR has_role(v_user, 'autorite_2') OR has_role(v_user, 'autorite_3') THEN
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

  -- DG : étapes 2 à 6
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
         AND ma.status IN ('proposed', 'pending', 'completed', 'submitted') AND v_step >= 4)
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

-- Notifier le DG / custodian à chaque soumission étape 4
CREATE OR REPLACE FUNCTION public.submit_step4_treatment(
  _mail_id uuid,
  _body text DEFAULT NULL,
  _attachment_urls jsonb DEFAULT '[]'::jsonb,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user uuid;
  v_current_step integer;
  v_pending_count integer;
  v_completed_count integer;
  v_advance_result jsonb;
  v_notify_user uuid;
  v_subject text;
  v_submitter text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  SELECT current_step INTO v_current_step FROM mails WHERE id = _mail_id;
  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;
  IF v_current_step <> 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Soumission uniquement à l''étape 4');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mail_assignments
    WHERE mail_id = _mail_id AND assigned_to = v_user AND step_number = 4
      AND access_mode = 'contributor' AND status IN ('pending', 'proposed')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aucune assignation active à l''étape 4');
  END IF;

  INSERT INTO mail_contributions (mail_id, user_id, step_number, body, attachment_urls, status, processed_at, updated_at)
  VALUES (_mail_id, v_user, 4, _body, COALESCE(_attachment_urls, '[]'::jsonb), 'submitted', now(), now())
  ON CONFLICT (mail_id, user_id, step_number) DO UPDATE SET
    body = EXCLUDED.body,
    attachment_urls = EXCLUDED.attachment_urls,
    status = 'submitted',
    processed_at = now(),
    updated_at = now();

  UPDATE mail_assignments SET status = 'completed', completed_at = now()
  WHERE mail_id = _mail_id AND assigned_to = v_user AND step_number = 4;

  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, 4, 4, 'submit_treatment', v_user, _notes);

  SELECT full_name INTO v_submitter FROM profiles WHERE id = v_user;

  SELECT COALESCE(
    (SELECT ma.assigned_to FROM mail_assignments ma
     WHERE ma.mail_id = _mail_id AND ma.step_number = 2 AND ma.access_mode = 'custodian'
     ORDER BY ma.created_at DESC LIMIT 1),
    (SELECT m.assigned_agent_id FROM mails m WHERE m.id = _mail_id)
  ) INTO v_notify_user;

  SELECT subject INTO v_subject FROM mails WHERE id = _mail_id;

  IF v_notify_user IS NOT NULL AND v_notify_user <> v_user THEN
    INSERT INTO notifications (user_id, title, message, mail_id)
    VALUES (
      v_notify_user,
      'Nouvelle contribution — traitement',
      COALESCE(v_submitter, 'Un assigné') || ' a soumis son traitement pour « ' || COALESCE(v_subject, 'Courrier') || ' ».',
      _mail_id
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'proposed')),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_pending_count, v_completed_count
  FROM mail_assignments
  WHERE mail_id = _mail_id AND step_number = 4 AND access_mode = 'contributor';

  IF v_pending_count = 0 AND v_completed_count > 0 THEN
    v_advance_result := public.advance_workflow_step(
      _mail_id, 'complete', v_user,
      'Tous les conseillers assignés ont terminé leur traitement.',
      false, NULL, NULL
    );
    RETURN jsonb_build_object(
      'success', true,
      'all_completed', true,
      'new_step', v_advance_result->'new_step',
      'advanced', COALESCE((v_advance_result->>'success')::boolean, false)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'all_completed', false,
    'remaining', v_pending_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_step4_treatment(uuid, text, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
