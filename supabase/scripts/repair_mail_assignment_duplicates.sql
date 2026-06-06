-- Vérifier / réparer les doublons d'assignation (surtout étape 4).
-- La migration 20260606230000_fix_step4_assignment_duplicates.sql nettoie toute la base ;
-- ce script sert à contrôler un courrier précis après coup.

-- Courrier test prod : 48937-04-RK
-- mail_id = 'bdb11e4a-762c-49fc-af7f-2e4f3e68be26'

-- 1) Avant : détecter les doublons
SELECT
  p.full_name,
  ma.access_mode,
  ma.status,
  COUNT(*) AS n
FROM mail_assignments ma
JOIN profiles p ON p.id = ma.assigned_to
WHERE ma.mail_id = 'bdb11e4a-762c-49fc-af7f-2e4f3e68be26'::uuid
  AND ma.step_number = 4
GROUP BY p.full_name, ma.access_mode, ma.status, ma.assigned_to
HAVING COUNT(*) > 1;

-- 2) Détail des lignes
SELECT ma.id, p.full_name, ma.access_mode, ma.status, ma.created_at
FROM mail_assignments ma
JOIN profiles p ON p.id = ma.assigned_to
WHERE ma.mail_id = 'bdb11e4a-762c-49fc-af7f-2e4f3e68be26'::uuid
  AND ma.step_number = 4
ORDER BY p.full_name, ma.access_mode, ma.created_at;

-- 3) Si migration P pas encore appliquée — dédoublonnage manuel pour CE courrier
DELETE FROM mail_assignments
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY mail_id, assigned_to, step_number, access_mode
        ORDER BY
          CASE status
            WHEN 'completed' THEN 1
            WHEN 'acknowledged' THEN 1
            WHEN 'submitted' THEN 2
            WHEN 'pending' THEN 3
            WHEN 'proposed' THEN 4
            ELSE 5
          END,
          created_at ASC
      ) AS rn
    FROM mail_assignments
    WHERE mail_id = 'bdb11e4a-762c-49fc-af7f-2e4f3e68be26'::uuid
  ) ranked
  WHERE rn > 1
);

-- 4) Après : attendu = 3 viewers + 5 contributors (sans doublon)
SELECT p.full_name, ma.access_mode, ma.status
FROM mail_assignments ma
JOIN profiles p ON p.id = ma.assigned_to
WHERE ma.mail_id = 'bdb11e4a-762c-49fc-af7f-2e4f3e68be26'::uuid
  AND ma.step_number = 4
ORDER BY ma.access_mode, p.full_name;
