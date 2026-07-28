-- Multi-fichiers workflow: stockage structuré pour transitions + accusés 8/9 multiples
-- Prérequis : public.workflow_transitions et public.mail_workflow_documents existent déjà
-- (migrations bootstrap / AJ). Vérifier le projet Supabase avant d'exécuter.

DO $$
BEGIN
  IF to_regclass('public.workflow_transitions') IS NULL THEN
    RAISE EXCEPTION
      'Table public.workflow_transitions absente. Vous êtes probablement sur le mauvais projet Supabase, ou les migrations bootstrap/workflow ne sont pas appliquées. Vérifiez le projet (SQL Editor → Project), puis : SELECT current_database(), current_schema(); SELECT to_regclass(''public.workflow_transitions'');';
  END IF;

  IF to_regclass('public.mail_workflow_documents') IS NULL THEN
    RAISE EXCEPTION
      'Table public.mail_workflow_documents absente. Appliquez d''abord la migration AJ (20260616900000_workflow_steps_8_9_closure.sql) sur ce projet.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Transitions workflow: tableau structuré de pièces jointes
-- ---------------------------------------------------------------------------
ALTER TABLE public.workflow_transitions
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflow_transitions_attachment_urls_is_array'
      AND conrelid = 'public.workflow_transitions'::regclass
  ) THEN
    ALTER TABLE public.workflow_transitions
      ADD CONSTRAINT workflow_transitions_attachment_urls_is_array
      CHECK (jsonb_typeof(attachment_urls) = 'array');
  END IF;
END $$;

WITH legacy_matches AS (
  SELECT
    wt.id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('url', m[1])
        ORDER BY ordinality
      ) FILTER (WHERE m[1] IS NOT NULL),
      '[]'::jsonb
    ) AS attachment_urls
  FROM public.workflow_transitions wt
  LEFT JOIN LATERAL regexp_matches(
    COALESCE(wt.notes, ''),
    '📎 Document joint:\s*(\S+)',
    'g'
  ) WITH ORDINALITY AS rm(m, ordinality) ON true
  GROUP BY wt.id
)
UPDATE public.workflow_transitions wt
SET attachment_urls = legacy_matches.attachment_urls
FROM legacy_matches
WHERE wt.id = legacy_matches.id
  AND wt.attachment_urls = '[]'::jsonb
  AND legacy_matches.attachment_urls <> '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Accusés / documents workflow 8-9 : passer à plusieurs fichiers
-- ---------------------------------------------------------------------------
ALTER TABLE public.mail_workflow_documents
  DROP CONSTRAINT IF EXISTS mail_workflow_documents_mail_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mwd_storage_unique
  ON public.mail_workflow_documents(storage_bucket, storage_path);

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
  ON CONFLICT (storage_bucket, storage_path) DO UPDATE SET
    file_name = EXCLUDED.file_name,
    uploaded_by = EXCLUDED.uploaded_by,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_mail_workflow_document(uuid, integer, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_workflow_transition_attachments(
  _mail_id uuid,
  _performed_by uuid,
  _from_step integer,
  _to_step integer,
  _action text,
  _attachment_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_transition_id uuid;
BEGIN
  IF COALESCE(jsonb_array_length(_attachment_urls), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'updated', false);
  END IF;

  SELECT wt.id
  INTO v_transition_id
  FROM public.workflow_transitions wt
  WHERE wt.mail_id = _mail_id
    AND wt.performed_by = _performed_by
    AND wt.from_step IS NOT DISTINCT FROM _from_step
    AND wt.to_step = _to_step
    AND wt.action = _action
  ORDER BY wt.created_at DESC
  LIMIT 1;

  IF v_transition_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transition introuvable');
  END IF;

  UPDATE public.workflow_transitions
  SET attachment_urls = COALESCE(_attachment_urls, '[]'::jsonb)
  WHERE id = v_transition_id;

  RETURN jsonb_build_object('success', true, 'updated', true, 'transition_id', v_transition_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_workflow_transition_attachments(uuid, uuid, integer, integer, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
