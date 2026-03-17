-- Add notification toggle per workflow step
ALTER TABLE public.workflow_step_responsibles
ADD COLUMN notify_enabled boolean NOT NULL DEFAULT true;

-- Add notification_emails column for steps that may have multiple recipients
-- (e.g. step 4 and 7 where conseillers are dynamically assigned)
ALTER TABLE public.workflow_step_responsibles
ADD COLUMN notification_subject_template text DEFAULT 'Courrier en attente — {{step_name}}';

COMMENT ON COLUMN public.workflow_step_responsibles.notify_enabled IS 'Toggle pour activer/désactiver les notifications par e-mail pour cette étape';
COMMENT ON COLUMN public.workflow_step_responsibles.notification_subject_template IS 'Template du sujet de l''e-mail de notification';