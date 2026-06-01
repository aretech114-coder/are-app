-- DG quick fixes: multi-attachments JSONB, step-2 proposed assignments in RPC, directeur role RLS
-- Exécution manuelle : Staging puis Production (SQL Editor)
--
-- Diagnostic (optionnel) :
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('mails','mail_assignments','workflow_transitions','notifications');

-- 0. Prérequis : table mails obligatoire
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mails'
  ) THEN
    RAISE EXCEPTION
      'Prérequis manquant : public.mails n''existe pas. Appliquez d''abord les migrations de base du dépôt (dossier supabase/migrations/, à partir de 20260212125037).';
  END IF;
END $$;

-- 0a. Créer l'enum app_role s'il n'existe pas (base Staging quasi vide)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
  END IF;
END $$;

-- 0b. Valeurs app_role requises par les policies / RPC (base partielle Staging)
-- Exécuter ce bloc en entier avant les CREATE POLICY si erreur 22P02 sur un rôle.
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
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef_departement';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretaire_direction';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'collaborateur';

-- 0c. Tables workflow manquantes (bootstrap idempotent si base partielle)
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

ALTER TABLE public.mail_assignments
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.mail_assignments
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;
ALTER TABLE public.mail_assignments
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE public.mail_assignments ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  mail_id uuid REFERENCES public.mails(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1. Multi-attachments column
ALTER TABLE public.mails
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Extend advance_workflow_step: proposed step-4 assignments when leaving step 2
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
  SELECT m.current_step, m.ministre_absent, m.mail_type
  INTO v_current_step, v_ministre_absent, v_mail_type
  FROM mails m WHERE m.id = _mail_id;

  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;

  v_has_access := (
    EXISTS(SELECT 1 FROM mail_assignments WHERE mail_id = _mail_id AND assigned_to = _performed_by AND step_number = v_current_step)
    OR has_role(_performed_by, 'superadmin')
    OR has_role(_performed_by, 'admin')
    OR has_role(_performed_by, 'directeur')
    OR has_role(_performed_by, 'ministre')
  );

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé');
  END IF;

  SELECT MAX(ws.step_order) INTO v_max_step
  FROM workflow_steps ws WHERE ws.is_active = true;
  v_max_step := COALESCE(v_max_step, 9);
  v_archive_step := v_max_step;

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

  LOOP
    SELECT ws.conditions INTO v_step_conditions
    FROM workflow_steps ws
    WHERE ws.step_order = v_new_step AND ws.is_active = true;

    IF v_step_conditions IS NULL OR v_step_conditions = '{}'::jsonb THEN
      EXIT;
    END IF;

    IF (v_step_conditions->>'skip_if_ministre_absent')::boolean IS TRUE AND v_ministre_absent THEN
      INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
      VALUES (_mail_id, v_current_step, v_new_step, 'skip', _performed_by, 'Étape ignorée — DG absent.');

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

  INSERT INTO workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  VALUES (_mail_id, v_current_step, v_new_step, _action, _performed_by, _notes);

  SELECT s.default_hours INTO v_sla_hours FROM sla_config s WHERE s.step_number = v_new_step;
  v_sla_hours := COALESCE(v_sla_hours, 48);
  v_deadline := now() + make_interval(hours => v_sla_hours);

  -- Step 2 → 3: DG pre-assigns treatment agents (proposed, activated at step 3)
  IF v_current_step = 2 AND _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
    DELETE FROM mail_assignments
    WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed';

    INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, instructions)
    SELECT _mail_id, _performed_by, aid, 4, 'proposed', _notes
    FROM unnest(_assignee_ids) AS aid
    WHERE NOT EXISTS (
      SELECT 1 FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.assigned_to = aid AND ma.status = 'proposed'
    );

    INSERT INTO notifications (user_id, title, message, mail_id)
    SELECT aid,
      'Pré-assignation par le Directeur général',
      'Le courrier vous a été pré-assigné pour traitement.',
      _mail_id
    FROM unnest(_assignee_ids) AS aid;
  END IF;

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
    SELECT ma.assigned_to, 'Note validée par le Directeur général', 'Veuillez consulter et confirmer la validation.', _mail_id
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

-- 3. RLS: add directeur role to INSERT policies (fallback for any remaining client inserts)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mail_assignments'
  ) THEN
    DROP POLICY IF EXISTS "Authorized roles can insert assignments" ON public.mail_assignments;
    CREATE POLICY "Authorized roles can insert assignments"
    ON public.mail_assignments
    FOR INSERT
    TO public
    WITH CHECK (
      assigned_by = auth.uid()
      AND (
        has_role(auth.uid(), 'superadmin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'dircab'::app_role)
        OR has_role(auth.uid(), 'dircaba'::app_role)
        OR has_role(auth.uid(), 'secretariat'::app_role)
        OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
        OR has_role(auth.uid(), 'supervisor'::app_role)
        OR has_role(auth.uid(), 'ministre'::app_role)
        OR has_role(auth.uid(), 'directeur'::app_role)
        OR has_role(auth.uid(), 'conseiller'::app_role)
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    DROP POLICY IF EXISTS "Authorized roles can insert notifications" ON public.notifications;
    CREATE POLICY "Authorized roles can insert notifications"
    ON public.notifications
    FOR INSERT
    TO public
    WITH CHECK (
      has_role(auth.uid(), 'superadmin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dircab'::app_role)
      OR has_role(auth.uid(), 'dircaba'::app_role)
      OR has_role(auth.uid(), 'secretariat'::app_role)
      OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
      OR has_role(auth.uid(), 'supervisor'::app_role)
      OR has_role(auth.uid(), 'ministre'::app_role)
      OR has_role(auth.uid(), 'directeur'::app_role)
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workflow_transitions'
  ) THEN
    DROP POLICY IF EXISTS "Authorized roles insert transitions" ON public.workflow_transitions;
    CREATE POLICY "Authorized roles insert transitions"
    ON public.workflow_transitions
    FOR INSERT TO public
    WITH CHECK (
      performed_by = auth.uid()
      AND (
        has_role(auth.uid(), 'superadmin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'dircab'::app_role)
        OR has_role(auth.uid(), 'dircaba'::app_role)
        OR has_role(auth.uid(), 'secretariat'::app_role)
        OR has_role(auth.uid(), 'supervisor'::app_role)
        OR has_role(auth.uid(), 'ministre'::app_role)
        OR has_role(auth.uid(), 'directeur'::app_role)
        OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
        OR has_role(auth.uid(), 'conseiller'::app_role)
      )
    );

    DROP POLICY IF EXISTS "Privileged roles read all transitions" ON public.workflow_transitions;
    CREATE POLICY "Privileged roles read all transitions"
    ON public.workflow_transitions
    FOR SELECT TO public
    USING (
      has_role(auth.uid(), 'superadmin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dircab'::app_role)
      OR has_role(auth.uid(), 'dircaba'::app_role)
      OR has_role(auth.uid(), 'secretariat'::app_role)
      OR has_role(auth.uid(), 'supervisor'::app_role)
      OR has_role(auth.uid(), 'ministre'::app_role)
      OR has_role(auth.uid(), 'directeur'::app_role)
      OR has_role(auth.uid(), 'conseiller_juridique'::app_role)
    );
  END IF;
END $$;
