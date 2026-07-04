-- Audit photos de profil (bucket avatars + profiles.avatar_url)
-- Exécuter en prod après migrations AD + AE (+ AH limites bucket si applicable)

-- 1. Bucket public et limite
SELECT id, public, file_size_limit
FROM storage.buckets
WHERE id = 'avatars';

-- 2. Policies Storage avatars
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%avatar%'
ORDER BY policyname;

-- 3. Profils avec avatar_url (path ou URL legacy)
SELECT id, full_name, email, avatar_url, updated_at
FROM public.profiles
WHERE avatar_url IS NOT NULL AND trim(avatar_url) <> ''
ORDER BY updated_at DESC NULLS LAST
LIMIT 50;

-- 4. Croisement profil ↔ objet Storage (objet manquant = photo invisible)
SELECT
  p.id AS user_id,
  p.full_name,
  p.avatar_url,
  o.name AS storage_object_name,
  o.created_at AS object_created_at
FROM public.profiles p
LEFT JOIN storage.objects o
  ON o.bucket_id = 'avatars'
  AND (
    o.name = p.avatar_url
    OR o.name = (regexp_match(p.avatar_url, '/avatars/([^?]+)'))[1]
  )
WHERE p.avatar_url IS NOT NULL AND trim(p.avatar_url) <> ''
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 50;

-- 5. Normaliser URLs legacy → path Storage (dry-run)
SELECT
  id,
  avatar_url AS before,
  (regexp_match(avatar_url, '/avatars/([^?]+)'))[1] AS after_path
FROM public.profiles
WHERE avatar_url LIKE '%/avatars/%';

-- 6. Appliquer normalisation (décommenter après revue dry-run)
-- UPDATE public.profiles
-- SET avatar_url = (regexp_match(avatar_url, '/avatars/([^?]+)'))[1]
-- WHERE avatar_url LIKE '%/avatars/%';

-- 7. URL publique attendue (remplacer PROJECT_REF et USER_ID)
-- https://<PROJECT_REF>.supabase.co/storage/v1/object/public/avatars/<USER_ID>/avatar.jpg
