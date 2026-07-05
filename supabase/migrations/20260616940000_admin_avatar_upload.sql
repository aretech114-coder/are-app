-- Migration AN — Upload avatar par admin / super admin pour un utilisateur cible

CREATE OR REPLACE FUNCTION public.update_profile_avatar_for_user(
  _target_user_id uuid,
  _storage_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_expected text;
  v_updated_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  IF _target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur cible requis');
  END IF;

  IF _storage_path IS NULL OR trim(_storage_path) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chemin avatar requis');
  END IF;

  IF NOT (
    public.has_role(v_caller, 'superadmin')
    OR (
      public.has_role(v_caller, 'admin')
      AND public.has_role_permission(v_caller, 'users', 'edit')
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission insuffisante pour modifier la photo');
  END IF;

  v_expected := _target_user_id::text || '/avatar.jpg';
  IF _storage_path <> v_expected THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chemin avatar invalide');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable');
  END IF;

  UPDATE public.profiles
  SET avatar_url = _storage_path,
      updated_at = now()
  WHERE id = _target_user_id
  RETURNING updated_at INTO v_updated_at;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, updated_at)
    SELECT
      u.id,
      COALESCE(u.email, ''),
      COALESCE(u.raw_user_meta_data->>'full_name', ''),
      _storage_path,
      now()
    FROM auth.users u
    WHERE u.id = _target_user_id
    ON CONFLICT (id) DO UPDATE
      SET avatar_url = EXCLUDED.avatar_url,
          updated_at = now()
    RETURNING updated_at INTO v_updated_at;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'avatar_url', _storage_path,
    'updated_at', v_updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_avatar_for_user(uuid, text) TO authenticated;

-- Storage : admin / superadmin peuvent écrire dans le dossier avatar de n'importe quel utilisateur
DROP POLICY IF EXISTS "Admins can upload avatars for users" ON storage.objects;
CREATE POLICY "Admins can upload avatars for users"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      public.has_role(auth.uid(), 'admin')
      AND public.has_role_permission(auth.uid(), 'users', 'edit')
    )
  )
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
);

DROP POLICY IF EXISTS "Admins can update avatars for users" ON storage.objects;
CREATE POLICY "Admins can update avatars for users"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      public.has_role(auth.uid(), 'admin')
      AND public.has_role_permission(auth.uid(), 'users', 'edit')
    )
  )
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      public.has_role(auth.uid(), 'admin')
      AND public.has_role_permission(auth.uid(), 'users', 'edit')
    )
  )
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
);

NOTIFY pgrst, 'reload schema';
