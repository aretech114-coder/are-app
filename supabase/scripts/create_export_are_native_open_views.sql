-- ============================================================
-- Vues d'export ARE → ERP : courriers OUVERTS (import natif)
-- Prérequis : grant_erp_readonly_legacy.sql + create_export_are_legacy_views.sql
-- Ouvert = NOT (archived AND workflow_completed_at IS NOT NULL)
-- Alimente : legacy-are-import-native (dry_run / pilot / full)
-- ============================================================

-- ---------------------------------------------------------------------------
-- Mails ouverts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_mails_open_v1
WITH (security_invoker = true) AS
SELECT m.*
FROM public.mails m
WHERE NOT (
  m.status = 'archived'::public.mail_status
  AND m.workflow_completed_at IS NOT NULL
);

-- ---------------------------------------------------------------------------
-- Placement : étape courante + assignees + steps_state + primary_assignee_id
-- Heuristique steps_state :
--   1..current-1 = completed (étape 3 skipped si ministre_absent)
--   current = pending ; current+1..9 = not_started
-- primary_assignee_id : contributor pending/proposed de l'étape courante,
--   sinon premier assignee de l'étape (contributor > custodian > viewer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_mail_placement_v1
WITH (security_invoker = true) AS
SELECT
  m.id AS mail_id,
  COALESCE(m.current_step, 1) AS current_step,
  m.status,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'assigned_to', ma.assigned_to,
          'assigned_by', ma.assigned_by,
          'step_number', ma.step_number,
          'access_mode', ma.access_mode,
          'status', ma.status,
          'completed_at', ma.completed_at
        )
        ORDER BY ma.step_number, ma.created_at NULLS LAST
      )
      FROM public.mail_assignments ma
      WHERE ma.mail_id = m.id
    ),
    '[]'::jsonb
  ) AS assignees,
  (
    SELECT COALESCE(jsonb_object_agg(gs.n::text, st.state_label), '{}'::jsonb)
    FROM generate_series(1, 9) AS gs(n)
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN gs.n < COALESCE(m.current_step, 1) THEN
            CASE
              WHEN gs.n = 3 AND COALESCE(m.ministre_absent, false) THEN 'skipped'
              ELSE 'completed'
            END
          WHEN gs.n = COALESCE(m.current_step, 1) THEN 'pending'
          ELSE 'not_started'
        END AS state_label
    ) st
  ) AS steps_state,
  COALESCE(
    (
      SELECT ma.assigned_to
      FROM public.mail_assignments ma
      WHERE ma.mail_id = m.id
        AND ma.step_number = COALESCE(m.current_step, 1)
        AND COALESCE(ma.access_mode, 'contributor') = 'contributor'
        AND COALESCE(ma.status, 'pending') IN ('pending', 'proposed')
      ORDER BY ma.created_at NULLS LAST
      LIMIT 1
    ),
    (
      SELECT ma.assigned_to
      FROM public.mail_assignments ma
      WHERE ma.mail_id = m.id
        AND ma.step_number = COALESCE(m.current_step, 1)
      ORDER BY
        CASE COALESCE(ma.access_mode, 'contributor')
          WHEN 'contributor' THEN 0
          WHEN 'custodian' THEN 1
          ELSE 2
        END,
        ma.created_at NULLS LAST
      LIMIT 1
    )
  ) AS primary_assignee_id
FROM public.export_are_mails_open_v1 m;

-- ---------------------------------------------------------------------------
-- Historique / assignations / docs des ouverts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_transitions_open_v1
WITH (security_invoker = true) AS
SELECT wt.*
FROM public.workflow_transitions wt
WHERE wt.mail_id IN (SELECT id FROM public.export_are_mails_open_v1);

CREATE OR REPLACE VIEW public.export_are_assignments_open_v1
WITH (security_invoker = true) AS
SELECT ma.*
FROM public.mail_assignments ma
WHERE ma.mail_id IN (SELECT id FROM public.export_are_mails_open_v1);

CREATE OR REPLACE VIEW public.export_are_contributions_open_v1
WITH (security_invoker = true) AS
SELECT mc.*
FROM public.mail_contributions mc
WHERE mc.mail_id IN (SELECT id FROM public.export_are_mails_open_v1);

CREATE OR REPLACE VIEW public.export_are_workflow_documents_open_v1
WITH (security_invoker = true) AS
SELECT d.*
FROM public.mail_workflow_documents d
WHERE d.mail_id IN (SELECT id FROM public.export_are_mails_open_v1);

