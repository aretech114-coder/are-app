---
name: Safety Policy Reference
description: Gouvernance, sécurité, Git flow, checklist pré-PR, protocole migrations SQL manuelles
type: reference
---
Le fichier SAFETY_POLICY.md est la référence absolue pour toute action sur le projet ARE Platform.

Sections clés :
- **B. Posture** — Dev senior full-stack + expert cybersécurité
- **C. Git Flow** — Lovable → develop → PR → main. Jamais de push direct dans main
- **D1-D5** — Sécurité DB (RLS obligatoire), Edge Functions (JWT), Frontend (pas de secrets), CORS, Secrets
- **D6. Migrations SQL contrôlées** — Deux modes :
  - Pré-GitHub (actuel) : migrations via Lovable Cloud
  - Mode GitHub (à activer sur signal) : fichier .sql téléchargeable dans /mnt/documents/migrations/, nomenclature YYYY-MM-DD_description.sql, exécution manuelle par le collaborateur
- **E. Protocole d'action** — Lire policy → identifier risques → notifier → attendre approbation → exécuter → vérifier
- **F. Checklist pré-PR** — RLS, pagination, pas de console.log sensible, Zod, responsive, performance
- **G. Architecture** — Modularité, API-first, workflow dynamique, multi-tenant ready
- **H. Qualité** — Zéro deprecation, TypeScript strict, composants focalisés, design tokens
