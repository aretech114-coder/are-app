-- Étape Z prod : remonter assigned_to depuis advance_workflow_step dans les RPC atomiques step 4 / 7

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
      'assigned_to', v_advance_result->'assigned_to',
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

CREATE OR REPLACE FUNCTION public.submit_step7_acknowledgement(
  _mail_id uuid,
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
  v_advance_result jsonb;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  SELECT current_step INTO v_current_step FROM mails WHERE id = _mail_id;
  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;
  IF v_current_step <> 7 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accusé uniquement à l''étape 7');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM mail_assignments
    WHERE mail_id = _mail_id AND assigned_to = v_user AND step_number = 7
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aucune assignation active à l''étape 7');
  END IF;

  UPDATE mail_assignments SET status = 'acknowledged'
  WHERE mail_id = _mail_id AND assigned_to = v_user AND step_number = 7;

  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, 7, 7, 'acknowledge', v_user, COALESCE(_notes, 'Consultation de la validation confirmée.'));

  SELECT COUNT(*) INTO v_pending_count
  FROM mail_assignments
  WHERE mail_id = _mail_id AND step_number = 7 AND access_mode = 'contributor'
    AND status <> 'acknowledged';

  IF v_pending_count = 0 THEN
    v_advance_result := public.advance_workflow_step(
      _mail_id, 'complete', v_user,
      'Tous les conseillers ont consulté la validation.',
      false, NULL, NULL
    );
    RETURN jsonb_build_object(
      'success', true,
      'all_acknowledged', true,
      'new_step', v_advance_result->'new_step',
      'assigned_to', v_advance_result->'assigned_to',
      'advanced', COALESCE((v_advance_result->>'success')::boolean, false)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'all_acknowledged', false,
    'remaining', v_pending_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_step4_treatment(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_step7_acknowledgement(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
