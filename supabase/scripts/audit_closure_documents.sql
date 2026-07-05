-- Audit documents de clôture (accusé de réception sortant) — post-migration AJ

-- 1. Volume global
SELECT COUNT(*) AS total_accuse_documents
FROM public.mail_workflow_documents
WHERE document_type = 'accuse_reception_sortant';

-- 2. Courriers étape 8/9 sans accusé (actifs)
SELECT m.id, m.reference_number, m.current_step, m.status,
       m.step8_arrived_at, m.step8_transmitted_at
FROM public.mails m
WHERE m.current_step IN (8, 9)
  AND m.status <> 'archived'
  AND NOT public.has_accuse_reception_sortant(m.id)
ORDER BY m.updated_at DESC
LIMIT 50;

-- 3. Courriers archivés sans accusé (legacy — informatif, pas bloquant)
SELECT m.id, m.reference_number, m.workflow_completed_at
FROM public.mails m
WHERE m.status = 'archived'
  AND NOT public.has_accuse_reception_sortant(m.id)
ORDER BY m.workflow_completed_at DESC NULLS LAST
LIMIT 20;

-- 4. Doublons (ne doit pas exister grâce à UNIQUE mail_id + document_type)
SELECT mail_id, document_type, COUNT(*)
FROM public.mail_workflow_documents
GROUP BY mail_id, document_type
HAVING COUNT(*) > 1;

-- 5. Chemins storage invalides (storage_path NULL ou vide)
SELECT id, mail_id, storage_path, file_name
FROM public.mail_workflow_documents
WHERE storage_path IS NULL OR trim(storage_path) = '';

-- 6. Backfill transitions step 8 non migrées (notes avec deposits/ sans ligne document)
SELECT wt.mail_id, wt.notes, wt.created_at
FROM public.workflow_transitions wt
WHERE wt.from_step = 8
  AND (wt.notes ILIKE '%deposits/%' OR wt.notes ILIKE '%Document joint:%')
  AND NOT EXISTS (
    SELECT 1 FROM public.mail_workflow_documents d
    WHERE d.mail_id = wt.mail_id AND d.document_type = 'accuse_reception_sortant'
  )
ORDER BY wt.created_at DESC
LIMIT 30;

-- 7. Test unitaire RPC (remplacer UUID)
-- SELECT public.has_accuse_reception_sortant('00000000-0000-0000-0000-000000000000'::uuid);
