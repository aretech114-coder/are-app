-- Champs registre : référence papier + ID système (QR) distincts du numéro courrier.

ALTER TABLE public.mails
  ADD COLUMN IF NOT EXISTS registry_reference text,
  ADD COLUMN IF NOT EXISTS system_reference text;

COMMENT ON COLUMN public.mails.registry_reference IS 'Référence registre / courrier (saisie réception, optionnelle)';
COMMENT ON COLUMN public.mails.system_reference IS 'Identifiant technique auto CR-YYYYMMDD-XXXX (QR, traçabilité)';

NOTIFY pgrst, 'reload schema';
