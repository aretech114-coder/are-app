-- Réactive tous les comptes métier (hors superadmin/admin si vous les gérez à part)
-- + lève le ban Supabase Auth. À exécuter en super admin après go-live.

UPDATE public.profiles p
SET is_disabled = false
WHERE p.is_disabled = true
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role IN ('superadmin', 'admin')
  );

-- Déban Auth (tous les utilisateurs dont le profil n'est plus disabled)
UPDATE auth.users au
SET banned_until = NULL
FROM public.profiles p
WHERE p.id = au.id
  AND p.is_disabled = false;

-- Vérification
SELECT COUNT(*) FILTER (WHERE is_disabled) AS still_disabled,
       COUNT(*) AS total_profiles
FROM public.profiles;
