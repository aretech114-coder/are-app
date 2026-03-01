-- Enable pg_cron and pg_net extensions for scheduled SLA checks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add RLS policy for conseiller_juridique to update mails at step 4
CREATE POLICY "Conseiller juridique can update mail"
ON public.mails
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'conseiller_juridique'::app_role));

-- Add SELECT policy for Dircaba
CREATE POLICY "Dircaba can update mail"
ON public.mails
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'dircaba'::app_role));