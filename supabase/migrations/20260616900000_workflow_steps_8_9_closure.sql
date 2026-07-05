-- Migration AJ — Workflow étapes 8→9 : documents de clôture, accusé obligatoire à l'archivage

-- ---------------------------------------------------------------------------
-- 1. Colonnes mails (workspace étape 8)
-- ---------------------------------------------------------------------------
ALTER TABLE public.mails
  ADD COLUMN IF NOT EXISTS outgoing_draft_html text,
  ADD COLUMN IF NOT EXISTS step8_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS step8_transmitted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Table mail_workflow_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_workflow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_id uuid NOT NULL REFERENCES public.mails(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number IN (8, 9)),
  document_type text NOT NULL DEFAULT 'accuse_reception_sortant'
    CHECK (document_type IN ('accuse_reception_sortant')),
  storage_bucket text NOT NULL DEFAULT 'mail-documents',
  storage_path text NOT NULL,
  file_name text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_workflow_documents_mail_type_key UNIQUE (mail_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_mwd_mail_id ON public.mail_workflow_documents(mail_id);
CREATE INDEX IF NOT EXISTS idx_mwd_document_type ON public.mail_workflow_documents(document_type);

ALTER TABLE public.mail_workflow_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_workflow_documents_select" ON public.mail_workflow_documents;
CREATE POLICY "mail_workflow_documents_select"
  ON public.mail_workflow_documents FOR SELECT TO authenticated
  USING (public.can_access_mail(mail_id, 'read'));

DROP POLICY IF EXISTS "mail_workflow_documents_insert" ON public.mail_workflow_documents;
CREATE POLICY "mail_workflow_documents_insert"
  ON public.mail_workflow_documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.can_access_mail(mail_id, 'write')
  );

DROP POLICY IF EXISTS "mail_workflow_documents_update" ON public.mail_workflow_documents;
CREATE POLICY "mail_workflow_documents_update"
  ON public.mail_workflow_documents FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

