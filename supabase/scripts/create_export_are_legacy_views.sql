-- ============================================================
-- Vues d'export legacy ARE → ERP (migration progressive)
-- Prérequis : tables P0/P1 présentes ; rôle erp_readonly (grant script).
-- Éligible = status = 'archived' AND workflow_completed_at IS NOT NULL
-- ============================================================

-- ---------------------------------------------------------------------------
-- Mails
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_mails_eligible_v1
WITH (security_invoker = true) AS
SELECT m.*
FROM public.mails m
WHERE m.status = 'archived'::public.mail_status
  AND m.workflow_completed_at IS NOT NULL;

CREATE OR REPLACE VIEW public.export_are_mails_v1
WITH (security_invoker = true) AS
SELECT m.*
FROM public.mails m;

-- ---------------------------------------------------------------------------
-- Transitions / assignations / contributions / docs de clôture
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_transitions_eligible_v1
WITH (security_invoker = true) AS
SELECT wt.*
FROM public.workflow_transitions wt
WHERE wt.mail_id IN (SELECT id FROM public.export_are_mails_eligible_v1);

CREATE OR REPLACE VIEW public.export_are_transitions_v1
WITH (security_invoker = true) AS
SELECT wt.*
FROM public.workflow_transitions wt;

CREATE OR REPLACE VIEW public.export_are_assignments_eligible_v1
WITH (security_invoker = true) AS
SELECT ma.*
FROM public.mail_assignments ma
WHERE ma.mail_id IN (SELECT id FROM public.export_are_mails_eligible_v1);

CREATE OR REPLACE VIEW public.export_are_assignments_v1
WITH (security_invoker = true) AS
SELECT ma.*
FROM public.mail_assignments ma;

CREATE OR REPLACE VIEW public.export_are_contributions_eligible_v1
WITH (security_invoker = true) AS
SELECT mc.*
FROM public.mail_contributions mc
WHERE mc.mail_id IN (SELECT id FROM public.export_are_mails_eligible_v1);

CREATE OR REPLACE VIEW public.export_are_contributions_v1
WITH (security_invoker = true) AS
SELECT mc.*
FROM public.mail_contributions mc;

CREATE OR REPLACE VIEW public.export_are_closure_docs_eligible_v1
WITH (security_invoker = true) AS
SELECT d.*
FROM public.mail_workflow_documents d
WHERE d.mail_id IN (SELECT id FROM public.export_are_mails_eligible_v1);

CREATE OR REPLACE VIEW public.export_are_closure_docs_v1
WITH (security_invoker = true) AS
SELECT d.*
FROM public.mail_workflow_documents d;

-- ---------------------------------------------------------------------------
-- Users (provisionnement UUID ERP)
-- DROP requis si colonnes enrichies (avatar_path, role, is_active)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.export_are_users_v1 CASCADE;

CREATE OR REPLACE VIEW public.export_are_users_v1
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.avatar_url,
  CASE
    WHEN p.avatar_url IS NULL OR btrim(p.avatar_url) = '' THEN NULL::text
    WHEN p.avatar_url NOT LIKE 'http%' AND p.avatar_url LIKE '%/%' THEN btrim(p.avatar_url)
    WHEN position('/avatars/' IN p.avatar_url) > 0 THEN
      substring(p.avatar_url FROM position('/avatars/' IN p.avatar_url) + length('/avatars/'))
    ELSE NULL::text
  END AS avatar_path,
  p.province_code,
  p.tenant_id,
  p.is_available,
  COALESCE(p.is_available, true) AS is_active,
  p.created_at,
  p.updated_at,
  (
    SELECT ur.role::text
    FROM public.user_roles ur
    WHERE ur.user_id = p.id
    ORDER BY ur.role::text
    LIMIT 1
  ) AS role,
  COALESCE(
    (
      SELECT array_agg(ur.role::text ORDER BY ur.role::text)
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
    ),
    ARRAY[]::text[]
  ) AS roles
FROM public.profiles p;

-- ---------------------------------------------------------------------------
-- Manifest Storage (éligibles uniquement)
-- bucket + path prioritaires ; url éventuellement expirée
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.export_are_storage_manifest_v1
WITH (security_invoker = true) AS
-- PJ registre (mails.attachment_urls)
SELECT
  m.id AS mail_id,
  'mails'::text AS source_table,
  m.id AS source_id,
  COALESCE(NULLIF(elem->>'bucket', ''), 'mail-incoming') AS storage_bucket,
  NULLIF(elem->>'path', '') AS storage_path,
  NULLIF(elem->>'name', '') AS file_name,
  NULLIF(elem->>'url', '') AS legacy_url
