# Toggle « Créer une réponse » par étape de workflow

## Objectif

Permettre à un administrateur d'activer, étape par étape, un bouton « Créer une réponse » qui lance la saisie d'un courrier **sortant** lié automatiquement au courrier entrant en cours de traitement. Modulable selon les institutions : certaines voudront le bouton dès l'étape 1, d'autres à l'étape 5, 10, etc.

## 1. Base de données (1 migration)

**Table `workflow_steps`** : ajouter `allow_reply_creation boolean NOT NULL DEFAULT false`.

**Table `mails`** : ajouter `parent_mail_id uuid NULL` (référence souple, pas de FK stricte pour ne pas bloquer suppressions) + index. Permet de lier la réponse sortante au courrier entrant d'origine et d'afficher l'historique « réponses » dans la fiche du courrier entrant.

Aucun changement de RLS (mêmes politiques s'appliquent), aucun GRANT additionnel (colonnes ajoutées à des tables existantes).

## 2. Admin — Configurer le toggle (`WorkflowStepManager.tsx`)

Dans le formulaire d'édition/création d'étape, ajouter un bloc « Actions disponibles » avec un `Switch` :

> **Permettre la création d'une réponse depuis cette étape**
> Affiche un bouton « Créer une réponse » qui pré-remplit un courrier sortant lié à ce courrier.

Persiste `allow_reply_creation` via `useUpdateWorkflowStep` / `useCreateWorkflowStep` (mise à jour du type `WorkflowStep` dans `useWorkflowSteps.tsx`).

## 3. Bouton « Créer une réponse » (`WorkflowActions.tsx`)

Si `step.allow_reply_creation === true` **et** l'utilisateur a accès à l'étape courante (logique `canAct` existante), afficher en tête du panneau d'actions un bouton secondaire distinct (icône `Reply`, variant outline, couleur accent) — séparé visuellement des actions de transition pour ne pas créer de confusion UX.

Clic → ouvre `MailRegistrationSheet` (déjà converti en Dialog centré) en mode `direction="sortant"`, avec props additionnelles :
- `parentMail` : `{ id, reference_number, sender_name, sender_organization, subject }`
- Pré-remplissage : `subject = "RE: <sujet entrant>"`, `addressed_to` = expéditeur du courrier entrant, champ description vide, bandeau d'info « Réponse au courrier <REF> ».
- À la soumission, `parent_mail_id` du nouveau courrier = id du courrier entrant.

## 4. Visibilité du lien parent/réponse

Dans la fiche du courrier (côté lecture, `MailDetailFields` ou panneau dédié) : afficher une petite section « Réponses associées » listant les courriers sortants liés (`parent_mail_id = mail.id`) avec leur référence, sujet, statut. Lien cliquable pour ouvrir la réponse. Symétriquement, sur un courrier sortant ayant un `parent_mail_id`, afficher un badge « Réponse à <REF entrant> ».

## 5. UX & mobile

- Bouton « Créer une réponse » : pleine largeur sur mobile, inline desktop, libellé court (`Reply` + texte), placé au-dessus des actions de workflow.
- Dialog de création déjà responsive (`max-w-[50vw] sm:max-w-2xl lg:max-w-3xl max-h-[85vh]`) — vérifié OK mobile via le viewport plein écran fallback.
- Toast confirmation : « Réponse créée — liée au courrier <REF> ».
- Aucune étape de workflow modifiée : la création d'une réponse n'avance/ne bloque jamais le workflow du courrier entrant.

## Détails techniques

**Fichiers touchés**
- Migration SQL (workflow_steps + mails)
- `src/hooks/useWorkflowSteps.tsx` (type + payload create/update)
- `src/components/WorkflowStepManager.tsx` (Switch dans `StepFormFields`)
- `src/components/MailRegistrationSheet.tsx` (props `parentMail`, pré-remplissage, insert `parent_mail_id`)
- `src/components/WorkflowActions.tsx` (bouton conditionnel)
- `src/components/MailDetailFields.tsx` (section « Réponses associées » + badge parent)

**Rétrocompatibilité** : `allow_reply_creation` défaut `false` → comportement inchangé pour les workflows existants. À activer ponctuellement.
