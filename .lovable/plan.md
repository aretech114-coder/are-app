

# Plan : CI/CD dual-environment (Staging → Production)

## Architecture cible

```text
Lovable push
     │
     ▼
  develop ──► GitHub Actions ──► Supabase STAGING (SUPABASE_PROJECT_ID)
     │                            + Vercel Preview
     │
  PR merge
     │
     ▼
   main ────► GitHub Actions ──► Supabase PRODUCTION (PRODUCTION_PROJECT_ID)
                                  + Vercel Production
```

## Secrets GitHub — État actuel ✅

Vos secrets sont bien configurés :
| Secret | Usage |
|--------|-------|
| `SUPABASE_PROJECT_ID` | Projet staging (develop) |
| `SUPABASE_DB_PASSWORD` | DB staging |
| `SUPABASE_ACCESS_TOKEN` | Auth CLI (partagé) |
| `PRODUCTION_PROJECT_ID` | Projet production (main) |
| `PRODUCTION_DB_PASSWORD` | DB production |

**Note** : Le même `SUPABASE_ACCESS_TOKEN` fonctionne pour les deux projets si les deux sont sous le même compte Supabase.

## Modifications à effectuer

### 1. Refonte du workflow GitHub Actions

Remplacer le fichier unique `.github/workflows/deploy-functions.yml` par **deux jobs** :

- **Job "deploy-staging"** : déclenché sur `push` vers `develop`, déploie les 10 Edge Functions (incluant `api-public` manquante) vers `SUPABASE_PROJECT_ID`
- **Job "deploy-production"** : déclenché sur `push` vers `main` (via PR merge), déploie vers `PRODUCTION_PROJECT_ID`

Les 10 fonctions à déployer :
`create-user`, `update-user`, `delete-user`, `manage-roles`, `sla-checker`, `ai-assistant`, `sync-users`, `impersonate-user`, `send-notification-email`, `api-public`

### 2. Ajout workflow migrations DB (optionnel mais recommandé)

Un second workflow `.github/workflows/deploy-migrations.yml` pour appliquer les migrations SQL :
- `develop` → staging DB via `SUPABASE_DB_PASSWORD`
- `main` → production DB via `PRODUCTION_DB_PASSWORD`

### 3. Mise à jour mémoire CI/CD

Mettre à jour `mem://infrastructure/ci-cd-edge-functions-fr` pour refléter le dual-environment.

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `.github/workflows/deploy-functions.yml` | Refonte : 2 jobs (staging + production) |
| `.github/workflows/deploy-migrations.yml` | Nouveau : migrations DB dual-env |
| `.lovable/memory/infrastructure/ci-cd-edge-functions-fr.md` | Mise à jour |

## Points de vigilance

- La fonction `api-public` n'est pas dans le workflow actuel — elle sera ajoutée.
- Les secrets Edge Functions (SMTP, etc.) doivent être configurés **sur les deux projets Supabase** indépendamment (via le dashboard de chaque projet).
- Vercel gère automatiquement le déploiement frontend : preview sur `develop`, production sur `main` — aucune configuration GitHub Actions nécessaire pour le frontend.

