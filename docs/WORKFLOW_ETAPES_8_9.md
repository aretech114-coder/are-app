# Workflow étapes 8 → 9 — Spécification opérationnelle

## Vue d'ensemble

| Étape | Rôle | Objectif |
|-------|------|----------|
| **8** | Secrétariat | Workspace rédaction (brouillon riche), impression en-tête, export Word ; transmission vers archivage **sans PJ obligatoire** |
| **9** | Archiviste | Archivage définitif **avec accusé de réception du courrier sortant** (déposé à l'étape 8 ou 9) |

## Données

### Table `mail_workflow_documents`

- Type officiel : `accuse_reception_sortant`
- Contrainte : **un seul accusé par courrier** (`UNIQUE (mail_id, document_type)`)
- Storage : `deposits/{mailId}/` (étape 8) ou `archives/{mailId}/` (étape 9)

### Colonnes `mails`

- `outgoing_draft_html` — brouillon TipTap (étape 8)
- `step8_arrived_at` — horodatage arrivée étape 8
- `step8_transmitted_at` — horodatage transmission manuelle ou auto 8→9

## Règles RPC `advance_workflow_step`

- **Étape 8 `complete`** : pas d'exigence de PJ ; renseigne `step8_transmitted_at` si passage à l'étape 9
- **Étape 9 `archive`** : refuse si `NOT has_accuse_reception_sortant(mail_id)`

## Paramètres admin

| Clé | Défaut | Description |
|-----|--------|-------------|
| `step8_auto_advance_hours` | `0` | Délai auto 8→9 (heures). `0` = désactivé |
| `ged_module_enabled` | `false` | Génération PDF dossier GED à l'archivage |

## Passage auto 8→9

Edge Function `workflow-step8-auto-advance` (cron recommandé) :

- Lit `step8_auto_advance_hours`
- Cible : `current_step = 8`, `step8_transmitted_at IS NULL`, `step8_arrived_at + délai < now()`
- Appelle `advance_workflow_step(..., 'complete', ...)` avec note automatique

## Module GED

À l'archivage (si module actif) :

- Edge Function `generate-ged-dossier`
- PDF `{expéditeur}_{réf}.pdf` dans bucket `ged-documents`
- Métadonnées dans `ged_documents`

## Courriers legacy

- **`archived` sans accusé** : aucune contrainte rétroactive
- **Étape 8/9 en cours** : backfill migration AJ depuis `workflow_transitions` (notes `deposits/`)

## Migrations production

1. **AJ** — `20260616900000_workflow_steps_8_9_closure.sql`
2. **AK** — `20260616910000_ged_module.sql`

Voir [`supabase/scripts/production_migrations_guide.md`](../supabase/scripts/production_migrations_guide.md) et [`audit_closure_documents.sql`](../supabase/scripts/audit_closure_documents.sql).
