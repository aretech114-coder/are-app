-- Migration AF — RBAC Statistiques (analytics.view)
-- Par défaut : admin + DG (dg, directeur, ministre, autorite_1) ; autres rôles = non (activable via matrice)

INSERT INTO public.permission_resources (resource_key, label, sort_order) VALUES
  ('analytics', 'Statistiques', 55)
ON CONFLICT (resource_key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order;

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
            'chef_departement', 'secretaire_direction', 'admin'
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
      RETURN _action IN ('view', 'create', 'edit', 'delete') AND v_role IN (
        'secretariat', 'dg', 'directeur', 'ministre', 'autorite_1',
        'admin', 'dircab', 'dircaba'
      );
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
    'analytics'::text AS resource_key,
    'view'::text AS action,
    public.legacy_role_permission(ur.role::public.app_role, 'analytics', 'view') AS is_allowed
  FROM (
    SELECT unnest(enum_range(NULL::public.app_role)) AS role
  ) ur
  WHERE ur.role <> 'superadmin'::public.app_role
) r
ON CONFLICT (role, resource_key, action) DO UPDATE SET
  is_allowed = EXCLUDED.is_allowed;
