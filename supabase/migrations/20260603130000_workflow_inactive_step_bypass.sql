-- Bypass étape 1 inactive : libellés ARE + réparation courriers bloqués à l'étape 1

-- Libellés services concernés (données seed ministère)
UPDATE public.services_concernes SET label = 'Cabinet DG' WHERE code = 'cabinet' AND label ILIKE '%ministre%';
UPDATE public.services_concernes SET label = 'Direction générale adjointe' WHERE code = 'dircab' AND label ILIKE '%cabinet%';
UPDATE public.services_concernes SET label = 'Direction générale' WHERE code = 'finances' AND label = 'Direction des finances';

-- Nom étape 6 (affichage)
UPDATE public.workflow_steps
SET name = 'Validation DG'
WHERE step_order = 6 AND (name ILIKE '%ministre%' OR name = 'Validation Ministre');

-- Courriers restés à l'étape 1 alors que l'étape 1 est désactivée → première étape active suivante
DO $$
DECLARE
  v_routing_step integer;
  v_step1_active boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.workflow_steps WHERE step_order = 1 AND is_active = true
  ) INTO v_step1_active;

  IF v_step1_active THEN
    RETURN;
  END IF;

  SELECT MIN(ws.step_order) INTO v_routing_step
  FROM public.workflow_steps ws
  WHERE ws.is_active = true AND ws.step_order >= 2;

  v_routing_step := COALESCE(v_routing_step, (
    SELECT MIN(ws.step_order) FROM public.workflow_steps ws WHERE ws.is_active = true
  ));

  IF v_routing_step IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.mails
  SET
    current_step = v_routing_step,
    status = CASE WHEN status = 'pending' THEN 'in_progress'::public.mail_status ELSE status END,
    workflow_started_at = COALESCE(workflow_started_at, now())
  WHERE current_step = 1
    AND status IN ('pending', 'in_progress');

  INSERT INTO public.workflow_transitions (mail_id, from_step, to_step, action, performed_by, notes)
  SELECT
    m.id,
    1,
    v_routing_step,
    'skip',
    m.registered_by,
    'Reprise automatique — étape Réception désactivée (bypass).'
  FROM public.mails m
  WHERE m.current_step = v_routing_step
    AND m.status IN ('pending', 'in_progress')
    AND NOT EXISTS (
      SELECT 1 FROM public.workflow_transitions wt
      WHERE wt.mail_id = m.id AND wt.action = 'skip' AND wt.notes LIKE '%étape Réception désactivée%'
    );
END $$;

NOTIFY pgrst, 'reload schema';
