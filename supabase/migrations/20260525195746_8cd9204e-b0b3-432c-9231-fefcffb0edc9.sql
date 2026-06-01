
CREATE OR REPLACE FUNCTION public.lock_mail_on_workflow_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_registrar uuid;
BEGIN
  IF NEW.action IS NULL OR NEW.action = 'register' THEN
    RETURN NEW;
  END IF;
  SELECT registered_by INTO v_registrar FROM public.mails WHERE id = NEW.mail_id;
  IF v_registrar IS DISTINCT FROM NEW.performed_by THEN
    UPDATE public.mails SET locked_for_edit = true WHERE id = NEW.mail_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Recalcule : verrouille seulement si une transition existe faite par qqn d'autre que le registraire
UPDATE public.mails m
SET locked_for_edit = EXISTS (
  SELECT 1 FROM public.workflow_transitions wt
  WHERE wt.mail_id = m.id
    AND wt.action <> 'register'
    AND wt.performed_by IS DISTINCT FROM m.registered_by
);
