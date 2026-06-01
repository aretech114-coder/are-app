-- 1. Table mail_sub_assignments
CREATE TABLE public.mail_sub_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_assignment_id uuid NOT NULL,
  mail_id uuid NOT NULL,
  sub_assigned_by uuid NOT NULL,
  sub_assigned_to uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'validated', 'rejected')),
  submission_notes text,
  validation_notes text,
  parent_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  validated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_msa_mail ON public.mail_sub_assignments(mail_id);
CREATE INDEX idx_msa_parent ON public.mail_sub_assignments(parent_assignment_id);
CREATE INDEX idx_msa_sub_to ON public.mail_sub_assignments(sub_assigned_to);
CREATE INDEX idx_msa_sub_by ON public.mail_sub_assignments(sub_assigned_by);
CREATE INDEX idx_msa_status ON public.mail_sub_assignments(status);

ALTER TABLE public.mail_sub_assignments ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies

-- Lecture : délégant principal
CREATE POLICY "Principal sees own delegated sub-assignments"
ON public.mail_sub_assignments FOR SELECT
TO authenticated
USING (sub_assigned_by = auth.uid());

-- Lecture : sous-assigné
CREATE POLICY "Sub-assignee sees own sub-assignments"
ON public.mail_sub_assignments FOR SELECT
TO authenticated
USING (sub_assigned_to = auth.uid());

-- Lecture : admins
CREATE POLICY "Admins see all sub-assignments"
ON public.mail_sub_assignments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dircab'::app_role));

-- Insertion : seul le délégant principal (qui doit être l'assigné parent)
CREATE POLICY "Principal creates sub-assignments"
ON public.mail_sub_assignments FOR INSERT
TO authenticated
WITH CHECK (
  sub_assigned_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.id = parent_assignment_id
      AND ma.assigned_to = auth.uid()
      AND ma.mail_id = mail_sub_assignments.mail_id
  )
);

-- Mise à jour : sous-assigné peut soumettre (status pending -> submitted)
CREATE POLICY "Sub-assignee submits contribution"
ON public.mail_sub_assignments FOR UPDATE
TO authenticated
USING (sub_assigned_to = auth.uid())
WITH CHECK (sub_assigned_to = auth.uid());

-- Mise à jour : délégant principal peut valider/rejeter
CREATE POLICY "Principal validates sub-assignments"
ON public.mail_sub_assignments FOR UPDATE
TO authenticated
USING (sub_assigned_by = auth.uid())
WITH CHECK (sub_assigned_by = auth.uid());

-- Mise à jour : admins
CREATE POLICY "Admins update sub-assignments"
ON public.mail_sub_assignments FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Suppression : délégant ou admin (uniquement si pending)
CREATE POLICY "Principal deletes pending sub-assignments"
ON public.mail_sub_assignments FOR DELETE
TO authenticated
USING (
  (sub_assigned_by = auth.uid() AND status = 'pending')
  OR has_role(auth.uid(), 'superadmin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Trigger updated_at
CREATE TRIGGER trg_msa_updated_at
BEFORE UPDATE ON public.mail_sub_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Colonne allow_sub_assignment sur workflow_steps
ALTER TABLE public.workflow_steps
ADD COLUMN IF NOT EXISTS allow_sub_assignment boolean NOT NULL DEFAULT false;

-- Activer par défaut sur l'étape de traitement (step 4) si elle existe
UPDATE public.workflow_steps SET allow_sub_assignment = true WHERE step_order = 4;

-- 5. Notifications : permettre aux conseillers d'insérer des notifications
-- (nécessaire pour notifier les sous-assignés)
CREATE POLICY "Conseillers can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'conseiller'::app_role) OR has_role(auth.uid(), 'conseiller_juridique'::app_role));

-- 6. Mise à jour de advance_workflow_step pour bloquer l'avancement si sous-assignations pendantes
CREATE OR REPLACE FUNCTION public.advance_workflow_step(_mail_id uuid, _action text, _performed_by uuid, _notes text DEFAULT NULL::text, _skip_auto_assign boolean DEFAULT false, _assignee_ids uuid[] DEFAULT NULL::uuid[])
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
  v_allow_sub boolean;
  v_pending_subs integer;
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

  -- 2b. Si l'étape autorise les sous-assignations, vérifier qu'aucune n'est en attente/soumise
  IF _action IN ('approve', 'complete', 'acknowledge') THEN
    SELECT COALESCE(ws.allow_sub_assignment, false) INTO v_allow_sub
    FROM workflow_steps ws WHERE ws.step_order = v_current_step;

    IF v_allow_sub THEN
      SELECT count(*) INTO v_pending_subs
      FROM mail_sub_assignments msa
      JOIN mail_assignments ma ON ma.id = msa.parent_assignment_id
      WHERE msa.mail_id = _mail_id
        AND ma.step_number = v_current_step
        AND ma.assigned_to = _performed_by
        AND msa.status IN ('pending', 'submitted');

      IF v_pending_subs > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Sous-assignations en attente de validation',
          'pending_sub_count', v_pending_subs
        );
      END IF;
    END IF;
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
      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
      WHERE ws.step_order > v_current_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
    WHEN 'reject' THEN
      IF v_current_step IN (5, 6) THEN
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

    IF v_step_conditions IS NULL OR v_step_conditions = '{}'::jsonb THEN
      EXIT;
    END IF;

    IF (v_step_conditions->>'skip_if_ministre_absent')::boolean IS TRUE AND v_ministre_absent THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — Ministre absent.');

      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
      WHERE ws.step_order > v_new_step AND ws.is_active = true;
      v_new_step := COALESCE(v_new_step, v_archive_step);
      CONTINUE;
    END IF;

    IF (v_step_conditions->>'skip_if_not_note_technique')::boolean IS TRUE AND v_mail_type IS DISTINCT FROM 'note_technique' THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — type non technique.');

      SELECT MIN(ws.step_order) INTO v_new_step
      FROM workflow_steps ws
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

  -- 6. Record transition
  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, v_current_step, v_new_step, _action, _performed_by, _notes);

  -- 7. SLA
  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_new_step;
  v_sla_hours := COALESCE(v_sla_hours, 48);
  v_deadline := now() + make_interval(hours => v_sla_hours);

  -- 8. Step-specific assignment logic
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