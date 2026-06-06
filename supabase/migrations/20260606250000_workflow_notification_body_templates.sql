-- Templates de corps d'e-mail personnalisables par étape workflow
ALTER TABLE public.workflow_step_responsibles
  ADD COLUMN IF NOT EXISTS notification_body_template text,
  ADD COLUMN IF NOT EXISTS notification_body_viewer_template text;

COMMENT ON COLUMN public.workflow_step_responsibles.notification_body_template IS
  'Corps HTML de l''e-mail (shortcodes: {{recipient_name}}, {{step_name}}, {{mail_subject}}, etc.)';
COMMENT ON COLUMN public.workflow_step_responsibles.notification_body_viewer_template IS
  'Corps HTML pour les assignés en lecture seule (viewer). Si vide, notification_body_template est utilisé.';
