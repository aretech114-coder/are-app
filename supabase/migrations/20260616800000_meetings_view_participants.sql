-- Migration AI — meetings.view pour tous les rôles internes (RLS filtre les événements visibles)
-- Les participants assignés (agent, conseiller, etc.) accèdent à /reunions ; create/edit reste direction/secrétariat.

CREATE OR REPLACE FUNCTION public.legacy_role_permission(
  _role public.app_role,
  _resource text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_role text := _role::text;
BEGIN
  IF v_role = 'superadmin' THEN
    RETURN true;
  END IF;

  CASE _resource
    WHEN 'registre' THEN
      CASE _action
        WHEN 'view', 'create', 'edit', 'export' THEN
          RETURN v_role IN ('reception', 'admin');
        WHEN 'delete' THEN
          RETURN v_role IN ('admin');
        ELSE RETURN false;
      END CASE;
    WHEN 'inbox' THEN
      CASE _action
        WHEN 'view' THEN
          RETURN v_role <> 'reception';
        WHEN 'treat' THEN
          RETURN v_role IN (
            'dg', 'directeur', 'ministre', 'autorite_1', 'dircab', 'dircaba',
            'autorite_2', 'autorite_3', 'dga', 'conseiller', 'conseiller_juridique',
            'autorite_4', 'secretariat', 'archiviste', 'agent', 'collaborateur',
            'chef_departement', 'secretaire_direction', 'admin', 'daf', 'dt'
          );
        ELSE RETURN false;
      END CASE;
    WHEN 'archives' THEN
      CASE _action
        WHEN 'view' THEN
          RETURN v_role <> 'reception';
        WHEN 'download' THEN
          RETURN v_role IN (
            'secretariat', 'archiviste', 'admin', 'dg', 'directeur', 'ministre', 'autorite_1',
            'dircab', 'dircaba', 'autorite_2', 'autorite_3', 'dga'
          );
        ELSE RETURN false;
      END CASE;
    WHEN 'suivi' THEN
      RETURN _action = 'view' AND v_role IN (
        'admin', 'secretariat', 'dg', 'directeur', 'ministre', 'dircab', 'dircaba',
        'autorite_1', 'autorite_2', 'autorite_3', 'autorite_4', 'dga'
      );
    WHEN 'history' THEN
      RETURN _action = 'view' AND v_role <> 'reception';
    WHEN 'analytics' THEN
      RETURN _action = 'view' AND v_role IN ('admin', 'dg', 'directeur', 'ministre', 'autorite_1');
    WHEN 'meetings' THEN
      CASE _action
        WHEN 'view' THEN
          RETURN v_role <> 'reception';
        WHEN 'create', 'edit', 'delete' THEN
          RETURN v_role IN (
            'secretariat', 'dg', 'directeur', 'ministre', 'autorite_1',
            'admin', 'dircab', 'dircaba'
          );
        ELSE RETURN false;
      END CASE;
    WHEN 'workflow_config' THEN
      RETURN _action IN ('view', 'manage') AND v_role IN ('admin');
    WHEN 'users' THEN
      RETURN _action IN ('view', 'create', 'edit', 'delete') AND v_role = 'admin';
    WHEN 'integrations' THEN
      RETURN false;
    ELSE
      RETURN true;
  END CASE;
END;
$$;

INSERT INTO public.role_permissions (role, resource_key, action, is_allowed)
SELECT r.role, r.resource_key, r.action, r.is_allowed
FROM (
  SELECT
    ur.role::public.app_role AS role,
    'meetings'::text AS resource_key,
    act.action,
    public.legacy_role_permission(ur.role::public.app_role, 'meetings', act.action) AS is_allowed
  FROM (
    SELECT unnest(enum_range(NULL::public.app_role)) AS role
  ) ur
  CROSS JOIN (
    VALUES ('view'), ('create'), ('edit'), ('delete')
  ) AS act(action)
  WHERE ur.role <> 'superadmin'::public.app_role
) r
ON CONFLICT (role, resource_key, action) DO UPDATE SET
  is_allowed = EXCLUDED.is_allowed;

NOTIFY pgrst, 'reload schema';
