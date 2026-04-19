

## Compréhension

1. **Supprimer** `.github/workflows/deploy-migrations.yml` — les migrations SQL passent **toujours** manuellement via SQL Editor sur Staging puis Production
2. **Conserver** `.github/workflows/deploy-functions.yml` — Edge Functions restent en CI/CD automatique
3. **Vérifier** qu'aucun autre fichier du repo ne référence `deploy-migrations.yml`
4. **Mettre à jour SAFETY_POLICY.md** : règle explicite que toute migration SQL doit être notifiée et fournie en fichier `.sql` téléchargeable dans `/mnt/documents/migrations/`
5. **Mettre à jour la mémoire** correspondante pour refléter la nouvelle règle

## Plan d'implémentation

### 1. Suppression du workflow
- Supprimer `.github/workflows/deploy-migrations.yml`

### 2. Vérification des références
- Rechercher dans tout le repo (`README.md`, `GUIDE_MIGRATION.md`, `.lovable/`, `SAFETY_POLICY.md`, autres `.yml`) toute mention de `deploy-migrations` et nettoyer/ajuster si trouvé

### 3. Mise à jour SAFETY_POLICY.md
Ajouter/renforcer la section **D6 — Migrations SQL contrôlées** avec :
- Règle absolue : **aucune** migration SQL n'est jouée par GitHub Actions
- Procédure obligatoire à chaque migration :
  1. Lovable génère un fichier `.sql` dans `/mnt/documents/migrations/YYYY-MM-DD_description.sql`
  2. Lovable **notifie explicitement** l'utilisateur avec : nom du fichier, résumé de l'impact, ordre d'exécution Staging → Production
  3. L'utilisateur exécute manuellement via SQL Editor sur les deux bases
- Aucune migration ne doit être considérée comme appliquée tant que l'utilisateur n'a pas confirmé l'exécution sur les deux environnements

### 4. Mise à jour mémoire
- Mettre à jour `mem://governance/safety-policy-ref` pour refléter D6 renforcé
- Créer/mettre à jour `mem://infrastructure/migrations-manuelles-sql-editor-fr` documentant la procédure

## Ce qui n'est PAS touché

- `.github/workflows/deploy-functions.yml` — intact
- Dossier `supabase/migrations/` — intact (référence historique)
- Aucun code applicatif, aucune table, aucune RLS, aucune donnée
- Vercel continue de déployer le frontend automatiquement sur push `main`

## Effets attendus

- Plus aucun blocage GitHub Actions sur les déploiements
- Ruleset `main` ne checke plus de workflow de migration
- Lovable push librement sur `develop` → PR → merge → Vercel déploie
- Les migrations SQL restent sous votre contrôle total via SQL Editor
- Règle gravée dans SAFETY_POLICY pour toutes les sessions futures

## Risques

Aucun. Suppression réversible (historique Git), aucune action sur la base.

