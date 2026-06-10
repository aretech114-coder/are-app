-- Journal d'audit centralisé (lecture superadmin uniquement)

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  category text NOT NULL,
  entity_type text,
  entity_id uuid,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  ip_address inet,
  user_agent text,
  CONSTRAINT audit_events_category_check CHECK (
    category IN ('workflow', 'registry', 'user', 'email', 'system')
  ),
  CONSTRAINT audit_events_source_check CHECK (
    source IN ('db_trigger', 'rpc', 'edge_function', 'backfill')
  )
);

CREATE UNIQUE INDEX audit_events_dedup_key_idx
  ON public.audit_events ((metadata->>'dedup_key'))
  WHERE (metadata->>'dedup_key') IS NOT NULL;

CREATE INDEX audit_events_created_at_idx ON public.audit_events (created_at DESC);
CREATE INDEX audit_events_actor_idx ON public.audit_events (actor_user_id, created_at DESC);
CREATE INDEX audit_events_category_action_idx ON public.audit_events (category, action);
CREATE INDEX audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin read audit_events"
  ON public.audit_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _actor_user_id uuid DEFAULT NULL,
  _actor_email text DEFAULT NULL,
  _actor_role text DEFAULT NULL,
  _action text DEFAULT NULL,
  _category text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _summary text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _source text DEFAULT 'rpc',
  _ip_address inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _created_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_email text;
  v_actor_role text;
  v_id uuid;
  v_dedup_key text;
BEGIN
  IF _action IS NULL OR _category IS NULL OR _summary IS NULL OR _source IS NULL THEN
    RETURN NULL;
  END IF;

  v_dedup_key := _metadata->>'dedup_key';
  IF v_dedup_key IS NOT NULL THEN
    SELECT ae.id INTO v_id
    FROM public.audit_events ae
    WHERE ae.metadata->>'dedup_key' = v_dedup_key
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  v_actor_email := _actor_email;
  v_actor_role := _actor_role;

  IF _actor_user_id IS NOT NULL THEN
    IF v_actor_email IS NULL THEN
      SELECT p.email INTO v_actor_email
      FROM public.profiles p
      WHERE p.id = _actor_user_id;
    END IF;
    IF v_actor_role IS NULL THEN
      SELECT ur.role::text INTO v_actor_role
      FROM public.user_roles ur
      WHERE ur.user_id = _actor_user_id;
    END IF;
  END IF;

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
    source,
    ip_address,
    user_agent
  ) VALUES (
    COALESCE(_created_at, now()),
    _actor_user_id,
    v_actor_email,
    v_actor_role,
    _action,
    _category,
    _entity_type,
    _entity_id,
    _summary,
    COALESCE(_metadata, '{}'::jsonb),
    _source,
    _ip_address,
    _user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    IF v_dedup_key IS NOT NULL THEN
      SELECT ae.id INTO v_id
      FROM public.audit_events ae
      WHERE ae.metadata->>'dedup_key' = v_dedup_key
      LIMIT 1;
    END IF;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(
  uuid, text, text, text, text, text, uuid, text, jsonb, text, inet, text, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_audit_event(
  uuid, text, text, text, text, text, uuid, text, jsonb, text, inet, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_audit_events_older_than(_months int DEFAULT 12)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM public.audit_events
  WHERE created_at < (now() - make_interval(months => GREATEST(_months, 1)));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_events_older_than(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_audit_events_older_than(int) TO service_role;

COMMENT ON TABLE public.audit_events IS
  'Journal d''audit applicatif. Écriture via log_audit_event uniquement. Purge manuelle : SELECT purge_audit_events_older_than(12);';
