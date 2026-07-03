-- Audit : templates notification avec lien /inbox en dur (sans {{inbox_url}})
-- Exécuter en prod après déploiement deep link Inbox

SELECT
  step_number,
  LEFT(notification_body_template, 120) AS body_preview
FROM public.workflow_step_responsibles
WHERE notification_body_template ILIKE '%/inbox%'
  AND notification_body_template NOT ILIKE '%{{inbox_url}}%';

SELECT
  step_number,
  LEFT(notification_body_viewer_template, 120) AS viewer_body_preview
FROM public.workflow_step_responsibles
WHERE notification_body_viewer_template ILIKE '%/inbox%'
  AND notification_body_viewer_template NOT ILIKE '%{{inbox_url}}%';

-- Corriger manuellement : remplacer href="/inbox" par href="{{inbox_url}}"
