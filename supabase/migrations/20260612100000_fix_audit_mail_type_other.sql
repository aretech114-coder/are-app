-- Hotfix : colonne mail_type_other manquante en prod bloque trg_audit_mail_update
-- Erreur observée : record "old" has no field "mail_type_other" (validation étape 2 DG)

ALTER TABLE public.mails ADD COLUMN IF NOT EXISTS mail_type_other text;

-- audit_on_mail_update : comparaison via jsonb (résilient si colonne absente ailleurs)
CREATE OR REPLACE FUNCTION public.audit_on_mail_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_changed_fields text[];
  v_actor uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_ref := COALESCE(NEW.registry_reference, NEW.reference_number, NEW.id::text);
  v_actor := auth.uid();
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  IF OLD.locked_for_edit IS DISTINCT FROM NEW.locked_for_edit THEN
    PERFORM public.log_audit_event(
      _actor_user_id := v_actor,
      _action := 'mail.lock',
      _category := 'registry',
      _entity_type := 'mail',
      _entity_id := NEW.id,
      _summary := CASE
        WHEN NEW.locked_for_edit THEN format('Registre verrouillé pour %s', v_ref)
        ELSE format('Registre déverrouillé pour %s', v_ref)
      END,
      _metadata := jsonb_build_object(
        'reference_number', NEW.reference_number,
        'registry_reference', NEW.registry_reference,
        'locked_for_edit', NEW.locked_for_edit
      ),
      _source := 'db_trigger'
    );
  END IF;

  v_changed_fields := ARRAY[]::text[];

  IF v_old->>'subject' IS DISTINCT FROM v_new->>'subject' THEN
    v_changed_fields := array_append(v_changed_fields, 'subject');
  END IF;
  IF v_old->>'sender_name' IS DISTINCT FROM v_new->>'sender_name' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_name');
  END IF;
  IF v_old->>'sender_organization' IS DISTINCT FROM v_new->>'sender_organization' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_organization');
  END IF;
  IF v_old->>'sender_phone' IS DISTINCT FROM v_new->>'sender_phone' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_phone');
  END IF;
  IF v_old->>'sender_email' IS DISTINCT FROM v_new->>'sender_email' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_email');
  END IF;
  IF v_old->>'sender_address' IS DISTINCT FROM v_new->>'sender_address' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_address');
  END IF;
  IF v_old->>'sender_city' IS DISTINCT FROM v_new->>'sender_city' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_city');
  END IF;
  IF v_old->>'sender_province' IS DISTINCT FROM v_new->>'sender_province' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_province');
  END IF;
  IF v_old->>'sender_country' IS DISTINCT FROM v_new->>'sender_country' THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_country');
  END IF;
  IF v_old->>'mail_type' IS DISTINCT FROM v_new->>'mail_type' THEN
    v_changed_fields := array_append(v_changed_fields, 'mail_type');
  END IF;
  IF v_old->>'mail_type_other' IS DISTINCT FROM v_new->>'mail_type_other' THEN
    v_changed_fields := array_append(v_changed_fields, 'mail_type_other');
  END IF;
  IF v_old->>'registry_reference' IS DISTINCT FROM v_new->>'registry_reference' THEN
    v_changed_fields := array_append(v_changed_fields, 'registry_reference');
  END IF;
  IF v_old->>'description' IS DISTINCT FROM v_new->>'description' THEN
    v_changed_fields := array_append(v_changed_fields, 'description');
  END IF;
  IF v_old->>'comments' IS DISTINCT FROM v_new->>'comments' THEN
    v_changed_fields := array_append(v_changed_fields, 'comments');
  END IF;
  IF v_old->>'priority' IS DISTINCT FROM v_new->>'priority' THEN
    v_changed_fields := array_append(v_changed_fields, 'priority');
  END IF;
  IF v_old->>'reception_date' IS DISTINCT FROM v_new->>'reception_date' THEN
    v_changed_fields := array_append(v_changed_fields, 'reception_date');
  END IF;
  IF v_old->>'addressed_to' IS DISTINCT FROM v_new->>'addressed_to' THEN
    v_changed_fields := array_append(v_changed_fields, 'addressed_to');
  END IF;

  IF array_length(v_changed_fields, 1) > 0 THEN
    PERFORM public.log_audit_event(
      _actor_user_id := v_actor,
      _action := 'mail.update',
      _category := 'registry',
      _entity_type := 'mail',
      _entity_id := NEW.id,
      _summary := format('Courrier %s modifié', v_ref),
      _metadata := jsonb_build_object(
        'reference_number', NEW.reference_number,
        'registry_reference', NEW.registry_reference,
        'changed_fields', to_jsonb(v_changed_fields)
      ),
      _source := 'db_trigger'
    );
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
