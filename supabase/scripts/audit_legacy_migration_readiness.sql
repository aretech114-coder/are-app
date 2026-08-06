-- ============================================================
-- Audit readiness — migration progressive legacy ARE → ERP
-- Éligible = status = 'archived' AND workflow_completed_at IS NOT NULL
-- Ouvert = NOT (archived AND workflow_completed_at IS NOT NULL)
-- Exécuter dans Supabase SQL Editor (Production)
-- ============================================================

-- 0) Présence des vues open (import natif)
SELECT
  v.view_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'MANQUANT' END AS status
FROM (
  VALUES
    ('export_are_mails_open_v1'),
    ('export_are_mail_placement_v1'),
    ('export_are_transitions_open_v1'),
    ('export_are_assignments_open_v1'),
    ('export_are_contributions_open_v1'),
    ('export_are_workflow_documents_open_v1'),
    ('export_are_storage_manifest_open_v1'),
    ('export_are_workflow_definition_v1'),
    ('export_are_migration_stats_v1'),
    ('export_are_users_v1')
) AS v(view_name)
LEFT JOIN information_schema.views t
  ON t.table_schema = 'public' AND t.table_name = v.view_name
ORDER BY status DESC, view_name;

-- 1) Synthèse globale (utilise la vue si déjà créée)
SELECT *
FROM public.export_are_migration_stats_v1;

-- 2) Répartition par statut / étape (stock encore à finaliser / ouverts)
SELECT
  status::text AS status,
  current_step,
  COUNT(*) AS cnt
FROM public.mails
WHERE NOT (
  status = 'archived'::public.mail_status
  AND workflow_completed_at IS NOT NULL
)
GROUP BY status, current_step
ORDER BY current_step, status;

-- 2b) Spot-check placement (import natif)
SELECT
  mail_id,
  current_step,
  status::text AS status,
  primary_assignee_id,
  jsonb_array_length(assignees) AS assignees_count,
  steps_state
FROM public.export_are_mail_placement_v1
ORDER BY current_step, mail_id
LIMIT 10;

-- 3) Éligibles récents (delta pratique 24h / 7j)
SELECT
  COUNT(*) FILTER (
    WHERE workflow_completed_at >= now() - interval '1 day'
  ) AS eligible_last_24h,
  COUNT(*) FILTER (
    WHERE workflow_completed_at >= now() - interval '7 days'
  ) AS eligible_last_7d,
  COUNT(*) AS eligible_total
FROM public.mails
WHERE status = 'archived'::public.mail_status
  AND workflow_completed_at IS NOT NULL;

-- 4) Qualité : éligibles SANS document de clôture
SELECT
  m.id,
  m.reference_number,
  m.system_reference,
  m.workflow_completed_at,
  m.current_step
FROM public.mails m
WHERE m.status = 'archived'::public.mail_status
  AND m.workflow_completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.mail_workflow_documents d
    WHERE d.mail_id = m.id
  )
ORDER BY m.workflow_completed_at DESC
LIMIT 50;

-- 5) Spot-check : 20 derniers éligibles
SELECT
  m.id,
  m.reference_number,
  m.system_reference,
  m.subject,
  m.workflow_completed_at,
  m.current_step,
  (
    SELECT COUNT(*)
    FROM public.workflow_transitions wt
    WHERE wt.mail_id = m.id
  ) AS transitions_count,
  (
    SELECT COUNT(*)
    FROM public.mail_workflow_documents d
    WHERE d.mail_id = m.id
  ) AS closure_docs_count
FROM public.mails m
WHERE m.status = 'archived'::public.mail_status
  AND m.workflow_completed_at IS NOT NULL
ORDER BY m.workflow_completed_at DESC
LIMIT 20;

-- 6) Volumes liés aux éligibles
SELECT
  (SELECT COUNT(*) FROM public.workflow_transitions wt
   WHERE wt.mail_id IN (
     SELECT id FROM public.mails
     WHERE status = 'archived' AND workflow_completed_at IS NOT NULL
   )) AS transitions_eligible,
  (SELECT COUNT(*) FROM public.mail_assignments ma
   WHERE ma.mail_id IN (
     SELECT id FROM public.mails
     WHERE status = 'archived' AND workflow_completed_at IS NOT NULL
   )) AS assignments_eligible,
  (SELECT COUNT(*) FROM public.mail_contributions mc
   WHERE mc.mail_id IN (
     SELECT id FROM public.mails
     WHERE status = 'archived' AND workflow_completed_at IS NOT NULL
   )) AS contributions_eligible,
  (SELECT COUNT(*) FROM public.mail_workflow_documents d
   WHERE d.mail_id IN (
     SELECT id FROM public.mails
     WHERE status = 'archived' AND workflow_completed_at IS NOT NULL
   )) AS closure_docs_eligible;

-- 6b) Volumes liés aux ouverts (import natif)
SELECT
  (SELECT COUNT(*) FROM public.export_are_mails_open_v1) AS mails_open,
  (SELECT COUNT(*) FROM public.export_are_transitions_open_v1) AS transitions_open,
  (SELECT COUNT(*) FROM public.export_are_assignments_open_v1) AS assignments_open,
  (SELECT COUNT(*) FROM public.export_are_contributions_open_v1) AS contributions_open,
  (SELECT COUNT(*) FROM public.export_are_workflow_documents_open_v1) AS closure_docs_open;

-- 7) Users à provisionner (échantillon)
SELECT id, email, full_name, role, is_active, avatar_path IS NOT NULL AS has_avatar_path
FROM public.export_are_users_v1
ORDER BY full_name
LIMIT 30;

SELECT COUNT(*) AS profiles_total FROM public.profiles;

-- 8) Définition workflow
SELECT * FROM public.export_are_workflow_definition_v1 ORDER BY step_number;