-- ---------------------------------------------------------------------------
-- Manifest Storage (ouverts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_storage_manifest_open_v1
WITH (security_invoker = true) AS
SELECT
  m.id AS mail_id,
  'mails'::text AS source_table,
  m.id AS source_id,
  COALESCE(NULLIF(elem->>'bucket', ''), 'mail-incoming') AS storage_bucket,
  NULLIF(elem->>'path', '') AS storage_path,
  NULLIF(elem->>'name', '') AS file_name,
  NULLIF(elem->>'url', '') AS legacy_url,
  NULL::integer AS step_number,
  'incoming'::text AS kind
FROM public.export_are_mails_open_v1 m
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(m.attachment_urls, '[]'::jsonb)) = 'array'
    THEN COALESCE(m.attachment_urls, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE NULLIF(elem->>'path', '') IS NOT NULL

UNION ALL

SELECT
  mc.mail_id,
  'mail_contributions'::text,
  mc.id,
  COALESCE(NULLIF(elem->>'bucket', ''), 'mail-documents'),
  NULLIF(elem->>'path', ''),
  NULLIF(elem->>'name', ''),
  NULLIF(elem->>'url', ''),
  mc.step_number,
  'contribution'::text
FROM public.export_are_contributions_open_v1 mc
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(mc.attachment_urls, '[]'::jsonb)) = 'array'
    THEN COALESCE(mc.attachment_urls, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE NULLIF(elem->>'path', '') IS NOT NULL

UNION ALL

SELECT
  wt.mail_id,
  'workflow_transitions'::text,
  wt.id,
  COALESCE(NULLIF(elem->>'bucket', ''), 'mail-documents'),
  NULLIF(elem->>'path', ''),
  NULLIF(elem->>'name', ''),
  NULLIF(elem->>'url', ''),
  wt.to_step,
  'transition'::text
FROM public.export_are_transitions_open_v1 wt
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(wt.attachment_urls, '[]'::jsonb)) = 'array'
    THEN COALESCE(wt.attachment_urls, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE NULLIF(elem->>'path', '') IS NOT NULL

UNION ALL

SELECT
  d.mail_id,
  'mail_workflow_documents'::text,
  d.id,
  COALESCE(NULLIF(d.storage_bucket, ''), 'mail-documents'),
  NULLIF(d.storage_path, ''),
  d.file_name,
  NULL::text,
  d.step_number,
  'closure'::text
FROM public.export_are_workflow_documents_open_v1 d
WHERE NULLIF(d.storage_path, '') IS NOT NULL

UNION ALL

SELECT
  g.mail_id,
  'ged_documents'::text,
  g.id,
  'ged-documents'::text,
  NULLIF(g.pdf_storage_path, ''),
  g.file_name,
  NULL::text,
  9,
  'ged'::text
FROM public.ged_documents g
WHERE g.mail_id IN (SELECT id FROM public.export_are_mails_open_v1)
  AND NULLIF(g.pdf_storage_path, '') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Définition workflow (mapping are_step_N)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_workflow_definition_v1
WITH (security_invoker = true) AS
SELECT
  ws.step_order AS step_number,
  ('are_step_' || ws.step_order::text) AS code,
  ws.name AS label,
  ws.responsible_role AS default_role,
  sla.default_hours AS sla_hours,
  (ws.step_order IN (3, 7)) AS skippable,
  ws.description,
  ws.is_active,
  ws.assignment_mode,
  ws.conditions
FROM public.workflow_steps ws
LEFT JOIN public.sla_config sla ON sla.step_number = ws.step_order
ORDER BY ws.step_order;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_readonly') THEN
    GRANT SELECT ON
      public.export_are_mails_open_v1,
      public.export_are_mail_placement_v1,
      public.export_are_transitions_open_v1,
      public.export_are_assignments_open_v1,
      public.export_are_contributions_open_v1,
      public.export_are_workflow_documents_open_v1,
      public.export_are_storage_manifest_open_v1,
      public.export_are_workflow_definition_v1
    TO erp_readonly;
  END IF;
END $$;

-- Smoke
SELECT count(*) AS mails_open FROM public.export_are_mails_open_v1;
SELECT mail_id, current_step, status, primary_assignee_id,
       jsonb_array_length(assignees) AS assignees_count
FROM public.export_are_mail_placement_v1
LIMIT 5;
SELECT * FROM public.export_are_workflow_definition_v1 ORDER BY step_number;
