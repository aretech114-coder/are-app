---
name: Safety Policy Reference
description: Gouvernance, sécurité, Git flow, checklist pré-PR, migrations SQL manuelles via SQL Editor, continuité des données
type: reference
---
Le fichier SAFETY_POLICY.md est la référence absolue pour toute action sur le projet ARE Platform.

Sections clés :
- **B. Posture** — Dev senior full-stack + expert cybersécurité
- **C. Git Flow** — Lovable → develop → PR → main. Jamais de push direct dans main
- **D1-D5** — Sécurité DB (RLS obligatoire), Edge Functions (JWT), Frontend (pas de secrets), CORS, Secrets
- **D6. Migrations SQL — Exécution manuelle obligatoire (SQL Editor)** :
  - **Aucune** migration jouée par GitHub Actions ou CLI Supabase. Le workflow `deploy-migrations.yml` a été supprimé
  - Seul `deploy-functions.yml` reste actif (Edge Functions)
  - À chaque migration : Lovable génère un fichier `.sql` dans `/mnt/documents/migrations/YYYY-MM-DD_description.sql` et **notifie explicitement** le collaborateur (nom fichier, résumé impact, ordre Staging → Production)
  - Le collaborateur exécute manuellement via SQL Editor sur Staging puis Production
  - Aucune migration n'est considérée appliquée tant que les deux environnements n'ont pas été confirmés
  - SQL obligatoirement idempotent (IF NOT EXISTS), commenté, avec rollback
- **D7. Continuité et intégrité des données** — Migrations non-destructives, IF NOT EXISTS obligatoire, jamais de DROP/TRUNCATE sans WHERE, rollback documenté, colonnes nullable ou avec défaut
- **E. Protocole d'action** — Lire policy → identifier risques → notifier → attendre approbation → exécuter → vérifier
- **F. Checklist pré-PR** — RLS, pagination, pas de console.log sensible, Zod, responsive, performance
- **G. Architecture** — Modularité, API-first, workflow dynamique, multi-tenant ready
- **H. Qualité** — Zéro deprecation, TypeScript strict, composants focalisés, design tokens
