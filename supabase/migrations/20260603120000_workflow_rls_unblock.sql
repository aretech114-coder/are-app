-- Workflow RLS unblock: historical read, RPC hardening, step 4/7 atomic submissions
-- Keeps full 9-step workflow; no step deactivation.

-- ---------------------------------------------------------------------------
-- 0. Bootstrap app_role enum (base Staging partielle — évite 22P02 sur 'dg', etc.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ministre';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dircab';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dircaba';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'conseiller_juridique';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretariat';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'conseiller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reception';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_1';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_2';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_3';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'autorite_4';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'directeur';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dg';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dga';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'daf';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dt';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef_departement';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretaire_direction';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'collaborateur';

-- PostgreSQL 55P04: new enum labels must be committed before use in policies/RPC.
-- Supabase SQL Editor: if the full script still fails, run only section 0 above,
-- wait for Success, then run from section 1 onward.
COMMIT;
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. mail_contributions.processed_at
-- ---------------------------------------------------------------------------
ALTER TABLE public.mail_contributions
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- Realtime for live contribution updates at step 4
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mail_contributions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. can_access_mail — historical read + row_security off
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

  IF has_role(v_user, 'superadmin') OR has_role(v_user, 'admin') THEN
    RETURN true;
  END IF;

  IF has_role(v_user, 'reception') AND v_registered_by = v_user AND v_step = 1 THEN
    RETURN true;
  END IF;

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
    IF v_is_read AND v_step >= 4 THEN
      RETURN true;
    END IF;
    IF NOT v_is_read AND v_step IN (2, 6) THEN
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
        AND ma.status IN ('pending', 'proposed')
    );
  END IF;

  IF v_is_read AND EXISTS (
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
    RETURN v_is_read;
  END IF;

  -- Permanent read: anyone ever assigned (history after step advance)
  IF v_is_read AND EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.assigned_to = v_user
      AND ma.access_mode IN ('contributor', 'viewer', 'custodian')
  ) THEN
    RETURN true;
  END IF;

  -- Submitter read access after submission
  IF v_is_read AND v_registered_by = v_user THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_mail(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policy cleanup (legacy conflicts)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Province isolation registre" ON public.mails;
DROP POLICY IF EXISTS "Tenant isolation mails" ON public.mails;
DROP POLICY IF EXISTS "Reception sees province mail" ON public.mails;
DROP POLICY IF EXISTS "Direction sees all mail" ON public.mails;
DROP POLICY IF EXISTS "Direction can update mail" ON public.mails;
DROP POLICY IF EXISTS "Tenant isolation mail_assignments" ON public.mail_assignments;
DROP POLICY IF EXISTS "Authorized roles can insert assignments" ON public.mail_assignments;
DROP POLICY IF EXISTS "Direction can insert assignments" ON public.mail_assignments;
DROP POLICY IF EXISTS "Authorized users can insert" ON public.mail_assignments;
DROP POLICY IF EXISTS "Reception see own mail assignments" ON public.mail_assignments;
DROP POLICY IF EXISTS "Conseillers see own mail assignments" ON public.mail_assignments;

CREATE POLICY "Province isolation registre"
  ON public.mails AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin')
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'directeur')
    OR has_role(auth.uid(), 'ministre')
    OR has_role(auth.uid(), 'dg')
    OR has_role(auth.uid(), 'autorite_1')
    OR has_role(auth.uid(), 'dircab')
    OR has_role(auth.uid(), 'dircaba')
    OR has_habilitation_speciale(auth.uid())
    OR province_code IS NULL
    OR public.get_user_province(auth.uid()) IS NULL
    OR province_code = public.get_user_province(auth.uid())
  );

DROP POLICY IF EXISTS "Authorized roles can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Direction can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Reception can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Conseillers can insert notifications" ON public.notifications;

CREATE POLICY "Authorized roles can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'superadmin')
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'directeur')
    OR has_role(auth.uid(), 'ministre')
    OR has_role(auth.uid(), 'dg')
    OR has_role(auth.uid(), 'autorite_1')
    OR has_role(auth.uid(), 'dircab')
    OR has_role(auth.uid(), 'dircaba')
    OR has_role(auth.uid(), 'secretariat')
    OR has_role(auth.uid(), 'conseiller_juridique')
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'conseiller')
  );

DROP POLICY IF EXISTS "mail_contributions_update" ON public.mail_contributions;
CREATE POLICY "mail_contributions_update"
  ON public.mail_contributions FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status <> 'submitted'
    AND public.can_access_mail(mail_id, 'write')
  )
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. list_my_mails — row_security off
-- ---------------------------------------------------------------------------
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
    AND public.can_access_mail(m.id, 'read')
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_mails(text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. advance_workflow_step — row_security off + step 5 reassignment
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

  -- DirCab step 5: reassign step 4 contributors before advancing
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

-- ---------------------------------------------------------------------------
-- 6. submit_step4_treatment — atomic per-user submission at step 4
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7. submit_step7_acknowledgement — atomic per-user ack at step 7
-- ---------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.submit_step7_acknowledgement(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
