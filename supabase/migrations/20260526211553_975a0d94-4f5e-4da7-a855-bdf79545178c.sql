ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS allow_reply_creation boolean NOT NULL DEFAULT false;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS parent_mail_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_mails_parent_mail_id ON public.mails(parent_mail_id);