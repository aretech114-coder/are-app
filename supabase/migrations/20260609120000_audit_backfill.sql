-- Backfill idempotent : workflow_transitions puis enregistrements registre

INSERT INTO public.audit_events (
  created_at,
  actor_user_id,
  actor_email,
  actor_role,
  action,
  category,
  entity_type,
  entity_id,
  summary,
  metadata,
  source
)
SELECT
  wt.created_at,
  wt.performed_by,
  p.email,
  ur.role::text,
  'workflow.transition',
  'workflow',
  'mail',
  wt.mail_id,
  format(
    'Transition étape %s → %s (%s)',
    COALESCE(wt.from_step::text, '?'),
    wt.to_step,
    wt.action
  ),
  jsonb_build_object(
    'dedup_key', 'workflow_transition:' || wt.id::text,
    'transition_id', wt.id,
    'from_step', wt.from_step,
    'to_step', wt.to_step,
    'action', wt.action,
    'notes', wt.notes
  ),
  'backfill'
FROM public.workflow_transitions wt
LEFT JOIN public.profiles p ON p.id = wt.performed_by
LEFT JOIN public.user_roles ur ON ur.user_id = wt.performed_by
WHERE NOT EXISTS (
  SELECT 1
  FROM public.audit_events ae
  WHERE ae.metadata->>'dedup_key' = 'workflow_transition:' || wt.id::text
);

INSERT INTO public.audit_events (
  created_at,
  actor_user_id,
  actor_email,
  actor_role,
  action,
  category,
  entity_type,
  entity_id,
  summary,
  metadata,
  source
)
SELECT
  m.created_at,
  m.registered_by,
  p.email,
  ur.role::text,
  'mail.register',
  'registry',
  'mail',
  m.id,
  format(
    'Courrier %s enregistré',
    COALESCE(m.registry_reference, m.reference_number, m.id::text)
  ),
  jsonb_build_object(
    'dedup_key', 'mail_register:' || m.id::text,
    'reference_number', m.reference_number,
    'registry_reference', m.registry_reference,
    'direction', m.direction,
    'mail_type', m.mail_type
  ),
  'backfill'
FROM public.mails m
LEFT JOIN public.profiles p ON p.id = m.registered_by
LEFT JOIN public.user_roles ur ON ur.user_id = m.registered_by
WHERE m.registered_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.audit_events ae
    WHERE ae.metadata->>'dedup_key' = 'mail_register:' || m.id::text
  );

INSERT INTO public.audit_events (
  created_at,
  actor_user_id,
  actor_email,
  actor_role,
  action,
  category,
  entity_type,
  entity_id,
  summary,
  metadata,
  source
)
SELECT
  ma.created_at,
  ma.assigned_by,
  p.email,
  ur.role::text,
  CASE
    WHEN ma.step_number = 2 AND EXISTS (
      SELECT 1
      FROM public.mail_assignments ma2
      WHERE ma2.mail_id = ma.mail_id
        AND ma2.step_number = 2
        AND ma2.created_at < ma.created_at
    ) THEN 'assignment.reassign'
    ELSE 'assignment.create'
  END,
  CASE
    WHEN ma.step_number = 2 AND EXISTS (
      SELECT 1
      FROM public.mail_assignments ma2
      WHERE ma2.mail_id = ma.mail_id
        AND ma2.step_number = 2
        AND ma2.created_at < ma.created_at
    ) THEN 'registry'
    ELSE 'workflow'
  END,
  'assignment',
  ma.id,
  CASE
    WHEN ma.step_number = 2 AND EXISTS (
      SELECT 1
      FROM public.mail_assignments ma2
      WHERE ma2.mail_id = ma.mail_id
        AND ma2.step_number = 2
        AND ma2.created_at < ma.created_at
    ) THEN format(
      'Réassignation registre — %s (étape %s)',
      COALESCE(m.registry_reference, m.reference_number, m.id::text),
      ma.step_number
    )
    ELSE format(
      'Assignation étape %s — %s',
      ma.step_number,
      COALESCE(m.registry_reference, m.reference_number, m.id::text)
    )
  END,
  jsonb_build_object(
    'dedup_key', 'assignment:' || ma.id::text,
    'mail_id', ma.mail_id,
    'assigned_to', ma.assigned_to,
    'assigned_by', ma.assigned_by,
    'step_number', ma.step_number,
    'status', ma.status
  ),
  'backfill'
FROM public.mail_assignments ma
JOIN public.mails m ON m.id = ma.mail_id
LEFT JOIN public.profiles p ON p.id = ma.assigned_by
LEFT JOIN public.user_roles ur ON ur.user_id = ma.assigned_by
WHERE NOT EXISTS (
  SELECT 1
  FROM public.audit_events ae
  WHERE ae.metadata->>'dedup_key' = 'assignment:' || ma.id::text
);
