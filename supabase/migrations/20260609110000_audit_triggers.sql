-- Triggers d'instrumentation audit (registre, workflow, assignations)

CREATE OR REPLACE FUNCTION public.audit_on_mail_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
BEGIN
  v_ref := COALESCE(NEW.registry_reference, NEW.reference_number, NEW.id::text);

  PERFORM public.log_audit_event(
    _actor_user_id := NEW.registered_by,
    _action := 'mail.register',
    _category := 'registry',
    _entity_type := 'mail',
    _entity_id := NEW.id,
    _summary := format('Courrier %s enregistré', v_ref),
    _metadata := jsonb_build_object(
      'dedup_key', 'mail_register:' || NEW.id::text,
      'reference_number', NEW.reference_number,
      'registry_reference', NEW.registry_reference,
      'direction', NEW.direction,
      'mail_type', NEW.mail_type
    ),
    _source := 'db_trigger',
    _created_at := COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

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
BEGIN
  v_ref := COALESCE(NEW.registry_reference, NEW.reference_number, NEW.id::text);
  v_actor := auth.uid();

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

  IF OLD.subject IS DISTINCT FROM NEW.subject THEN
    v_changed_fields := array_append(v_changed_fields, 'subject');
  END IF;
  IF OLD.sender_name IS DISTINCT FROM NEW.sender_name THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_name');
  END IF;
  IF OLD.sender_organization IS DISTINCT FROM NEW.sender_organization THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_organization');
  END IF;
  IF OLD.sender_phone IS DISTINCT FROM NEW.sender_phone THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_phone');
  END IF;
  IF OLD.sender_email IS DISTINCT FROM NEW.sender_email THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_email');
  END IF;
  IF OLD.sender_address IS DISTINCT FROM NEW.sender_address THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_address');
  END IF;
  IF OLD.sender_city IS DISTINCT FROM NEW.sender_city THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_city');
  END IF;
  IF OLD.sender_province IS DISTINCT FROM NEW.sender_province THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_province');
  END IF;
  IF OLD.sender_country IS DISTINCT FROM NEW.sender_country THEN
    v_changed_fields := array_append(v_changed_fields, 'sender_country');
  END IF;
  IF OLD.mail_type IS DISTINCT FROM NEW.mail_type THEN
    v_changed_fields := array_append(v_changed_fields, 'mail_type');
  END IF;
  IF OLD.mail_type_other IS DISTINCT FROM NEW.mail_type_other THEN
    v_changed_fields := array_append(v_changed_fields, 'mail_type_other');
  END IF;
  IF OLD.registry_reference IS DISTINCT FROM NEW.registry_reference THEN
    v_changed_fields := array_append(v_changed_fields, 'registry_reference');
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    v_changed_fields := array_append(v_changed_fields, 'description');
  END IF;
  IF OLD.comments IS DISTINCT FROM NEW.comments THEN
    v_changed_fields := array_append(v_changed_fields, 'comments');
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    v_changed_fields := array_append(v_changed_fields, 'priority');
  END IF;
  IF OLD.reception_date IS DISTINCT FROM NEW.reception_date THEN
    v_changed_fields := array_append(v_changed_fields, 'reception_date');
  END IF;
  IF OLD.addressed_to IS DISTINCT FROM NEW.addressed_to THEN
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

CREATE OR REPLACE FUNCTION public.audit_on_workflow_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
BEGIN
  IF NEW.action = 'register' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(m.registry_reference, m.reference_number, m.id::text)
  INTO v_ref
  FROM public.mails m
  WHERE m.id = NEW.mail_id;

  PERFORM public.log_audit_event(
    _actor_user_id := NEW.performed_by,
    _action := 'workflow.transition',
    _category := 'workflow',
    _entity_type := 'mail',
    _entity_id := NEW.mail_id,
    _summary := format(
      'Transition étape %s → %s (%s)',
      COALESCE(NEW.from_step::text, '?'),
      NEW.to_step,
      NEW.action
    ),
    _metadata := jsonb_build_object(
      'dedup_key', 'workflow_transition:' || NEW.id::text,
      'transition_id', NEW.id,
      'from_step', NEW.from_step,
      'to_step', NEW.to_step,
      'action', NEW.action,
      'notes', NEW.notes,
      'reference', v_ref
    ),
    _source := 'db_trigger',
    _created_at := COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_on_assignment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_is_reassign boolean;
  v_action text;
  v_category text;
BEGIN
  SELECT COALESCE(m.registry_reference, m.reference_number, m.id::text)
  INTO v_ref
  FROM public.mails m
  WHERE m.id = NEW.mail_id;

  v_is_reassign := (
    NEW.step_number = 2
    AND EXISTS (
      SELECT 1
      FROM public.mail_assignments ma
      WHERE ma.mail_id = NEW.mail_id
        AND ma.step_number = 2
        AND ma.id <> NEW.id
    )
  );

  IF v_is_reassign THEN
    v_action := 'assignment.reassign';
    v_category := 'registry';
  ELSE
    v_action := 'assignment.create';
    v_category := 'workflow';
  END IF;

  PERFORM public.log_audit_event(
    _actor_user_id := NEW.assigned_by,
    _action := v_action,
    _category := v_category,
    _entity_type := 'assignment',
    _entity_id := NEW.id,
    _summary := CASE
      WHEN v_is_reassign THEN format('Réassignation registre — %s (étape %s)', v_ref, NEW.step_number)
      ELSE format('Assignation étape %s — %s', NEW.step_number, v_ref)
    END,
    _metadata := jsonb_build_object(
      'dedup_key', 'assignment:' || NEW.id::text,
      'mail_id', NEW.mail_id,
      'assigned_to', NEW.assigned_to,
      'assigned_by', NEW.assigned_by,
      'step_number', NEW.step_number,
      'status', NEW.status,
      'reference', v_ref
    ),
    _source := 'db_trigger',
    _created_at := COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_mail_insert ON public.mails;
CREATE TRIGGER trg_audit_mail_insert
  AFTER INSERT ON public.mails
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_on_mail_insert();

DROP TRIGGER IF EXISTS trg_audit_mail_update ON public.mails;
CREATE TRIGGER trg_audit_mail_update
  AFTER UPDATE ON public.mails
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_on_mail_update();

DROP TRIGGER IF EXISTS trg_audit_workflow_transition ON public.workflow_transitions;
CREATE TRIGGER trg_audit_workflow_transition
  AFTER INSERT ON public.workflow_transitions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_on_workflow_transition();

DROP TRIGGER IF EXISTS trg_audit_assignment_insert ON public.mail_assignments;
CREATE TRIGGER trg_audit_assignment_insert
  AFTER INSERT ON public.mail_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_on_assignment_insert();
