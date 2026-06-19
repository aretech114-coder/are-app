-- Journal des tentatives d'envoi e-mail workflow

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mail_id uuid REFERENCES public.mails(id) ON DELETE SET NULL,
  step_number integer,
  notification_type text NOT NULL,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  skip_reason text,
  error_message text,
  provider text,
  provider_message_id text,
  trigger_source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at
  ON public.notification_deliveries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_mail_id
  ON public.notification_deliveries(mail_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
  ON public.notification_deliveries(status);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_deliveries_admin_select"
  ON public.notification_deliveries
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR public.has_role(auth.uid(), 'admin')
  );

GRANT SELECT ON public.notification_deliveries TO authenticated;

NOTIFY pgrst, 'reload schema';
