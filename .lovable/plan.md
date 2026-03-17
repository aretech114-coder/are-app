

# Audit complet : ce qui reste pour que la nouvelle logique soit 100% opérationnelle

## Problèmes identifiés

### 1. **Le routage auto n'utilise PAS `resolveWorkflowStepAssignee`** (CRITIQUE)
Dans `WorkflowActions.tsx`, lors de l'avancement d'étape (lignes 526-564), le code cherche encore le prochain utilisateur **par rôle** (`user_roles.role = nextStep.role`) au lieu d'appeler `resolveWorkflowStepAssignee(result.newStep, mailId)`. La fonction est importée mais jamais appelée dans le flux de transition. Résultat : même si l'admin configure un responsable par défaut dans `workflow_step_responsibles`, il est ignoré.

Même problème à la ligne 308 (après que tous les conseillers finissent l'étape 4 → routage vers étape 5).

### 2. **Pas de `mail_assignment` créée par `advanceWorkflow`**
La fonction `advanceWorkflow` dans `workflow-engine.ts` met à jour `current_step` et `assigned_agent_id`, mais **ne crée jamais de `mail_assignment`** pour la nouvelle étape. Les RLS SELECT exigent une entrée dans `mail_assignments` pour la visibilité. Cela signifie que l'utilisateur de l'étape suivante peut ne pas voir le courrier.

### 3. **`assigned_agent_id` n'est pas mis à jour par `advanceWorkflow`**
La fonction ne met à jour que `current_step`, `status`, `deadline_at`. L'`assigned_agent_id` est mis à jour séparément dans `WorkflowActions`, mais seulement dans certains cas.

### 4. **Les `default_user_id` sont tous `null` en production**
La table `workflow_step_responsibles` est bien créée avec les 8 lignes, mais **aucun utilisateur par défaut n'a été sélectionné**. L'admin doit les configurer via la page Workflow. Ce n'est pas un bug code, mais tant qu'aucun responsable n'est configuré, `resolveWorkflowStepAssignee` retourne `null` et le routage échoue silencieusement.

### 5. **Permission `manage_workflow_assignments` désactivée (`is_enabled: false`)**
Les admins ne peuvent pas configurer les responsables tant que le superadmin n'active pas ce toggle.

## Plan de correction

### A. Refactorer le routage dans `WorkflowActions.tsx`
Remplacer les 3 blocs de routage par rôle par un appel unique à `resolveWorkflowStepAssignee(nextStepNumber, mailId)` :
- Bloc principal (lignes 526-564) : routage après approve/complete
- Bloc step 4→5 (lignes 306-324) : routage quand tous les conseillers finissent
- Ajouter systématiquement la création de `mail_assignment` après résolution

### B. Centraliser la création d'assignation dans `advanceWorkflow`
Modifier `workflow-engine.ts` pour que `advanceWorkflow` :
1. Appelle `resolveWorkflowStepAssignee(newStep, mailId)`
2. Crée automatiquement une `mail_assignment` pour l'utilisateur résolu
3. Mette à jour `assigned_agent_id` sur le mail
4. Retourne l'ID de l'utilisateur résolu dans le résultat

Cela élimine la duplication et garantit que chaque transition produit une assignation RLS-compatible.

### C. Gérer les étapes dynamiques (4 et 7)
- **Étape 4** : ne PAS auto-router via `advanceWorkflow` ; les conseillers sont assignés manuellement par l'étape 2 (déjà en place)
- **Étape 7** : idem, assignés par l'étape 6 (déjà en place)
- Ajouter un flag `skipAutoAssign` dans `advanceWorkflow` pour ces cas

### D. Aucune migration SQL nécessaire
La structure DB est complète (table, fonctions, RLS, index). Les seules actions sont :
1. **Code** : corriger le routage dans `WorkflowActions.tsx` et `workflow-engine.ts`
2. **Production** : le superadmin doit configurer les responsables par défaut sur la page Workflow

## Résumé des fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/lib/workflow-engine.ts` | `advanceWorkflow` → ajouter auto-assignation + `mail_assignment` + `assigned_agent_id` |
| `src/components/WorkflowActions.tsx` | Remplacer les 3 blocs de routage par rôle par `resolveWorkflowStepAssignee` ; simplifier le code post-transition |
| `src/lib/workflow-assignment.ts` | Aucun changement |

## Après déploiement : actions manuelles production

1. Le **SuperAdmin** active le toggle `manage_workflow_assignments` dans la page Admin
2. Le **SuperAdmin ou Admin** configure les responsables par défaut pour les étapes 2, 3, 5, 6, 8, 9 sur la page Workflow
3. Tester un courrier complet de bout en bout

