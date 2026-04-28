
# Itération 2 — Assignation par utilisateur + Routage conditionnel avec fallbacks

## Bloc 1 — Refonte du formulaire d'étape (Workflow Step Manager)

### Cible fonctionnelle
Dans `Ajouter / Modifier une étape`, remplacer le champ unique « Rôle responsable » par un sélecteur à 3 modes :

```text
┌──────────────────────────────────────────────────────┐
│ Mode de désignation :                                │
│   ( ) Par rôle(s)        — collectif, tout porteur   │
│   ( ) Par utilisateur(s) — nominatif                 │
│   (•) Mixte              — rôles ET utilisateurs     │
├──────────────────────────────────────────────────────┤
│ Rôles autorisés [▼ multi-sélect]                     │
│   ☑ Ministre  ☑ DirCab  ☐ DG  ☐ DGA  ☐ DAF ...       │
│   (liste complète des 11 rôles + rôles dynamiques)   │
│                                                      │
│ Utilisateurs spécifiques [▼ multi-sélect, recherche] │
│   ☑ Jean Dupont (Conseiller)                         │
│   ☑ Marie Kalala (Superviseur)                       │
└──────────────────────────────────────────────────────┘
```

### Changements DB
Migration `workflow_steps` :
- `responsible_roles text[]` (multi-rôles)
- `responsible_user_ids uuid[]` (utilisateurs nominatifs)
- `assignment_target text` (`'roles' | 'users' | 'mixed'`, défaut `'roles'`)
- Garder `responsible_role` pour compat (alimenté par `responsible_roles[0]`).

### Changements Front
- `src/components/WorkflowStepManager.tsx` : nouveau formulaire avec radio group + 2 multi-sélects (Command/Popover de shadcn).
- Lister **tous les rôles** dynamiquement via la RPC `get_enum_values()` (déjà existante) + libellés FR via `getRoleLabel`.
- Lister tous les utilisateurs via `fetchWorkflowAssignableUsers` (déjà existant), groupés par rôle.
- `src/hooks/useWorkflowSteps.tsx` : étendre le type `WorkflowStep` et payload create/update.
- `src/lib/workflow-engine.ts` : compléter `getRoleLabel` pour couvrir `dg`, `dga`, `daf`, `dt`, `reception`, `admin`, `superadmin`.

### Changements RPC (`resolve_step_assignee` + `advance_workflow_step`)
Nouvelle priorité de résolution :
1. Si `responsible_user_ids` non vide → assigne à ces utilisateurs (multi-assignation comme étape 4).
2. Sinon si `responsible_roles` non vide → assigne au premier utilisateur trouvé pour le premier rôle listé.
3. Sinon comportement actuel (`workflow_step_responsibles.default_user_id`).

---

## Bloc 2 — Routage conditionnel avec cascade de fallbacks (NOUVEAU)

### Principe
Chaque étape peut déclarer une ou plusieurs **conditions de bascule** (« skip / fallback ») ; pour chaque condition, l'admin définit une **liste ordonnée de jusqu'à 5 utilisateurs de secours**. Le système prend le premier disponible (non absent).

### Conditions disponibles (extensibles)
- `ministre_absent` — déjà géré, à enrichir avec UI fallback.
- `dg_absent` — nouveau (DG en mission/voyage).
- `responsible_unavailable` — générique : si le responsable principal est marqué indisponible.
- `mail_type_not_note_technique` — déjà géré.

### Schéma DB (nouvelle table)
```sql
create table public.workflow_step_fallbacks (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references workflow_steps(id) on delete cascade,
  condition_key text not null,        -- ex: 'ministre_absent', 'dg_absent'
  fallback_user_ids uuid[] not null default '{}',  -- ordre = priorité, max 5
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(step_id, condition_key)
);
-- RLS : superadmin full / admin avec permission 'manage_workflow_assignments'
-- CHECK via trigger : array_length(fallback_user_ids, 1) <= 5
```

