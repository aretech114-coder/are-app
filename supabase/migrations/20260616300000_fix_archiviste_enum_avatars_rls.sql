-- Hotfix AD — enum archiviste + legacy_role_permission safe + avatars Storage RLS
-- Cause : legacy_role_permission référençait 'archiviste' avant ADD VALUE → 22P02 à l'exécution
--         (has_role_permission cassé → effets de bord possibles ; avatars sans INSERT/UPDATE en prod)

-- 1. Enum (obligatoire avant tout compte archiviste)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'archiviste';

-- 2. legacy_role_permission : comparaisons en text (pas de cast enum sur 'archiviste' avant ADD VALUE)
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

-- 3. Avatars Storage — INSERT + UPDATE (upsert) + DELETE scoping par dossier user id
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Anyone can view avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

NOTIFY pgrst, 'reload schema';
