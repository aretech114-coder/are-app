-- Colonnes core manquantes sur mails (base Production partielle)
-- Corrige: Could not find the 'attachment_url' column of 'mails' in the schema cache

ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS qr_code_data text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_organization text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS document_summary text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS registered_by uuid;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS assigned_agent_id uuid;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS ai_draft text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_province text;

NOTIFY pgrst, 'reload schema';
