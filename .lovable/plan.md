

## Diagnostic

Le workflow GitHub Actions échoue car la table `supabase_migrations.schema_migrations` (qui tracke les migrations déjà appliquées) est désynchronisée avec l'état réel de la base. Résultat : la CLI tente de rejouer une migration ancienne qui crée `app_role`, alors que ce type existe déjà → erreur `42710`.

**Il ne s'agit PAS d'une nouvelle migration métier à exécuter.** Il s'agit de **réparer la table de tracking** sur Staging ET Production pour dire à Supabase "ces migrations sont déjà appliquées, ne les rejoue pas".

## Que faire avec ce fichier ?

Le fichier `.sql` que je vais générer doit être exécuté **manuellement dans le SQL Editor du dashboard Supabase**, sur les deux projets :

1. **Staging** (projet `kqdcsbrsrlufnpvithcg`) → SQL Editor → coller → Run
2. **Production** (votre projet prod, ref différente) → SQL Editor → coller → Run

Ce script :
- Lit la liste de **tous les fichiers** présents dans `supabase/migrations/`
- Insère leurs timestamps dans `supabase_migrations.schema_migrations` avec `ON CONFLICT DO NOTHING`
- Effet : le prochain `supabase db push` ne rejouera **aucune** migration historique, et n'appliquera que les **nouvelles** à venir

**Aucun objet métier n'est créé/modifié/supprimé.** Seule la table de tracking est mise à jour. Opération non-destructive, conforme à SAFETY_POLICY D7.

## Étapes de mon implémentation

1. **Lister** tous les fichiers `supabase/migrations/*.sql` pour extraire leurs timestamps (format `YYYYMMDDHHMMSS`)
2. **Générer** un fichier SQL `/mnt/documents/migrations/2026-04-19_repair-schema-migrations.sql` avec :
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES
     ('20260101120000', 'init', ARRAY[]::text[]),
     ('20260212125037', '414826fb-...', ARRAY[]::text[]),
     -- ... toutes les autres
   ON CONFLICT (version) DO NOTHING;
   ```
3. **Fournir** un tag `<lov-artifact>` pour téléchargement direct
4. **Documenter** la procédure d'exécution (Staging d'abord, vérifier, puis Production)

## Ce qui n'est PAS touché

- Aucune table métier
- Aucune RLS, aucune fonction, aucun type
- Aucune donnée applicative
- Aucun fichier de migration historique (intacts)

## Procédure post-exécution

1. Exécuter le SQL sur **Staging** via dashboard → vérifier 0 erreur
2. Re-déclencher le workflow GitHub Actions sur `develop` → doit passer ✅
3. Exécuter le **même** SQL sur **Production** via dashboard
4. Merger PR `develop → main` → workflow Production passe ✅
5. Vercel redéploie automatiquement → `are-app.cloud` à jour

## Risques et mitigation

- **Risque** : insérer un timestamp pour une migration qui n'a vraiment pas été appliquée → Postgres ignorerait silencieusement la création réelle plus tard. **Mitigation** : votre base contient déjà tous les objets (preuve : `app_role` existe, `site_settings` existe avec la policy login). Donc marquer tout comme "appliqué" reflète la réalité.
- **Rollback** : si besoin, `DELETE FROM supabase_migrations.schema_migrations WHERE version IN (...)` pour rétablir l'état antérieur. Sera documenté en commentaire dans le fichier SQL.

