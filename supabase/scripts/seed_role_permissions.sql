-- Seed idempotent role_permissions = comportement legacy actuel
-- Exécuter après migration 20260615100000_role_permissions.sql

INSERT INTO public.role_permissions (role, resource_key, action, is_allowed)
SELECT r.role, r.resource_key, r.action, r.is_allowed
FROM (
  SELECT
    ur.role::public.app_role AS role,
    pr.resource_key,
    act.action,
    public.legacy_role_permission(ur.role::public.app_role, pr.resource_key, act.action) AS is_allowed
  FROM (
    SELECT unnest(enum_range(NULL::public.app_role)) AS role
  ) ur
  CROSS JOIN public.permission_resources pr
  CROSS JOIN (
    VALUES
      ('view'), ('create'), ('edit'), ('delete'),
      ('download'), ('export'), ('treat'), ('manage')
  ) AS act(action)
  WHERE ur.role <> 'superadmin'::public.app_role
    AND (
      (pr.resource_key = 'registre' AND act.action IN ('view', 'create', 'edit', 'delete', 'export'))
      OR (pr.resource_key = 'inbox' AND act.action IN ('view', 'treat'))
      OR (pr.resource_key = 'archives' AND act.action IN ('view', 'download'))
      OR (pr.resource_key = 'suivi' AND act.action = 'view')
      OR (pr.resource_key = 'history' AND act.action = 'view')
      OR (pr.resource_key = 'meetings' AND act.action IN ('view', 'create', 'edit', 'delete'))
      OR (pr.resource_key = 'workflow_config' AND act.action IN ('view', 'manage'))
      OR (pr.resource_key = 'users' AND act.action IN ('view', 'create', 'edit', 'delete'))
      OR (pr.resource_key = 'integrations' AND act.action IN ('view', 'manage'))
    )
) r
ON CONFLICT (role, resource_key, action) DO UPDATE SET
  is_allowed = EXCLUDED.is_allowed;

-- registre.delete réservé à l'administrateur (pas secrétariat)
UPDATE public.role_permissions
SET is_allowed = (role = 'admin'::public.app_role)
WHERE resource_key = 'registre' AND action = 'delete';

-- secrétariat : retirer accès registre (cohérent menu + migration AC)
UPDATE public.role_permissions
SET is_allowed = false
WHERE role = 'secretariat'::public.app_role
  AND resource_key = 'registre'
  AND action IN ('view', 'create', 'edit', 'export', 'delete');
