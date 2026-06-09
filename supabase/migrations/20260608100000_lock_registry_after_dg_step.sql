-- Verrouiller le registre seulement après sortie de l'étape Traitement DG (étape 2),
-- pas lors du routage initial depuis la réception.

CREATE OR REPLACE FUNCTION public.lock_mail_on_workflow_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.action IS NOT NULL
     AND NEW.action <> 'register'
     AND COALESCE(NEW.from_step, 0) >= 2 THEN
    UPDATE public.mails SET locked_for_edit = true WHERE id = NEW.mail_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Déverrouiller les courriers encore à l'étape 2 (DG pas encore validé)
UPDATE public.mails
SET locked_for_edit = false
WHERE current_step = 2 AND locked_for_edit = true;
