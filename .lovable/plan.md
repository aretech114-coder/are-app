
# Refonte dynamique de WorkflowActions

## Problème (confirmé)

Le composant `src/components/WorkflowActions.tsx` contient un **mapping rôle→étape figé** (lignes 84-95) et des **conditions `if (currentStep === N)`** partout pour générer les boutons, libellés et formulaires. Or `workflow_steps` a été personnalisé en base (étapes renommées/réordonnées, rôles modifiés, ajout de `dg`, étape 7 = Secrétariat, étapes 9 et 10 ajoutées). Résultat : tout rôle ou numéro d'étape qui s'écarte du mapping initial ne voit **aucun champ ni bouton de traitement** — c'est ce qui arrive au DG.

## Principe de la refonte

La table `workflow_steps` devient la **seule source de vérité**. On exploite les colonnes déjà existantes :

- `responsible_roles` (text[])
- `responsible_user_ids` (uuid[])
- `assignment_target` (`roles` / `users` / `mixed`)
- `action_labels` (jsonb : `{ approve: "...", reject: "...", complete: "...", ... }`)
- `allow_sub_assignment`, `allow_reply_creation`
- `conditions` (jsonb)
- `name`, `step_order`

Plus aucun numéro d'étape ni nom de rôle codé en dur côté UI.

## Changements

### 1. `src/components/WorkflowActions.tsx` — refonte

**a. Calcul de `canAct` dynamique** (remplace `roleStepMap`) :

L'utilisateur peut agir sur l'étape courante si :
- il a une `mail_assignments` `pending` / `proposed` sur ce mail + step ; **ou**
- son rôle figure dans `currentStepConfig.responsible_roles` ; **ou**
- son `user_id` figure dans `currentStepConfig.responsible_user_ids` ; **ou**
- il est `admin` / `superadmin`.

→ nouveau hook léger `useStepPermission(mailId, currentStep)` qui combine `useActiveWorkflowSteps` + une requête `mail_assignments`.

**b. `getActions()` dynamique** :

- Lit `currentStepConfig.action_labels` (jsonb). Pour chaque clé présente → un bouton.
- Mapping clé → icône/variant centralisé :
  - `approve` / `complete` / `acknowledge` → `CheckCircle`, default
  - `reject` → `XCircle`, destructive
  - `archive` → `Archive`, outline
  - autres → `ArrowRight`, default
- Si `action_labels` est vide, fallback intelligent selon `step_order` (dernière étape active = archive, sinon `approve` + `reject`).
- Les libellés type « Renvoyer au Ministre / retour étape 4 » sont remplacés par : `« Renvoyer à : {nom de l'étape précédente active} »`, calculé via `activeSteps`.

**c. Affichage conditionnel des blocs (annotation / assignation / pièce jointe / traitement)** :

Au lieu de `currentStep === 2 || 3 || ...`, on s'appuie sur des flags dérivés de la config :

- `showAssignment` = `currentStepConfig.assignment_target` in (`users`, `mixed`) OU étape courante prépare l'étape suivante qui requiert assignation (cas actuel des étapes 2/3 qui pré-assignent l'étape 4). Pour simplifier : on expose ces blocs **dès qu'on a la permission** d'agir, mais on garde la logique métier existante pour étapes 4/7 (multi-assignation) qui reste pilotée par `allow_sub_assignment` et la présence de plusieurs `mail_assignments`.
- `showSubmitTreatment` = il existe au moins un `mail_assignments.assigned_to = user.id` sur l'étape courante (la « soumission individuelle » du multi-assignation actuel).
- `showAttachment` / `showAnnotation` : exposés par défaut sauf si étape finale d'archivage.

**d. `dialogTitle`** : remplacé par `currentStepConfig.name` (avec préfixe « Action — »).

**e. Logiques spéciales (multi-assignation, RDV, AR, sous-assignation, preuve de dépôt)** : conservées telles quelles **mais déclenchées par des flags de config** au lieu de numéros d'étape :
- Multi-assignation et acknowledge → détectés par la présence de plusieurs `mail_assignments` actives sur le step + statut individuel (déjà le cas en partie).
- Génération AR / preuve de dépôt → conditionné par `currentStepConfig.action_labels?.complete` ET `mail_type === 'accuse_reception'` (au lieu de `currentStep === 8`).
- Création de réponse → déjà piloté par `allow_reply_creation` ✅.
- Sous-assignation → déjà piloté par `allow_sub_assignment` ✅.
- Pré-assignation conseillers depuis étape 2 → conditionné par `currentStepConfig.assignment_target` in (`users`, `mixed`) ET existence d'une étape suivante.

### 2. Garde-fous backend (côté `advance_workflow_step` RPC)

La RPC vérifie déjà `mail_assignments` + `admin/superadmin`. **Aucun changement DB nécessaire** pour ce ticket — le bug est purement front. La validation des permissions reste serveur via RLS + RPC.

### 3. Points NON modifiés

- Pas de migration SQL.
- Pas de modification de `workflow-engine.ts` ni `WorkflowStepper.tsx` (déjà dynamique).
- Pas de modification des edge functions ni des notifications.

## Vérification après build

1. Se connecter comme DG → ouvrir un courrier à l'étape 6 → vérifier que le bouton « Valider & Finaliser » (ou libellé issu de `action_labels`) s'affiche, avec les champs annotation et pièce jointe.
2. Re-tester chacun des rôles déjà fonctionnels (ministre étape 2, dircab étape 3, conseiller étape 4 multi, secrétariat étapes 9/10) pour confirmer la non-régression.
3. Tester l'ajout d'une nouvelle étape via `WorkflowStepManager` → les boutons doivent apparaître **sans nouveau déploiement**.

## Notes / risques

- La logique « étapes spéciales » (RDV étape 2, AR étape 8) garde une part conditionnelle car elle dépend du *contenu métier* (type de courrier, présence d'un draft IA) et pas seulement de la structure du workflow. On la rattache à des champs sémantiques (`action_labels.complete` + `mail_type`) plutôt qu'au numéro d'étape.
- À terme, ces comportements pourraient être pilotés par de nouveaux flags ajoutés à `workflow_steps` (`enable_rdv_scheduling`, `generate_ar_document`, etc.) — proposé en suivant si besoin, hors scope ici.
- Aucun impact RLS — la sécurité reste enforced côté DB.
