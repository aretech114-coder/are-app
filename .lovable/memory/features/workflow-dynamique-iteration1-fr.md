---
name: Workflow dynamique — Itération 1
description: Table workflow_steps enrichie avec colonnes dynamiques, hook useWorkflowSteps, composant WorkflowStepManager pour CRUD/réordonnancement, WorkflowStepper dynamique
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
- Réordonnancement via double-pass (valeurs négatives temporaires pour éviter conflits UNIQUE)

### Composants
- `WorkflowStepManager` — UI admin complète : réordonnancement up/down, toggle actif, édition (nom, description, rôle, mode assignation, couleur), création, suppression avec confirmation
- `WorkflowStepper` — utilise désormais `useActiveWorkflowSteps` au lieu du tableau hardcodé
- `WorkflowPage` — intègre le `WorkflowStepManager` et utilise `useWorkflowSteps` pour la section responsables

### Rétrocompatibilité
- `workflow-engine.ts` conserve `WORKFLOW_STEPS` statique et `getStepInfo/getStepColor` pour `WorkflowActions.tsx`
- Itération 2 prévue pour refactorer `advance_workflow_step` RPC vers lecture dynamique de `workflow_steps`
