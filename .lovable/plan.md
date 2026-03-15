

## Diagnostic

Le bucket `mail-documents` existe dans Lovable Cloud mais **pas dans votre Supabase de production**. C'est pour cela que vous obtenez "Bucket Not Found".

## SQL à exécuter dans le SQL Editor de Supabase Production

Exécutez ce SQL **en une seule fois** :

```sql
-- 1. Créer le bucket (PRIVÉ - les documents officiels ne doivent pas être publics)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mail-documents', 'mail-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Vérifier que les buckets avatars et branding existent aussi
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Politiques RLS pour mail-documents (upload, lecture, suppression par utilisateurs authentifiés)
CREATE POLICY "Authenticated users can upload mail documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mail-documents');

CREATE POLICY "Authenticated users can read mail documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'mail-documents');

CREATE POLICY "Authenticated users can delete mail documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mail-documents');

-- 4. Politiques RLS pour avatars
CREATE POLICY "Anyone can read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

-- 5. Politiques RLS pour branding
CREATE POLICY "Anyone can read branding"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'branding');

CREATE POLICY "Authenticated users can upload branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branding');

CREATE POLICY "Authenticated users can update branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'branding');
```

## Pourquoi privé pour mail-documents ?

- Le bucket `mail-documents` est **privé** car il contient des courriers officiels sensibles
- L'accès se fait via des **URLs signées** (valides 1 an), déjà implémentées dans le code
- Les buckets `avatars` et `branding` sont **publics** car ce sont des éléments visuels affichés à tous

## Résumé

| Bucket | Public ? | Usage |
|--------|----------|-------|
| `mail-documents` | Non (privé) | Pièces jointes des courriers |
| `avatars` | Oui | Photos de profil |
| `branding` | Oui | Logo, favicon |

Aucune modification de code n'est nécessaire. Après l'exécution du SQL, l'enregistrement de courrier avec pièces jointes fonctionnera immédiatement.

