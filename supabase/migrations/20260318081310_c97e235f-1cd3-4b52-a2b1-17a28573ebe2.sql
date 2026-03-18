
-- 1. RLS: DirCab and Ministre can see all mails (for Suivi dashboard)
CREATE POLICY "DirCab sees all mail" ON public.mails FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'dircab'));

CREATE POLICY "Ministre sees all mail" ON public.mails FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ministre'));

-- 2. Unique constraint on reference_number to prevent duplicates
ALTER TABLE public.mails ADD CONSTRAINT mails_reference_number_unique UNIQUE (reference_number);

-- 3. Add reminder_count to mail_assignments for SLA tracking
ALTER TABLE public.mail_assignments ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.mail_assignments ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;
