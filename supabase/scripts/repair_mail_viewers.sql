-- Réparer les copies lecture seule supprimées par erreur à l'entrée en étape 4.
-- Remplacer les placeholders puis exécuter dans le SQL Editor.

-- 1) Vérifier les assignations actuelles sur un courrier
-- SELECT ma.*, p.full_name
-- FROM mail_assignments ma
-- JOIN profiles p ON p.id = ma.assigned_to
-- WHERE ma.mail_id = 'MAIL_UUID_ICI'::uuid AND ma.step_number = 4;

-- 2) Réinsérer un viewer (lecture seule) — statut pending, visible via list_my_mails
INSERT INTO mail_assignments (mail_id, assigned_by, assigned_to, step_number, status, access_mode)
VALUES (
  'MAIL_UUID_ICI'::uuid,
  'DG_USER_UUID_ICI'::uuid,
  'VIEWER_USER_UUID_ICI'::uuid,
  4,
  'pending',
  'viewer'
)
ON CONFLICT DO NOTHING;

-- 3) Notification (optionnel)
INSERT INTO notifications (user_id, title, message, mail_id)
VALUES (
  'VIEWER_USER_UUID_ICI'::uuid,
  'Courrier en copie — Lecture seule',
  'Un courrier vous est transmis en lecture seule (copie).',
  'MAIL_UUID_ICI'::uuid
);
