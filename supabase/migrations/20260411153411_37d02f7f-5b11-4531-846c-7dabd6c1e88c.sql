CREATE OR REPLACE FUNCTION public.advance_workflow_step(
  _mail_id uuid,
  _action text,
  _performed_by uuid,
  _notes text DEFAULT NULL,
  _skip_auto_assign boolean DEFAULT false,
  _assignee_ids uuid[] DEFAULT NULL
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
  v_next_active_step integer;
  v_step_conditions jsonb;
  v_archive_step integer;
BEGIN
  -- 1. Fetch current mail state
  SELECT m.current_step, m.ministre_absent, m.mail_type
  INTO v_current_step, v_ministre_absent, v_mail_type
  FROM mails m WHERE m.id = _mail_id;

  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;

  -- 2. Verify caller has access
  v_has_access := (
    EXISTS(SELECT 1 FROM mail_assignments WHERE mail_id = _mail_id AND assigned_to = _performed_by AND step_number = v_current_step)
    OR has_role(_performed_by, 'superadmin')
    OR has_role(_performed_by, 'admin')
  );

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé');
  END IF;

  -- 3. Get max active step (archive step) from workflow_steps
  SELECT MAX(ws.step_order) INTO v_max_step
  FROM workflow_steps ws WHERE ws.is_active = true;
  v_max_step := COALESCE(v_max_step, 9);
  v_archive_step := v_max_step;

  -- 4. Calculate new step based on action
  v_new_status := 'in_progress';
  CASE _action
    WHEN 'approve', 'complete', 'acknowledge' THEN
      -- Find the next active step after current
      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
      WHERE ws.step_order > v_current_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
    WHEN 'reject' THEN
      -- Find previous active step
      IF v_current_step IN (5, 6) THEN
        -- Special: rejection from 5 or 6 goes to step 4 (treatment) if active
        SELECT MAX(ws.step_order) INTO v_new_step
        FROM workflow_steps ws
        WHERE ws.step_order < v_current_step AND ws.is_active = true
          AND ws.step_order >= 4;
        v_new_step := COALESCE(v_new_step, GREATEST(v_current_step - 1, 1));
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
      FROM workflow_steps ws
      WHERE ws.step_order > v_current_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
  END CASE;

  -- 5. Check conditions on the target step (skip logic)
  LOOP
    SELECT ws.conditions INTO v_step_conditions
    FROM workflow_steps ws
    WHERE ws.step_order = v_new_step AND ws.is_active = true;

    -- Exit if no conditions or step not found
    IF v_step_conditions IS NULL OR v_step_conditions = '{}'::jsonb THEN
      EXIT;
    END IF;

    -- Skip if ministre absent and step has skip_if_ministre_absent
    IF (v_step_conditions->>'skip_if_ministre_absent')::boolean IS TRUE AND v_ministre_absent THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — Ministre absent.');

      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
      WHERE ws.step_order > v_new_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
      CONTINUE;
    END IF;

    -- Skip if not note_technique and step has skip_if_not_note_technique
    IF (v_step_conditions->>'skip_if_not_note_technique')::boolean IS TRUE AND v_mail_type IS DISTINCT FROM 'note_technique' THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — type non technique.');

      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
      WHERE ws.step_order > v_new_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
      CONTINUE;
    END IF;

    EXIT; -- No skip condition matched
  END LOOP;

  IF v_new_step >= v_archive_step THEN
    v_new_step := v_archive_step;
    v_new_status := 'archived';
  END IF;

  -- 6. Record transition
  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, v_current_step, v_new_step, _action, _performed_by, _notes);

  -- 7. SLA
  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_new_step;
  v_sla_hours := COALESCE(v_sla_hours, 48);
  v_deadline := now() + make_interval(hours => v_sla_hours);

  -- 8. Step-specific assignment logic (unchanged)
  IF v_new_step = 4 THEN
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
      DELETE FROM mail_assignments WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed';
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status)
      SELECT _mail_id, _performed_by, aid, 4, 'pending'
      FROM unnest(_assignee_ids) AS aid
      WHERE NOT EXISTS (
        SELECT 1 FROM mail_assignments ma
        WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.assigned_to = aid AND ma.status = 'pending'
      );
      INSERT INTO notifications (user_id, title, message, mail_id)
      SELECT aid, 'Courrier en attente — Traitement', 'Un courrier requiert votre attention pour traitement.', _mail_id
      FROM unnest(_assignee_ids) AS aid;
      v_resolved_assignee := _assignee_ids[1];
    ELSE
      UPDATE mail_assignments SET status = 'pending'
      WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed';
      INSERT INTO notifications (user_id, title, message, mail_id)
      SELECT ma.assigned_to, 'Courrier en attente — Traitement', 'Un courrier requiert votre attention pour traitement.', _mail_id
      FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending';
      SELECT ma.assigned_to INTO v_resolved_assignee
      FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending'
      ORDER BY ma.created_at ASC LIMIT 1;
    END IF;

  ELSIF v_new_step = 7 THEN
    INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, instructions)
    SELECT _mail_id, _performed_by, ma.assigned_to, 7, 'pending', 'Consultation de la validation'
    FROM mail_assignments ma
    WHERE ma.mail_id = _mail_id AND ma.step_number = 4;
    INSERT INTO notifications (user_id, title, message, mail_id)
    SELECT ma.assigned_to, 'Note validée par le Ministre', 'Veuillez consulter et confirmer la validation.', _mail_id
    FROM mail_assignments ma
    WHERE ma.mail_id = _mail_id AND ma.step_number = 4;
    SELECT ma.assigned_to INTO v_resolved_assignee
    FROM mail_assignments ma
    WHERE ma.mail_id = _mail_id AND ma.step_number = 4
    ORDER BY ma.created_at ASC LIMIT 1;

  ELSE
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status)
      SELECT _mail_id, _performed_by, aid, v_new_step, 'pending'
      FROM unnest(_assignee_ids) AS aid;
      INSERT INTO notifications (user_id, title, message, mail_id)
      SELECT aid, 'Courrier en attente', 'Un courrier requiert votre attention.', _mail_id
      FROM unnest(_assignee_ids) AS aid;
      v_resolved_assignee := _assignee_ids[1];
    ELSIF NOT _skip_auto_assign THEN
      v_resolved_assignee := resolve_step_assignee(v_new_step, _mail_id);
      IF v_resolved_assignee IS NOT NULL THEN
        INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status)
        VALUES (_mail_id, _performed_by, v_resolved_assignee, v_new_step, 'pending');
        INSERT INTO notifications (user_id, title, message, mail_id)
        VALUES (v_resolved_assignee, 'Courrier en attente', 'Un courrier requiert votre attention.', _mail_id);
      END IF;
    END IF;
  END IF;

  -- 9. Update mail atomically
  UPDATE mails SET
    current_step = v_new_step,
    status = v_new_status::mail_status,
    deadline_at = v_deadline,
    assigned_agent_id = COALESCE(v_resolved_assignee, assigned_agent_id),
    workflow_completed_at = CASE WHEN v_new_step = v_archive_step THEN now() ELSE workflow_completed_at END,
    updated_at = now()
  WHERE id = _mail_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_step', v_new_step,
    'from_step', v_current_step,
    'assigned_to', v_resolved_assignee::text,
    'ministre_absent', v_ministre_absent
  );
END;
$function$;