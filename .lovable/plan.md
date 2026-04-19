

## Diagnostic

L'erreur survient dans le workflow GitHub Actions `deploy-migrations.yml` qui tente de rejouer **toutes** les migrations sur la base Supabase. L'une des anciennes migrations contient :

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
```

Or ce type existe déjà en production (SQLSTATE 42710). Le déploiement échoue donc à cette étape et **aucune migration suivante n'est appliquée** — y compris celle de la policy `Public can read login appearance settings` (qui de toute façon est déjà appliquée puisque visible dans le schéma actuel).

## Cause racine

Les migrations historiques utilisent des `CREATE TYPE` / `CREATE TABLE` sans `IF NOT EXISTS`. Quand `supabase db push` (ou équivalent CLI) rejoue le dossier complet sur une base où ces objets existent déjà, ça casse.

Deux scénarios possibles :
1. **La table `supabase_migrations.schema_migrations` n'est pas synchronisée** avec ce qui est réellement déployé → la CLI croit devoir rejouer une migration ancienne.
2. **Le workflow force un replay complet** (ex: `supabase db reset` ou push sans tracking).

## Solution recommandée

### Option A — Rendre la migration fautive idempotente (simple, sûr)

Modifier le fichier de migration historique qui crée `app_role` pour utiliser un bloc `DO` conditionnel :

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
  END IF;
END $$;
```

Puis identifier et patcher de la même façon les autres `CREATE TYPE` / `CREATE TABLE` / `CREATE POLICY` qui ne sont pas idempotents dans les anciennes migrations.

### Option B — Marquer les migrations comme déjà appliquées (recommandée pour la prod)

Plutôt que modifier l'historique, indiquer à Supabase CLI que ces migrations sont déjà jouées :

```bash
supabase migration repair --status applied <timestamp>
```

Cela nécessite un accès au workflow GitHub Actions et au CLI — **action manuelle de votre part**, pas de code à changer.

## Étapes du plan

1. **Lister les migrations dans `supabase/migrations/`** pour identifier le fichier qui crée `app_role` (et tout autre `CREATE TYPE`/`CREATE TABLE` non idempotent).
2. **Patcher chaque migration historique** avec des gardes `IF NOT EXISTS` ou blocs `DO $$ ... $$` conditionnels — sans changer la logique métier.
3. **Vérifier que `deploy-migrations.yml`** n'utilise pas `db reset` (sinon le corriger pour faire un push incrémental uniquement).
4. **Re-déclencher le workflow** sur `develop` puis merger vers `main`.

## Ce qui ne sera PAS touché

- Aucune logique applicative
- Aucune RLS active modifiée (la policy login est déjà en place)
- Aucune donnée

## Résultat attendu

Le workflow GitHub Actions s'exécute jusqu'au bout sans erreur, Vercel redéploie, et la prod `are-app.cloud` reflète tous les changements (image de fond, glassmorphism, œil mot de passe, branding intégré dans la carte).

