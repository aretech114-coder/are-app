-- Migration AA — Matrice RBAC par rôle (permission_resources + role_permissions + has_role_permission)

-- 1. Catalogue ressources
CREATE TABLE IF NOT EXISTS public.permission_resources (
  resource_key text PRIMARY KEY,
  label text NOT NULL,
  parent_key text NULL REFERENCES public.permission_resources (resource_key) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.permission_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permission_resources_select_authenticated" ON public.permission_resources;
CREATE POLICY "permission_resources_select_authenticated"
  ON public.permission_resources FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "permission_resources_manage_superadmin" ON public.permission_resources;
CREATE POLICY "permission_resources_manage_superadmin"
  ON public.permission_resources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

GRANT SELECT ON public.permission_resources TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.permission_resources TO authenticated;

-- 2. Matrice role × resource × action
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  resource_key text NOT NULL REFERENCES public.permission_resources (resource_key) ON DELETE CASCADE,
  action text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role, resource_key, action)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_select_authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions_select_authenticated"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "role_permissions_manage_superadmin" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_superadmin"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;

-- 3. Seed catalogue v1
INSERT INTO public.permission_resources (resource_key, label, sort_order) VALUES
  ('registre', 'Registre', 10),
  ('inbox', 'Boîte de réception', 20),
  ('archives', 'Archives centrales', 30),
  ('suivi', 'Tableau de suivi', 40),
  ('history', 'Historique', 50),
  ('meetings', 'Réunions / calendrier', 60),
  ('workflow_config', 'Configuration workflow', 70),
  ('users', 'Gestion utilisateurs', 80),
  ('integrations', 'Intégrations', 90)
ON CONFLICT (resource_key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order;

-- 4. Legacy fallback (reproduit comportement actuel si pas de ligne explicite)
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
BEGIN
  IF _role = 'superadmin'::public.app_role THEN
    RETURN true;
  END IF;

  CASE _resource
    WHEN 'registre' THEN
      CASE _action
        WHEN 'view', 'create', 'edit', 'export' THEN
          RETURN _role IN ('reception', 'admin', 'secretariat');
        WHEN 'delete' THEN
          RETURN _role IN ('admin');
        ELSE RETURN false;
      END CASE;
    WHEN 'inbox' THEN
      CASE _action
        WHEN 'view' THEN
          RETURN _role <> 'reception'::public.app_role;
        WHEN 'treat' THEN
          RETURN _role IN (
            'dg', 'directeur', 'ministre', 'autorite_1', 'dircab', 'dircaba',
            'autorite_2', 'autorite_3', 'dga', 'conseiller', 'conseiller_juridique',
            'autorite_4', 'secretariat', 'agent', 'collaborateur',
            'chef_departement', 'secretaire_direction', 'admin'
          );
        ELSE RETURN false;
      END CASE;
    WHEN 'archives' THEN
      CASE _action
        WHEN 'view' THEN
          RETURN _role <> 'reception'::public.app_role;
        WHEN 'download' THEN
          RETURN _role IN (
            'secretariat', 'admin', 'dg', 'directeur', 'ministre', 'autorite_1',
            'dircab', 'dircaba', 'autorite_2', 'autorite_3', 'dga'
          );
        ELSE RETURN false;
      END CASE;
    WHEN 'suivi' THEN
      RETURN _action = 'view' AND _role IN (
        'admin', 'secretariat', 'dg', 'directeur', 'ministre', 'dircab', 'dircaba',
        'autorite_1', 'autorite_2', 'autorite_3', 'autorite_4', 'dga'
      );
    WHEN 'history' THEN
      RETURN _action = 'view' AND _role <> 'reception'::public.app_role;
    WHEN 'meetings' THEN
      RETURN _action IN ('view', 'create', 'edit', 'delete') AND _role IN (
        'secretariat', 'dg', 'directeur', 'ministre', 'autorite_1',
        'admin', 'dircab', 'dircaba'
      );
    WHEN 'workflow_config' THEN
      RETURN _action IN ('view', 'manage') AND _role IN ('admin');
    WHEN 'users' THEN
      RETURN _action IN ('view', 'create', 'edit', 'delete') AND _role = 'admin'::public.app_role;
    WHEN 'integrations' THEN
      RETURN false;
    ELSE
      RETURN true;
  END CASE;
END;
$$;

-- 5. Fonction publique has_role_permission
CREATE OR REPLACE FUNCTION public.has_role_permission(
  _user_id uuid,
  _resource text,
  _action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_allowed boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'superadmin'::public.app_role THEN
    RETURN true;
  END IF;

  SELECT rp.is_allowed INTO v_allowed
  FROM public.role_permissions rp
  WHERE rp.role = v_role
    AND rp.resource_key = _resource
    AND rp.action = _action;

  IF FOUND THEN
    RETURN v_allowed;
  END IF;

  RETURN public.legacy_role_permission(v_role, _resource, _action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.legacy_role_permission(public.app_role, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_permission(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
