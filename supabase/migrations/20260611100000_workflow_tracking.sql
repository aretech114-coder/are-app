-- Workflow tracking (pilotage global /suivi) — grants, access, list + summary RPCs

-- ---------------------------------------------------------------------------
-- 1. Table workflow_tracking_role_grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_tracking_role_grants (
  role public.app_role PRIMARY KEY,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_tracking_role_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_tracking_grants_select_authenticated"
  ON public.workflow_tracking_role_grants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "workflow_tracking_grants_superadmin_write"
  ON public.workflow_tracking_role_grants
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

GRANT SELECT ON public.workflow_tracking_role_grants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workflow_tracking_role_grants TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. can_access_workflow_tracking()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_workflow_tracking()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_user, 'superadmin')
     OR public.has_role(v_user, 'admin')
     OR public.has_role(v_user, 'secretariat')
     OR public.has_role(v_user, 'dg')
     OR public.has_role(v_user, 'directeur')
  THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.workflow_tracking_role_grants g ON g.role = ur.role
    WHERE ur.user_id = v_user
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_workflow_tracking() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. can_access_mail — read bypass for workflow tracking
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_mail(_mail_id uuid, _mode text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user uuid;
  v_step integer;
  v_registered_by uuid;
  v_ministre_absent boolean;
  v_assigned_agent uuid;
  v_is_read boolean;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL OR _mail_id IS NULL THEN
    RETURN false;
  END IF;

  v_is_read := (_mode = 'read');

  SELECT m.current_step, m.registered_by, m.ministre_absent, m.assigned_agent_id
  INTO v_step, v_registered_by, v_ministre_absent, v_assigned_agent
  FROM public.mails m
  WHERE m.id = _mail_id;

  IF v_step IS NULL THEN
    RETURN false;
  END IF;

  IF v_is_read AND public.can_access_workflow_tracking() THEN
    RETURN true;
  END IF;

  IF has_role(v_user, 'superadmin') OR has_role(v_user, 'admin') THEN
    RETURN true;
  END IF;

  IF has_role(v_user, 'reception') AND v_registered_by = v_user AND v_step = 1 THEN
    RETURN true;
  END IF;

  IF COALESCE(v_ministre_absent, false) AND v_step BETWEEN 2 AND 6 THEN
    IF v_assigned_agent = v_user THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number = 2
        AND ma.access_mode = 'custodian'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF has_role(v_user, 'dircab') OR has_role(v_user, 'dircaba')
     OR has_role(v_user, 'autorite_2') OR has_role(v_user, 'autorite_3')
     OR has_role(v_user, 'dga')
  THEN
    IF v_step IN (3, 5) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number IN (3, 5)
    ) THEN
      RETURN true;
    END IF;
    IF NOT v_is_read THEN
      RETURN false;
    END IF;
  END IF;

  IF has_role(v_user, 'directeur')
     OR has_role(v_user, 'ministre')
     OR has_role(v_user, 'dg')
     OR has_role(v_user, 'autorite_1')
  THEN
    IF v_step BETWEEN 2 AND 6 THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.access_mode = 'custodian'
    ) THEN
      RETURN true;
    END IF;
    IF v_is_read AND v_step >= 4 THEN
      RETURN true;
    END IF;
    IF NOT v_is_read AND v_step BETWEEN 2 AND 6 THEN
      RETURN true;
    END IF;
  END IF;

  IF has_role(v_user, 'secretariat') THEN
    IF v_step IN (8, 9) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.step_number IN (8, 9)
    ) THEN
      RETURN true;
    END IF;
    IF NOT v_is_read THEN
      RETURN false;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.assigned_to = v_user
      AND (
        (v_is_read AND ma.access_mode = 'viewer')
        OR
        (ma.access_mode = 'contributor' AND ma.step_number = v_step
         AND ma.status IN ('pending', 'proposed', 'completed', 'submitted', 'acknowledged'))
        OR
        (v_is_read AND ma.access_mode = 'contributor' AND ma.step_number = 4
         AND ma.status IN ('proposed', 'pending', 'completed', 'submitted')
         AND v_step >= 2)
        OR
        (v_is_read AND ma.access_mode = 'viewer' AND ma.step_number = 4
         AND ma.status IN ('proposed', 'pending')
         AND v_step >= 2)
      )
  ) THEN
    IF v_is_read THEN
      RETURN true;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.mail_assignments ma
      WHERE ma.mail_id = _mail_id
        AND ma.assigned_to = v_user
        AND ma.access_mode = 'contributor'
        AND ma.step_number = v_step
        AND ma.status IN ('pending', 'proposed')
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_step_responsibles wsr
    WHERE wsr.step_number = v_step
      AND wsr.is_active = true
      AND wsr.default_user_id = v_user
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mails m
    WHERE m.id = _mail_id AND m.assigned_agent_id = v_user
  ) THEN
    RETURN v_is_read OR (v_step BETWEEN 2 AND 6);
  END IF;

  IF v_is_read AND EXISTS (
    SELECT 1 FROM public.mail_assignments ma
    WHERE ma.mail_id = _mail_id
      AND ma.assigned_to = v_user
      AND ma.access_mode IN ('contributor', 'viewer', 'custodian')
  ) THEN
    RETURN true;
  END IF;

  IF v_is_read AND v_registered_by = v_user THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_mail(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Shared filter helper (internal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._workflow_tracking_matches_filters(
  m public.mails,
  _statuses text[],
  _step integer,
  _priority text,
  _overdue_only boolean,
  _search text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.current_step >= 2
    AND (_statuses IS NULL OR cardinality(_statuses) = 0 OR m.status::text = ANY(_statuses))
    AND (_step IS NULL OR m.current_step = _step)
    AND (_priority IS NULL OR _priority = '' OR m.priority::text = _priority)
    AND (
      NOT COALESCE(_overdue_only, false)
      OR (
        m.deadline_at IS NOT NULL
        AND m.deadline_at < now()
        AND m.status::text <> 'archived'
      )
    )
    AND (
      _search IS NULL
      OR btrim(_search) = ''
      OR m.subject ILIKE '%' || btrim(_search) || '%'
      OR m.sender_name ILIKE '%' || btrim(_search) || '%'
      OR m.reference_number ILIKE '%' || btrim(_search) || '%'
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. list_workflow_tracking_mails
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_workflow_tracking_mails(
  _statuses text[] DEFAULT ARRAY['pending', 'in_progress', 'processed']::text[],
  _step integer DEFAULT NULL,
  _priority text DEFAULT NULL,
  _overdue_only boolean DEFAULT false,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS SETOF public.mails
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.can_access_workflow_tracking() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.*
  FROM public.mails m
  WHERE public._workflow_tracking_matches_filters(
    m, _statuses, _step, _priority, _overdue_only, _search
  )
  ORDER BY
    CASE WHEN m.deadline_at IS NULL THEN 1 ELSE 0 END,
    m.deadline_at ASC NULLS LAST,
    m.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 25), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_workflow_tracking_mails(
  text[], integer, text, boolean, text, integer, integer
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. count_workflow_tracking_mails (pagination total)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_workflow_tracking_mails(
  _statuses text[] DEFAULT ARRAY['pending', 'in_progress', 'processed']::text[],
  _step integer DEFAULT NULL,
  _priority text DEFAULT NULL,
  _overdue_only boolean DEFAULT false,
  _search text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF NOT public.can_access_workflow_tracking() THEN
    RETURN 0;
  END IF;

  SELECT count(*)::bigint
  INTO v_count
  FROM public.mails m
  WHERE public._workflow_tracking_matches_filters(
    m, _statuses, _step, _priority, _overdue_only, _search
  );

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_workflow_tracking_mails(
  text[], integer, text, boolean, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_workflow_tracking_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_workflow_tracking_summary(
  _statuses text[] DEFAULT ARRAY['pending', 'in_progress', 'processed']::text[],
  _step integer DEFAULT NULL,
  _priority text DEFAULT NULL,
  _overdue_only boolean DEFAULT false,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.can_access_workflow_tracking() THEN
    RETURN jsonb_build_object(
      'total', 0,
      'overdue', 0,
      'urgent', 0,
      'by_step', '{}'::jsonb,
      'by_status', '{}'::jsonb,
      'by_priority', '{}'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'total', count(*)::int,
    'overdue', count(*) FILTER (
      WHERE m.deadline_at IS NOT NULL
        AND m.deadline_at < now()
        AND m.status::text <> 'archived'
    )::int,
    'urgent', count(*) FILTER (WHERE m.priority::text = 'urgent')::int,
    'by_step', COALESCE(
      (
        SELECT jsonb_object_agg(step_key, step_count)
        FROM (
          SELECT m2.current_step::text AS step_key, count(*)::int AS step_count
          FROM public.mails m2
          WHERE public._workflow_tracking_matches_filters(
            m2, _statuses, _step, _priority, _overdue_only, _search
          )
          GROUP BY m2.current_step
        ) s
      ),
      '{}'::jsonb
    ),
    'by_status', COALESCE(
      (
        SELECT jsonb_object_agg(status_key, status_count)
        FROM (
          SELECT m3.status::text AS status_key, count(*)::int AS status_count
          FROM public.mails m3
          WHERE public._workflow_tracking_matches_filters(
            m3, _statuses, _step, _priority, _overdue_only, _search
          )
          GROUP BY m3.status
        ) st
      ),
      '{}'::jsonb
    ),
    'by_priority', COALESCE(
      (
        SELECT jsonb_object_agg(priority_key, priority_count)
        FROM (
          SELECT m4.priority::text AS priority_key, count(*)::int AS priority_count
          FROM public.mails m4
          WHERE public._workflow_tracking_matches_filters(
            m4, _statuses, _step, _priority, _overdue_only, _search
          )
          GROUP BY m4.priority
        ) pr
      ),
      '{}'::jsonb
    )
  )
  INTO v_result
  FROM public.mails m
  WHERE public._workflow_tracking_matches_filters(
    m, _statuses, _step, _priority, _overdue_only, _search
  );

  RETURN COALESCE(v_result, jsonb_build_object(
    'total', 0,
    'overdue', 0,
    'urgent', 0,
    'by_step', '{}'::jsonb,
    'by_status', '{}'::jsonb,
    'by_priority', '{}'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workflow_tracking_summary(
  text[], integer, text, boolean, text
) TO authenticated;
