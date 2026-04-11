---
name: Workflow dynamique — Itération 1 & 2
description: Table workflow_steps enrichie, hook useWorkflowSteps, StepManager admin, stepper dynamique, RPC advance_workflow_step dynamique
type: feature
---
## Itération 1 — Fondations & UI

### Base de données
- Table `workflow_steps` enrichie : `responsible_role`, `action_labels` (jsonb), `assignment_mode`, `color_class`
- Contrainte UNIQUE sur `step_order`
- 9 étapes seedées avec ON CONFLICT upsert

### Hook `useWorkflowSteps`
- `useWorkflowSteps()` — toutes les étapes (React Query, clé `workflow_steps`)
- `useActiveWorkflowSteps()` — filtre `is_active`
- Mutations : `useUpdateWorkflowStep`, `useCreateWorkflowStep`, `useDeleteWorkflowStep`, `useReorderWorkflowSteps`

### Composants
- `WorkflowStepManager` — UI admin complète : réordonnancement, toggle actif, édition, création, suppression
- `WorkflowStepper` — utilise `useActiveWorkflowSteps` depuis la DB
- `WorkflowPage` — intègre le `WorkflowStepManager`

## Itération 2 — RPC dynamique

### RPC `advance_workflow_step` refactorée
- Calcul de la prochaine étape via `SELECT MIN/MAX(step_order) FROM workflow_steps WHERE is_active = true`
- Étape d'archivage = `MAX(step_order)` dynamique (plus hardcodé à 9)
- Conditions de saut lues depuis `conditions` (jsonb) : `skip_if_ministre_absent`, `skip_if_not_note_technique`
- Boucle LOOP pour enchaîner les sauts si plusieurs étapes consécutives ont des conditions
- Logique d'assignation inchangée (étapes 4/7 dynamiques)

### Client `workflow-engine.ts`
- `getStepInfoFromDB()` — requête DB avec fallback statique
- `sendStepEmailNotification` utilise désormais les noms d'étapes dynamiques
- Exports statiques (`WORKFLOW_STEPS`, `getStepInfo`, `getStepColor`, `getStepLabel`) conservés pour rétrocompatibilité UI
