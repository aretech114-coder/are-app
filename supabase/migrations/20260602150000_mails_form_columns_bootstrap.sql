-- Bootstrap colonnes formulaire d'enregistrement courrier (base Production partielle)
-- Corrige: Could not find the 'addressed_to' column of 'mails' in the schema cache

-- Champs expéditeur / réception (20260217120321)
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_phone text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_email text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_address text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_city text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS sender_country text DEFAULT 'République démocratique du Congo';
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS reception_date date;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS deposit_time text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS addressed_to text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS comments text;

-- Registre / workflow (20260525195716, 20260526211553, 20260602120000)
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS direction text DEFAULT 'entrant';
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS target_service_id uuid;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS province_code text;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS locked_for_edit boolean NOT NULL DEFAULT false;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS parent_mail_id uuid;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 1;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS deadline_at timestamptz;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS mail_type text DEFAULT 'standard';
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS workflow_started_at timestamptz DEFAULT now();
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS workflow_completed_at timestamptz;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS ministre_absent boolean NOT NULL DEFAULT false;
ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.mails SET direction = 'entrant' WHERE direction IS NULL;
UPDATE public.mails SET current_step = 1 WHERE current_step IS NULL;

CREATE INDEX IF NOT EXISTS idx_mails_direction ON public.mails(direction);
CREATE INDEX IF NOT EXISTS idx_mails_province ON public.mails(province_code);

NOTIFY pgrst, 'reload schema';
