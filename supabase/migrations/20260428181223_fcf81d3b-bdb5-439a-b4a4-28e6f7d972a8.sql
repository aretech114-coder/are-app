CREATE OR REPLACE FUNCTION public.revert_mail_to_dispatcher(
  _mail_id uuid,
  _performed_by uuid,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_step integer;
  v_deadline timestamptz;
  v_dispatcher uuid;
  v_target_step integer;
  v_is_authorized boolean;
  v_sla_hours integer;
  v_new_deadline timestamptz;
BEGIN
  SELECT m.current_step, m.deadline_at
  INTO v_current_step, v_deadline
  FROM mails m WHERE m.id = _mail_id;

  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;

  SELECT ma.assigned_by INTO v_dispatcher
  FROM mail_assignments ma
  WHERE ma.mail_id = _mail_id
    AND ma.step_number = v_current_step
  ORDER BY ma.created_at ASC
  LIMIT 1;

  v_is_authorized := (
    _performed_by = v_dispatcher
    OR has_role(_performed_by, 'superadmin')
    OR has_role(_performed_by, 'admin')
    OR has_role(_performed_by, 'dg')
  );

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé : seul le dispatcher d''origine ou un administrateur peut récupérer ce courrier.');
  END IF;

  IF v_deadline IS NULL OR v_deadline > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Le délai n''est pas encore dépassé.');
  END IF;

  SELECT MAX(ws.step_order) INTO v_target_step
  FROM workflow_steps ws
  WHERE ws.step_order < v_current_step AND ws.is_active = true;

  v_target_step := COALESCE(v_target_step, 1);

  UPDATE mail_assignments
  SET status = 'reverted'
  WHERE mail_id = _mail_id
    AND step_number = v_current_step
    AND status IN ('pending', 'proposed');

  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (
    _mail_id,
    v_current_step,
    v_target_step,
    'revert_sla_expired',
    _performed_by,
    COALESCE(_notes, 'Courrier récupéré pour réassignation suite au dépassement de délai. Les contributions précédentes sont conservées.')
  );

  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_target_step;
  v_sla_hours := COALESCE(v_sla_hours, 48);
  v_new_deadline := now() + make_interval(hours => v_sla_hours);

  UPDATE mails SET
    current_step = v_target_step,
    deadline_at = v_new_deadline,
    assigned_agent_id = v_dispatcher,
    updated_at = now()
  WHERE id = _mail_id;

  IF v_dispatcher IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, mail_id)
    VALUES (
      v_dispatcher,
      'Courrier récupéré pour réassignation',
      'Le courrier a été récupéré suite au dépassement du délai. Vous pouvez le réassigner.',
      _mail_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'from_step', v_current_step,
    'new_step', v_target_step,
    'dispatcher', v_dispatcher::text
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.revert_mail_to_dispatcher(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_mail_to_dispatcher(uuid, uuid, text) TO authenticated;