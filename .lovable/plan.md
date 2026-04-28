## Objectif (itération 1 — MVP métier)

Faire évoluer le moteur de workflow pour qu'un admin puisse **recomposer librement** les étapes (rôles DG/DGA/DAF/DT inclus), introduire la **sous-assignation formelle avec retour obligatoire**, et permettre au DG de **récupérer manuellement** un courrier dont le SLA a expiré pour réassigner.

Hors périmètre de cette itération : SLA configurables avancés et routage Note technique/Accusé/Note de service (itération 2).

---

## 1. Nouveaux rôles métier

**Migration SQL** : ajouter via `add_app_role` les rôles manquants : `dg`, `dga`, `daf`, `dt`. (Conservation totale des rôles existants — `ministre`, `dircab`, etc. — pour les organisations qui utilisent l'ancien schéma.)

Mettre à jour les RLS critiques (`mail_assignments`, `mails`, `notifications`, `workflow_transitions`) pour inclure ces nouveaux rôles dans les politiques d'insertion/lecture, sur le même modèle que `dircab`/`ministre`.

---

## 2. Sous-assignation formelle

### Nouvelle table `mail_sub_assignments`
```text
id              uuid PK
parent_assignment_id  uuid  -- référence mail_assignments.id
mail_id         uuid
sub_assigned_by uuid  -- l'assigné principal
sub_assigned_to uuid  -- membre de son équipe
status          text  -- 'pending' | 'submitted' | 'validated' | 'rejected'
submission_notes text
parent_deadline_at timestamptz  -- copie du chrono du principal (visible côté sous-assigné)
created_at, submitted_at, validated_at
```

### RLS
- Le principal voit/crée les sous-assignations rattachées à ses propres `mail_assignments`.
- Le sous-assigné voit/met à jour uniquement les siennes.
- Admins/superadmin : accès total.
- Pas de contournement du workflow global : tant que `status != 'validated'`, l'`mail_assignment` parent reste `pending`.

### Règle métier
- Le principal peut sous-assigner à 1..N personnes.
- Chaque sous-assigné soumet sa contribution → status `submitted`.
- Le principal **valide ou corrige** (status `validated` ou `rejected`).
- L'avancement de l'étape globale n'est possible qu'une fois toutes les sous-assignations en `validated` (ou aucune sous-assignation).

### UI
- Composant `SubAssignmentPanel` visible dans le détail d'un courrier pour l'assigné principal (bouton « Sous-assigner ») et pour le sous-assigné (vue lecture + soumission).
- Affichage du chrono hérité côté sous-assigné : « Échéance principale : J-X ».

---

## 3. Revert manuel sur SLA expiré

### Nouvelle RPC `revert_mail_to_dispatcher(_mail_id, _performed_by, _notes)`
- Vérifie que l'appelant est le **dispatcher d'origine** (celui qui a réalisé l'assignation à l'étape de traitement) ou admin/superadmin.
- Vérifie que `mails.deadline_at < now()`.
- Recule `current_step` à l'étape de dispatch (étape précédant le traitement, déterminée dynamiquement via `workflow_steps`).
- Marque les `mail_assignments` de l'étape de traitement comme `status='reverted'` (sans les supprimer — traçabilité).
- Insère une `workflow_transitions` avec `action='revert_sla_expired'`.
- Notifie le dispatcher.

### Edge function `sla-checker`
Au lieu de forcer une transition, elle **notifie le dispatcher** quand un courrier dépasse son SLA : « Courrier X en dépassement, vous pouvez le récupérer pour réassigner ».

### UI
- Sur les courriers expirés visibles dans le tableau du dispatcher, bouton **« Récupérer & réassigner »** qui appelle la RPC puis ouvre directement le dialogue d'assignation pré-rempli.

---

## 4. Workflow paramétrable unique (consolidation de l'existant)

L'infrastructure `workflow_steps` + `workflow_step_responsibles` existe déjà. Trois ajustements :

1. **Étendre `responsible_role`** pour accepter les nouveaux rôles (`dg`, `dga`, `daf`, `dt`) — c'est juste du texte côté DB, mais ajouter la validation côté UI `WorkflowStepManager`.
2. **Ajouter `allow_sub_assignment` (boolean) sur `workflow_steps`** : indique si la sous-assignation est autorisée pour cette étape (typiquement les étapes de traitement). Migration + UI toggle.
3. **Adapter `advance_workflow_step`** : avant d'autoriser la transition `complete` sur une étape qui a `allow_sub_assignment=true`, vérifier qu'aucune sous-assignation n'est en `pending`/`submitted`.

---

## 5. Schéma final (référence visuelle)

Le schéma Mermaid `workflow_ARE_v2.mmd` fourni ci-dessus reste la référence métier. Il sera décliné dans la doc admin.

---

## Détails techniques

**Migrations SQL nécessaires** (3 fichiers dans `supabase/migrations/`) :
1. `add_dg_dga_daf_dt_roles.sql` — appels à `add_app_role` + extension RLS.
2. `create_mail_sub_assignments.sql` — table + RLS + index.
3. `add_allow_sub_assignment_workflow_steps.sql` — colonne + ajustement RPC `advance_workflow_step`.
4. `create_revert_mail_to_dispatcher_rpc.sql` — RPC SECURITY DEFINER.

**Nouveaux fichiers code** :
- `src/hooks/useSubAssignments.tsx` — CRUD React Query.
- `src/components/SubAssignmentPanel.tsx` — UI principale + sous-assigné.
- `src/components/RecoverMailButton.tsx` — bouton revert.

**Fichiers modifiés** :
- `src/lib/workflow-engine.ts` — exposer `revertToDispatcher()`.
- `src/components/WorkflowActions.tsx` — bloquer `complete` si sous-assignations pendantes.
- `src/components/WorkflowStepManager.tsx` — toggle `allow_sub_assignment` + dropdown rôles enrichi.
- `supabase/functions/sla-checker/index.ts` — notification dispatcher au lieu d'avancement forcé.
- `src/integrations/supabase/types.ts` — régénération auto.

**Sécurité (audit cyber)** :
- Toutes les nouvelles RPC en `SECURITY DEFINER` + `SET search_path = public`.
- Vérifications d'autorisation **dans** la RPC (pas seulement RLS).
- Pas de SQL dynamique sur les rôles côté client.
- Tous les nouveaux endpoints couverts par RLS dès leur création.

**Compatibilité** :
- Rétro-compatible : les courriers existants conservent leur workflow ; la sous-assignation est opt-in via `allow_sub_assignment`.
- Aucun rôle existant supprimé.

**Git flow** : tout sur `develop`, PR vers `main` après validation user. Migrations SQL appliquées **manuellement** via SQL Editor (Staging → Production), conformément à la safety policy.

---

## Risques

- **Ajout de valeurs à un enum Postgres** ne peut pas être fait dans une transaction qui les utilise immédiatement après — chaque `add_app_role` doit être dans un fichier de migration séparé ou commité avant utilisation.
- Régression possible sur les RLS si on étend mal les politiques — couvert par tests d'intégration sur les rôles existants.

## Hors périmètre (itérations futures)

- Itération 2 : SLA éditables par étape via UI admin + champ `production_type` (note technique / accusé / note de service) avec routage conditionnel post-validation.
- Itération 3 : tableau de bord dédié au dispatcher (vue « mes dossiers en délégation »).