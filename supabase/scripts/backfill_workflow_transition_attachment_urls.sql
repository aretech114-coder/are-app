-- Backfill non destructif des pièces jointes workflow vers workflow_transitions.attachment_urls
-- À exécuter après la migration AO.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_transitions'
      AND column_name = 'attachment_urls'
  ) THEN
    RAISE EXCEPTION 'La colonne public.workflow_transitions.attachment_urls est absente. Appliquez d''abord la migration AO (20260728114000_workflow_transition_attachment_urls.sql).';
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

SELECT
  COUNT(*) FILTER (WHERE attachment_urls <> '[]'::jsonb) AS transitions_with_structured_attachments,
  COUNT(*) FILTER (WHERE notes LIKE '%📎 Document joint:%') AS transitions_with_legacy_markers
FROM public.workflow_transitions;
