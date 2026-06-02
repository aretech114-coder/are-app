-- ============================================================
-- AUDIT PRODUCTION — alignement schéma ARE App
-- Exécuter dans Supabase SQL Editor (Production)
-- ============================================================

-- 1) Tables critiques
SELECT 'TABLE' AS kind, expected.tbl AS name,
       CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY[
  'mails','profiles','user_roles','admin_permissions',
  'mail_assignments','workflow_transitions','notifications',
  'workflow_steps','workflow_step_responsibles','workflow_step_fallbacks',
  'sla_config','mail_contributions','mail_types','services_concernes',
  'mail_sub_assignments','site_settings','calendar_events','missions',
  'tenants','api_keys','mail_processing_history','custom_fields'
]) AS expected(tbl)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = expected.tbl
ORDER BY status DESC, name;

-- 2) Colonnes mails critiques
SELECT expected.col AS column_name,
       CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY[
  'reference_number','attachment_url','attachment_urls','direction',
  'addressed_to','province_code','sender_province','current_step',
  'ministre_absent','parent_mail_id','target_service_id'
]) AS expected(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = 'mails'
 AND c.column_name = expected.col
ORDER BY status DESC, column_name;

-- 3) Fonctions RPC critiques
SELECT 'FUNCTION' AS kind, expected.fn AS name,
       CASE WHEN p.oid IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY[
  'has_role','can_access_mail','list_my_mails','advance_workflow_step',
  'resolve_step_assignee','submit_step4_treatment','submit_step7_acknowledgement',
  'get_user_province','resolve_fallback_user'
]) AS expected(fn)
LEFT JOIN pg_proc p ON p.proname = expected.fn
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
ORDER BY status DESC, name;

-- 4) Policies INSERT mails
SELECT COUNT(*) AS insert_policies_mails,
       CASE WHEN COUNT(*) >= 3 THEN 'OK' ELSE 'MANQUANT' END AS status
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mails' AND cmd = 'INSERT';

-- 5) Policies gravity mails (SELECT/UPDATE)
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mails'
  AND policyname IN ('mails_select_by_access', 'mails_update_by_access')
ORDER BY policyname;

-- 6) Données workflow
SELECT
  (SELECT COUNT(*) FROM public.workflow_steps) AS steps,
  (SELECT COUNT(*) FROM public.sla_config) AS sla,
  (SELECT COUNT(*) FROM public.workflow_step_responsibles) AS responsibles,
  CASE WHEN (SELECT COUNT(*) FROM public.workflow_steps) >= 9 THEN 'OK' ELSE 'INCOMPLET' END AS workflow_status;

-- 7) Buckets Storage
SELECT expected.bucket_id AS bucket,
       CASE WHEN b.id IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM unnest(ARRAY['mail-incoming','mail-documents','branding','avatars']) AS expected(bucket_id)
LEFT JOIN storage.buckets b ON b.id = expected.bucket_id
ORDER BY status DESC, bucket;

-- 8) Valeurs enum app_role
SELECT e.enumlabel AS role_value
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname = 'app_role'
ORDER BY e.enumsortorder;

-- 9) Migrations Supabase CLI (peut échouer si jamais utilisé — ignorer l'erreur)
-- SELECT version, name
-- FROM supabase_migrations.schema_migrations
-- ORDER BY version DESC
-- LIMIT 30;