Ajout sur `profiles` :
- `is_available boolean default true` (utilisé pour détecter « absent »).
- (Optionnel) `unavailable_until timestamptz` pour absence temporaire.

### UI — Onglet « Routage conditionnel » dans WorkflowPage
Pour chaque étape, panneau accordéon :

```text
┌─ Étape 2 : Réception Ministre ──────────────────────┐
│ ▸ Condition : Ministre absent          [actif ☑]    │
│   Cascade de remplaçants (priorité descendante) :   │
│   1. [▼ Marie Kalala (DirCab)         ] [×]         │
│   2. [▼ Paul Mbuyi (DirCabA)          ] [×]         │
│   3. [▼ Jean Dupont (Conseiller)      ] [×]         │
│   [+ Ajouter un fallback] (max 5)                   │
│                                                     │
│ ▸ Condition : Responsable indisponible  [actif ☐]   │
└─────────────────────────────────────────────────────┘
```

- Bouton « + Ajouter un fallback » désactivé à 5.
- Drag-and-drop pour réordonner la priorité (ou flèches haut/bas).
- Toggle « actif » par condition.
- Accessible uniquement à : `superadmin` OR (`admin` AVEC permission `manage_workflow_assignments`).

### UI — Disponibilité utilisateur
Sur la page profil + page Admin Users :
- Switch « Disponible / Absent » sur le profil propre.
- Admin/SuperAdmin peuvent basculer la dispo de n'importe quel utilisateur.

### Logique RPC
Modifier `advance_workflow_step` : avant d'assigner à l'utilisateur cible de l'étape, vérifier :
1. Si une condition active est remplie pour l'étape (ex. ministre marqué absent OU responsable principal indisponible) →
2. Parcourir `fallback_user_ids` dans l'ordre, prendre le premier dont `profiles.is_available = true`.
3. Si aucun fallback disponible → enregistrer une transition `skip` et passer à l'étape suivante (comportement actuel pour `ministre_absent`).
4. Logger la transition avec `notes = 'Fallback utilisé: <user>'` pour traçabilité.

### Fichiers impactés Bloc 2
- `supabase/migrations/<ts>_workflow_fallbacks.sql` (table + colonnes profiles + RLS + trigger validation taille)
- `supabase/migrations/<ts>_advance_workflow_with_fallback.sql` (refonte RPC)
- `src/pages/WorkflowPage.tsx` : nouvelle section « Routage conditionnel ».
- `src/components/WorkflowFallbackManager.tsx` (nouveau composant).
- `src/hooks/useWorkflowFallbacks.tsx` (nouveau hook).
- `src/pages/ProfilePage.tsx` + `src/pages/AdminPage.tsx` : toggle disponibilité.

---

## Sécurité (cybersécurité — audit pré-PR)

- ✅ RLS strictes : nouvelle table `workflow_step_fallbacks` lecture pour acteurs workflow, écriture pour superadmin + admin délégué.
- ✅ Trigger validation : `array_length(fallback_user_ids, 1) <= 5` (CHECK dans trigger, pas en CHECK constraint car on touche un array).
- ✅ Pas de modification des schémas réservés (`auth`, `storage`, etc.).
- ✅ Notification e-mail au fallback désigné (réutilise `send-notification-email`).
- ✅ Audit trail dans `workflow_transitions` à chaque déclenchement de fallback.
- ⚠ Risque identifié : si le superadmin configure une cascade vide ET que la condition se déclenche → comportement actuel `skip` préservé pour éviter blocage.

---

## Périmètre validé pour cette livraison
1. **Bloc 1** : refonte formulaire étape (rôles + utilisateurs, multi-sélect, mode mixte).
2. **Bloc 2** : routage conditionnel + cascade fallbacks 5 niveaux + UI dédiée + flag disponibilité utilisateur.

Les deux blocs sont à livrer dans cette itération 2. Après validation, j'attaque dans cet ordre : (1) DB + RPC, (2) hooks, (3) composants UI, (4) intégration WorkflowPage.

**Approuvez-vous ce plan révisé ?**
