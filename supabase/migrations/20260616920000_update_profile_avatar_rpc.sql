-- Migration AL — Persistance fiable avatar_url (contourne échecs RLS silencieux PostgREST)

CREATE OR REPLACE FUNCTION public.update_profile_avatar(_storage_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expected text;
  v_updated_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non authentifié');
  END IF;

  IF _storage_path IS NULL OR trim(_storage_path) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chemin avatar requis');
  END IF;

  v_expected := v_uid::text || '/avatar.jpg';
  IF _storage_path <> v_expected THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chemin avatar invalide');
  END IF;

  UPDATE public.profiles
  SET avatar_url = _storage_path,
      updated_at = now()
  WHERE id = v_uid
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
    WHERE u.id = v_uid
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

GRANT EXECUTE ON FUNCTION public.update_profile_avatar(text) TO authenticated;

-- Renforcer les policies UPDATE (WITH CHECK explicite)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "SuperAdmin can update any profile" ON public.profiles;
CREATE POLICY "SuperAdmin can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::public.app_role));

NOTIFY pgrst, 'reload schema';