DROP TRIGGER IF EXISTS trg_mwd_updated_at ON public.mail_workflow_documents;
CREATE TRIGGER trg_mwd_updated_at
  BEFORE UPDATE ON public.mail_workflow_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_accuse_reception_sortant(_mail_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mail_workflow_documents mwd
    WHERE mwd.mail_id = _mail_id
      AND mwd.document_type = 'accuse_reception_sortant'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_accuse_reception_sortant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_mail_workflow_document(
  _mail_id uuid,
  _step_number integer,
  _document_type text,
  _storage_bucket text,
  _storage_path text,
  _file_name text DEFAULT NULL
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
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  SELECT current_step INTO v_current_step FROM public.mails WHERE id = _mail_id;
  IF v_current_step IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Courrier introuvable');
  END IF;

  IF _document_type IS DISTINCT FROM 'accuse_reception_sortant' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Type de document non supporté');
  END IF;

  IF _step_number NOT IN (8, 9) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Étape invalide pour ce document');
  END IF;

  IF NOT (
    public.has_role(v_user, 'superadmin')
    OR public.has_role(v_user, 'admin')
    OR (public.has_role(v_user, 'secretariat') AND _step_number = 8 AND v_current_step = 8)
    OR (public.has_role(v_user, 'archiviste') AND _step_number = 9 AND v_current_step = 9)
    OR EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number = _step_number
        AND ma.access_mode IN ('contributor', 'custodian')
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé pour enregistrer ce document');
  END IF;

  INSERT INTO public.mail_workflow_documents (
    mail_id, step_number, document_type, storage_bucket, storage_path, file_name, uploaded_by
  ) VALUES (
    _mail_id, _step_number, _document_type, _storage_bucket, _storage_path, _file_name, v_user
  )
  ON CONFLICT (mail_id, document_type) DO UPDATE SET
    step_number = EXCLUDED.step_number,
    storage_bucket = EXCLUDED.storage_bucket,
    storage_path = EXCLUDED.storage_path,
    file_name = EXCLUDED.file_name,
    uploaded_by = EXCLUDED.uploaded_by,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_mail_workflow_document(uuid, integer, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage : sous-dossier archives/ + archiviste
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_mail_id_from_documents_path(_object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(_object_name, '/', 1) IN ('treatments', 'annotations', 'validations', 'deposits', 'archives')
      AND split_part(_object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_object_name, '/', 2)::uuid
    ELSE NULL
  END;
$$;

DROP POLICY IF EXISTS "Authorized roles upload mail documents" ON storage.objects;
CREATE POLICY "Authorized roles upload mail documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'mail-documents'
  AND (
    public.has_role(auth.uid(), 'superadmin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretariat'::public.app_role)
    OR public.has_role(auth.uid(), 'archiviste'::public.app_role)
    OR public.has_role(auth.uid(), 'reception'::public.app_role)
    OR public.has_role(auth.uid(), 'dircab'::public.app_role)
    OR public.has_role(auth.uid(), 'dircaba'::public.app_role)
    OR public.has_role(auth.uid(), 'ministre'::public.app_role)
    OR public.has_role(auth.uid(), 'directeur'::public.app_role)
    OR public.has_role(auth.uid(), 'dg'::public.app_role)
    OR public.has_role(auth.uid(), 'dga'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_1'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_2'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_3'::public.app_role)
    OR public.has_role(auth.uid(), 'autorite_4'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller_juridique'::public.app_role)
    OR public.has_role(auth.uid(), 'conseiller'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR public.has_role(auth.uid(), 'chef_departement'::public.app_role)
    OR public.has_role(auth.uid(), 'collaborateur'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.assigned_to = auth.uid()
    )
    OR (
      public.storage_mail_id_from_documents_path(name) IS NOT NULL
      AND public.can_access_mail(public.storage_mail_id_from_documents_path(name), 'write')
    )
  )
);

-- ---------------------------------------------------------------------------
-- 5. Site settings
-- ---------------------------------------------------------------------------
INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  (
    'step8_auto_advance_hours',
    '0',
    'number',
    'Délai auto transmission archivage (heures)',
    '0 = désactivé. Passage automatique étape 8→9 après ce délai depuis l''arrivée à l''étape 8.'
  ),
  (
    'ged_module_enabled',
    'false',
    'boolean',
    'Module GED activé',
    'Active la génération PDF dossier à l''archivage et la consultation GED.'
  )
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Backfill accusés depuis transitions étape 8 (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.mail_workflow_documents (
  mail_id, step_number, document_type, storage_bucket, storage_path, file_name, uploaded_by
)
SELECT DISTINCT ON (wt.mail_id)
  wt.mail_id,
  8,
  'accuse_reception_sortant',
  'mail-documents',
  substring(wt.notes from 'deposits/[0-9a-f-]{36}/[^[:space:]"''<>]+'),
  NULL,
  wt.performed_by
FROM public.workflow_transitions wt
WHERE wt.from_step = 8
  AND wt.notes IS NOT NULL
  AND wt.notes ~ 'deposits/[0-9a-f-]{36}/'
  AND NOT EXISTS (
    SELECT 1 FROM public.mail_workflow_documents mwd
    WHERE mwd.mail_id = wt.mail_id AND mwd.document_type = 'accuse_reception_sortant'
  )
ORDER BY wt.mail_id, wt.created_at DESC
ON CONFLICT (mail_id, document_type) DO NOTHING;

-- Initialiser step8_arrived_at pour courriers déjà à l'étape 8
UPDATE public.mails m
SET step8_arrived_at = COALESCE(
  (
    SELECT MIN(wt.created_at)
    FROM public.workflow_transitions wt
    WHERE wt.mail_id = m.id AND wt.to_step = 8
  ),
  m.updated_at
)
WHERE m.current_step = 8 AND m.step8_arrived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 7. advance_workflow_step — accusé obligatoire à l'archive + timestamps step 8
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

  IF _action = 'archive' THEN
    IF v_current_step <> 9 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Archivage uniquement à l''étape 9');
    END IF;
    IF NOT (
      has_role(_performed_by, 'superadmin')
      OR has_role(_performed_by, 'admin')
      OR has_role(_performed_by, 'archiviste')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Archivage réservé à l''archiviste');
    END IF;
    IF NOT public.has_accuse_reception_sortant(_mail_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Accusé de réception du courrier sortant requis avant archivage.'
      );
    END IF;
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
    OR (has_role(_performed_by, 'secretariat') AND v_current_step = 8)
    OR (has_role(_performed_by, 'archiviste') AND v_current_step = 9)
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
         WHERE ma.mail_id = _mail_id AND ma.step_number = 4
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
    WHERE mail_id = _mail_id AND step_number = 4 AND access_mode = 'contributor';
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
    FROM workflow_steps ws WHERE ws.step_order > 4 AND ws.is_active = true;
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
         WHERE ma.mail_id = _mail_id AND ma.step_number = 4
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
    WHERE mail_id = _mail_id AND step_number = 4 AND access_mode = 'contributor' AND status = 'proposed';
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
    INSERT INTO notifications (user_id, title, message, mail_id)
    SELECT viewer_uid, 'Copie lecture seule — pré-assignation',
      'Le courrier vous sera transmis en lecture seule après validation du DG.', _mail_id
    FROM unnest(_viewer_ids) AS viewer_uid;
  END IF;

  IF v_new_step = 4 THEN
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 THEN
      DELETE FROM mail_assignments
      WHERE mail_id = _mail_id AND step_number = 4 AND access_mode = 'contributor';
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
      SELECT _mail_id, _performed_by, aid, 4, 'pending', 'contributor' FROM unnest(_assignee_ids) AS aid;
      v_resolved_assignee := _assignee_ids[1];
    ELSE
      UPDATE mail_assignments SET status = 'pending', access_mode = 'contributor'
      WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed' AND access_mode = 'contributor';
      UPDATE mail_assignments SET status = 'pending'
      WHERE mail_id = _mail_id AND step_number = 4 AND status = 'proposed' AND access_mode = 'viewer';
      SELECT ma.assigned_to INTO v_resolved_assignee
      FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending'
        AND ma.access_mode = 'contributor'
      ORDER BY ma.created_at ASC LIMIT 1;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM mail_assignments ma
      WHERE ma.mail_id = _mail_id AND ma.step_number = 4
        AND ma.access_mode = 'contributor' AND ma.status = 'pending'
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
    WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending'
      AND ma.access_mode = 'contributor';

    INSERT INTO notifications (user_id, title, message, mail_id)
    SELECT ma.assigned_to, 'Courrier en copie — Lecture seule',
      'Un courrier vous est transmis en lecture seule (copie).', _mail_id
    FROM mail_assignments ma
    WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.status = 'pending'
      AND ma.access_mode = 'viewer';
  ELSIF v_new_step = 7 THEN
    INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode, instructions)
    SELECT _mail_id, _performed_by, ma.assigned_to, 7, 'pending', 'contributor', 'Consultation de la validation'
    FROM mail_assignments ma WHERE ma.mail_id = _mail_id AND ma.step_number = 4 AND ma.access_mode = 'contributor'
    ON CONFLICT DO NOTHING;
  ELSE
    IF _assignee_ids IS NOT NULL AND array_length(_assignee_ids, 1) > 0 AND v_current_step <> 5 THEN
      INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
      SELECT _mail_id, _performed_by, aid, v_new_step, 'pending', 'contributor' FROM unnest(_assignee_ids) AS aid
      ON CONFLICT (mail_id, assigned_to, step_number, access_mode) DO UPDATE SET
        status = EXCLUDED.status,
        assigned_by = EXCLUDED.assigned_by;
      v_resolved_assignee := _assignee_ids[1];
    ELSIF NOT _skip_auto_assign THEN
      v_resolved_assignee := resolve_step_assignee(v_new_step, _mail_id);
      IF v_resolved_assignee IS NOT NULL THEN
        INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
        VALUES (_mail_id, _performed_by, v_resolved_assignee, v_new_step, 'pending', 'contributor')
        ON CONFLICT (mail_id, assigned_to, step_number, access_mode) DO UPDATE SET
          status = EXCLUDED.status,
          assigned_by = EXCLUDED.assigned_by;
      END IF;
    END IF;
  END IF;

  UPDATE mails SET
    current_step = v_new_step,
    status = v_new_status::mail_status,
    deadline_at = v_deadline,
    assigned_agent_id = COALESCE(v_resolved_assignee, assigned_agent_id),
    workflow_completed_at = CASE WHEN v_new_status = 'archived' THEN now() ELSE workflow_completed_at END,
    step8_arrived_at = CASE
      WHEN v_new_step = 8 AND step8_arrived_at IS NULL THEN now()
      ELSE step8_arrived_at
    END,
    step8_transmitted_at = CASE
      WHEN v_current_step = 8 AND v_new_step = 9 AND _action IN ('complete', 'approve', 'acknowledge') THEN now()
      ELSE step8_transmitted_at
    END,
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
