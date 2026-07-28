-- Audit migration multi-fichiers workflow
-- À exécuter après AO puis après le backfill.

-- 1) Colonne additive présente ?
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workflow_transitions'
  AND column_name = 'attachment_urls';

-- 2) Fonction d'attachement présente ?
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN (
  'set_workflow_transition_attachments',
  'register_mail_workflow_document',
  'has_accuse_reception_sortant'
);

-- 3) Combien de transitions ont encore uniquement le marqueur legacy ?
SELECT
  COUNT(*) FILTER (WHERE notes LIKE '%📎 Document joint:%') AS with_legacy_marker,
  COUNT(*) FILTER (WHERE attachment_urls <> '[]'::jsonb) AS with_structured_attachments,
  COUNT(*) FILTER (
    WHERE notes LIKE '%📎 Document joint:%'
      AND attachment_urls = '[]'::jsonb
  ) AS still_needing_backfill
FROM public.workflow_transitions;

-- 4) Distribution des documents de clôture 8/9
SELECT
  step_number,
  document_type,
  COUNT(*) AS docs_count
FROM public.mail_workflow_documents
GROUP BY step_number, document_type
ORDER BY step_number, document_type;

-- 5) Courriers avec plusieurs accusés désormais possibles
SELECT
  mail_id,
  COUNT(*) AS accuse_count,
  ARRAY_AGG(file_name ORDER BY created_at) AS files
FROM public.mail_workflow_documents
WHERE document_type = 'accuse_reception_sortant'
GROUP BY mail_id
HAVING COUNT(*) > 1
ORDER BY accuse_count DESC, mail_id;
