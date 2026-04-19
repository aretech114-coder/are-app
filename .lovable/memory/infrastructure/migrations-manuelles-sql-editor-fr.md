---
name: Migrations SQL manuelles via SQL Editor
description: Toutes les migrations SQL sont exécutées manuellement par le collaborateur via SQL Editor Supabase (Staging puis Production). Aucun automatisme GitHub Actions
type: feature
---
Le projet ARE Platform gère les migrations SQL **exclusivement** en mode manuel via le SQL Editor de Supabase.

**Règles strictes** :
- Le workflow GitHub Actions `deploy-migrations.yml` a été **supprimé**
- Aucune CLI Supabase, aucun `supabase db push`, aucun automatisme ne touche la base
- Le dossier `supabase/migrations/` reste comme référence historique uniquement
- Seul `deploy-functions.yml` reste actif pour les Edge Functions

**Procédure obligatoire à chaque migration** :
1. Lovable génère un fichier `.sql` dans `/mnt/documents/migrations/YYYY-MM-DD_description.sql`
2. Lovable **notifie explicitement** le collaborateur avec :
   - Nom du fichier généré
   - Résumé fonctionnel de l'impact
   - Ordre d'exécution : Staging d'abord, puis Production après validation
3. Le SQL doit être idempotent (`IF NOT EXISTS` / `IF EXISTS`), commenté, avec rollback documenté
4. Le collaborateur exécute manuellement le SQL via le SQL Editor sur les deux projets Supabase
5. Aucune migration n'est considérée appliquée tant que les deux environnements ne sont pas confirmés

**Mode de livraison** :
- Par défaut : génération + notification immédiate du fichier `.sql`
- À la demande : le collaborateur peut demander la regénération

**Raison historique** : la base de production a été initialisée par export/import SQL direct, donc le schéma `supabase_migrations.schema_migrations` n'existe pas. Toute tentative de `supabase db push` échoue ou risque de rejouer des migrations déjà appliquées.