FROM public.export_are_mails_eligible_v1 m
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(m.attachment_urls, '[]'::jsonb)) = 'array'
    THEN COALESCE(m.attachment_urls, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE NULLIF(elem->>'path', '') IS NOT NULL

UNION ALL

-- PJ contributions
SELECT
  mc.mail_id,
  'mail_contributions'::text,
  mc.id,
  COALESCE(NULLIF(elem->>'bucket', ''), 'mail-documents'),
  NULLIF(elem->>'path', ''),
  NULLIF(elem->>'name', ''),
  NULLIF(elem->>'url', '')
FROM public.export_are_contributions_eligible_v1 mc
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(mc.attachment_urls, '[]'::jsonb)) = 'array'
    THEN COALESCE(mc.attachment_urls, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE NULLIF(elem->>'path', '') IS NOT NULL

UNION ALL

-- PJ transitions structurées
SELECT
  wt.mail_id,
  'workflow_transitions'::text,
  wt.id,
  COALESCE(NULLIF(elem->>'bucket', ''), 'mail-documents'),
  NULLIF(elem->>'path', ''),
  NULLIF(elem->>'name', ''),
  NULLIF(elem->>'url', '')
FROM public.export_are_transitions_eligible_v1 wt
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(COALESCE(wt.attachment_urls, '[]'::jsonb)) = 'array'
    THEN COALESCE(wt.attachment_urls, '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS elem
WHERE NULLIF(elem->>'path', '') IS NOT NULL

UNION ALL

-- Docs de clôture
SELECT
  d.mail_id,
  'mail_workflow_documents'::text,
  d.id,
  COALESCE(NULLIF(d.storage_bucket, ''), 'mail-documents'),
  NULLIF(d.storage_path, ''),
  d.file_name,
  NULL::text
FROM public.export_are_closure_docs_eligible_v1 d
WHERE NULLIF(d.storage_path, '') IS NOT NULL

UNION ALL

-- GED PDF
SELECT
  g.mail_id,
  'ged_documents'::text,
  g.id,
  'ged-documents'::text,
  NULLIF(g.pdf_storage_path, ''),
  g.file_name,
  NULL::text
FROM public.ged_documents g
WHERE g.mail_id IN (SELECT id FROM public.export_are_mails_eligible_v1)
  AND NULLIF(g.pdf_storage_path, '') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Stats readiness (une ligne) — DROP si colonnes mails_open / open_by_step ajoutées
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.export_are_migration_stats_v1 CASCADE;

CREATE OR REPLACE VIEW public.export_are_migration_stats_v1
WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*) FROM public.mails) AS mails_total,
  (SELECT COUNT(*) FROM public.export_are_mails_eligible_v1) AS mails_eligible,
  (
    SELECT COUNT(*)
    FROM public.mails m
    WHERE NOT (
      m.status = 'archived'::public.mail_status
      AND m.workflow_completed_at IS NOT NULL
    )
  ) AS mails_in_progress,
  (
    SELECT COUNT(*)
    FROM public.mails m
    WHERE NOT (
      m.status = 'archived'::public.mail_status
      AND m.workflow_completed_at IS NOT NULL
    )
  ) AS mails_open,
  (
    SELECT COALESCE(
      jsonb_object_agg(step_key, cnt),
      '{}'::jsonb
    )
    FROM (
      SELECT
        COALESCE(m.current_step, 0)::text AS step_key,
        COUNT(*)::int AS cnt
      FROM public.mails m
      WHERE NOT (
        m.status = 'archived'::public.mail_status
        AND m.workflow_completed_at IS NOT NULL
      )
      GROUP BY COALESCE(m.current_step, 0)
    ) s
  ) AS open_by_step,
  (
    SELECT COUNT(*)
    FROM public.export_are_mails_eligible_v1 m
    WHERE m.workflow_completed_at >= now() - interval '1 day'
  ) AS eligible_last_24h,
  (
    SELECT COUNT(*)
    FROM public.export_are_mails_eligible_v1 m
    WHERE m.workflow_completed_at >= now() - interval '7 days'
  ) AS eligible_last_7d,
  (
    SELECT COUNT(*)
    FROM public.export_are_mails_eligible_v1 m
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.mail_workflow_documents d
      WHERE d.mail_id = m.id
    )
  ) AS eligible_without_closure_doc,
  (SELECT COUNT(*) FROM public.export_are_transitions_eligible_v1) AS transitions_eligible,
  (SELECT COUNT(*) FROM public.export_are_assignments_eligible_v1) AS assignments_eligible,
  (SELECT COUNT(*) FROM public.export_are_contributions_eligible_v1) AS contributions_eligible,
  (SELECT COUNT(*) FROM public.export_are_closure_docs_eligible_v1) AS closure_docs_eligible,
  (SELECT COUNT(*) FROM public.export_are_users_v1) AS users_total,
  now() AS computed_at;

-- ---------------------------------------------------------------------------
-- Grants (ignorer si rôle absent — réappliquer après grant_erp_readonly)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_readonly') THEN
    GRANT SELECT ON
      public.export_are_mails_eligible_v1,
      public.export_are_mails_v1,
      public.export_are_transitions_eligible_v1,
      public.export_are_transitions_v1,
      public.export_are_assignments_eligible_v1,
      public.export_are_assignments_v1,
      public.export_are_contributions_eligible_v1,
      public.export_are_contributions_v1,
      public.export_are_closure_docs_eligible_v1,
      public.export_are_closure_docs_v1,
      public.export_are_users_v1,
      public.export_are_storage_manifest_v1,
      public.export_are_migration_stats_v1
    TO erp_readonly;
  END IF;
END $$;

-- Smoke
SELECT * FROM public.export_are_migration_stats_v1;
