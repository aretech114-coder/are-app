---
name: CI/CD Edge Functions dual-env
description: Déploiement des 10 fonctions Edge + migrations vers staging (develop) et production (main) via GitHub Actions
type: feature
---
Le CI/CD utilise deux workflows GitHub Actions avec architecture dual-environment :

**deploy-functions.yml** — 10 Edge Functions :
`create-user`, `update-user`, `delete-user`, `manage-roles`, `sla-checker`, `ai-assistant`, `sync-users`, `impersonate-user`, `send-notification-email`, `api-public`

**deploy-migrations.yml** — Migrations SQL automatiques via `supabase db push`

| Branche | Cible | Secret projet | Secret DB |
|---------|-------|---------------|-----------|
| `develop` | Staging | `SUPABASE_PROJECT_ID` | `SUPABASE_DB_PASSWORD` |
| `main` | Production | `PRODUCTION_PROJECT_ID` | `PRODUCTION_DB_PASSWORD` |

Le `SUPABASE_ACCESS_TOKEN` est partagé entre les deux environnements.
Les secrets Edge (SMTP, etc.) doivent être configurés indépendamment sur chaque projet.
