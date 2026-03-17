
-- 1. Add ministre_absent column to mails
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS ministre_absent boolean NOT NULL DEFAULT false;

-- 2. Create the atomic advance_workflow_step RPC (SECURITY DEFINER = bypasses RLS)
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
AS $$
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
BEGIN
  -- 1. Fetch current mail state
  SELECT m.current_step, m.ministre_absent, m.mail_type
  INTO v_current_step, v_ministre_absent, v_mail_type
  FROM mails m WHERE m.id = _mail_id;

  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;

  -- 2. Verify caller has access (assignment at current step OR admin/superadmin)
  v_has_access := (
    EXISTS(SELECT 1 FROM mail_assignments WHERE mail_id = _mail_id AND assigned_to = _performed_by AND step_number = v_current_step)
    OR has_role(_performed_by, 'superadmin')
    OR has_role(_performed_by, 'admin')
  );

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé');
  END IF;

  -- 3. Calculate new step
  v_new_status := 'in_progress';
  CASE _action
    WHEN 'approve', 'complete', 'acknowledge' THEN v_new_step := v_current_step + 1;
    WHEN 'reject' THEN
      IF v_current_step IN (5, 6) THEN v_new_step := 4;
      ELSE v_new_step := GREATEST(v_current_step - 1, 1);
      END IF;
    WHEN 'archive' THEN v_new_step := 9; v_new_status := 'archived';
    ELSE v_new_step := v_current_step + 1;
  END CASE;

  -- Step 3 bypass when ministre absent (step 2 -> step 4 directly)
  IF v_new_step = 3 AND v_ministre_absent THEN
    v_new_step := 4;
  END IF;

  -- Step 7 skip for non-note_technique mails
  IF v_new_step = 7 AND v_mail_type IS DISTINCT FROM 'note_technique' THEN
    INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
    VALUES (_mail_id, v_current_step, 7, 'skip', _performed_by, 'Étape 7 ignorée — type non technique.');
    v_new_step := 8;
  END IF;

  IF v_new_step > 9 THEN v_new_step := 9; END IF;
  IF v_new_step = 9 THEN v_new_status := 'archived'; END IF;

  -- 4. Record transition
  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, v_current_step, v_new_step, _action, _performed_by, _notes);

  -- 5. SLA
  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_new_step;
  v_sla_hours := COALESCE(v_sla_hours, 48);
  v_deadline := now() + make_interval(hours => v_sla_hours);

  -- 6. Step-specific assignment logic

  IF v_new_step = 4 THEN
    -- Step 4: collective treatment
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
      -- Explicit assignees from DirCab (step 3) - replace proposed
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
      -- Activate proposed assignments from step 2
      UPDATE mail_assignments SET status = 'pending'
      WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed';
      -- Notify activated assignees
      INSERT INTO notifications (user_id, title, message, mail_id)
      SELECT ma.assigned_to, 'Courrier en attente — Traitement', 'Un courrier requiert votre attention pour traitement.', _mail_id
      FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending';
      -- Pick first as primary
      SELECT ma.assigned_to INTO v_resolved_assignee
      FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending'
      ORDER BY ma.created_at ASC LIMIT 1;
    END IF;

  ELSIF v_new_step = 7 THEN
    -- Step 7: copy step 4 assignees for consultation
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
    -- Other steps: auto-assignment from config or manual
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

  -- 7. Update mail atomically (SECURITY DEFINER bypasses RLS)
  UPDATE mails SET
    current_step = v_new_step,
    status = v_new_status::mail_status,
    deadline_at = v_deadline,
    assigned_agent_id = COALESCE(v_resolved_assignee, assigned_agent_id),
    workflow_completed_at = CASE WHEN v_new_step = 9 THEN now() ELSE workflow_completed_at END,
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
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.advance_workflow_step TO authenticated;

-- 3. Simplify RLS on mails: remove can_transition_update_mail workaround
DROP POLICY IF EXISTS "Assigned agents can update mail" ON public.mails;
DROP POLICY IF EXISTS "Users can update mail at assigned step" ON public.mails;

-- Recreate simplified UPDATE policies (no more can_transition_update_mail)
CREATE POLICY "Assigned agents can update mail"
  ON public.mails FOR UPDATE TO authenticated
  USING (assigned_agent_id = auth.uid());

CREATE POLICY "Users can update mail at assigned step"
  ON public.mails FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mail_assignments ma
      WHERE ma.mail_id = mails.id
        AND ma.assigned_to = auth.uid()
        AND ma.step_number = mails.current_step
    )
  );
