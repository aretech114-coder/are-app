# Sous-assignation à l'étape Traitement (étape 4)

> **Statut :** partiellement implémenté — **non finalisé**  
> **Dernière revue :** juillet 2026  
> **Objectif de ce document :** figer l'état actuel, les décisions métier à trancher et le plan de finalisation avant implémentation.

---

## 1. Contexte métier

À l'étape **Traitement** (step 4), plusieurs personnes peuvent être assignées en parallèle sur un même courrier. Le besoin exprimé est d'aller plus loin :

1. Un **assigné principal** (ex. manager, cadre responsable) **délègue** une partie du travail à des **sous-assignés**.
2. Les sous-assignés travaillent **dans la même fenêtre SLA** que le courrier.
3. Une fois les sous-tâches terminées et **validées par l'assigné principal**, celui-ci **finalise** son propre traitement.
4. Le courrier ne passe à l'étape suivante que lorsque la logique globale est satisfaite.
5. **Décision ouverte :** le DG doit-il voir les sous-traitements en détail, ou uniquement les traitements consolidés des assignés principaux ?

---

## 2. État actuel — synthèse

| Composant | Statut | Commentaire |
|-----------|--------|-------------|
| Traitement multi-assignés (`mail_contributions`) | ✅ Opérationnel | Documenté dans `docs/STAGING_ACCESS_TESTS.md` |
| Sous-assignation (`mail_sub_assignments`) | ⚠️ Partiel | UI + table existantes, logique incomplète |
| Blocage workflow si sous-tâches en cours | ❌ Perdu | Présent en UI, absent des RPC récentes |
| Visibilité DG sur sous-traitements | ❌ Non | RLS exclut `directeur` / `dg` |
| E-mails sous-assignation | ❌ Non | Notification in-app uniquement |
| SLA dédié sous-tâches | ❌ Non | Copie de `mails.deadline_at` |
| Réglage admin `allow_sub_assignment` | ⚠️ DB seule | Pas d'UI dans `WorkflowStepManager` |
| Scénario E2E / guide prod | ❌ Absent | Migration non listée dans `production_migrations_guide.md` |

**Estimation : ~40–50 % du besoin final.**

---

## 3. Deux mécanismes parallèles (important)

Le code contient **deux systèmes distincts** qui ne sont pas fusionnés :

### 3.1 Traitement principal — `mail_contributions`

| Élément | Détail |
|---------|--------|
| **Table** | `mail_contributions` |
| **RPC** | `submit_step4_treatment` |
| **UI** | `WorkflowActions` → « Soumettre mon traitement » |
| **Affichage** | `MailContributionsPanel`, `TreatmentsList` |
| **Qui voit quoi** | Assignés : contributions soumises ; DG : soumis + brouillons (`showAllDrafts`) |
| **Avancement** | Auto quand tous les `contributor` ont soumis ; ou `dg_advance` par le DG |

Fichiers clés :

- `src/components/WorkflowActions.tsx` (soumission étape 4)
- `src/hooks/useMailContributions.ts`
- `src/lib/workflow-display.ts` (`shouldShowContributionsPanel`, `filterVisibleContributions`)
- `supabase/migrations/20260603120000_workflow_rls_unblock.sql` (RPC `submit_step4_treatment`)

### 3.2 Sous-assignation — `mail_sub_assignments`

| Élément | Détail |
|---------|--------|
| **Table** | `mail_sub_assignments` |
| **Statuts** | `pending` → `submitted` → `validated` / `rejected` |
| **UI** | `SubAssignmentPanel` (dans `MailDossierView`) |
| **Hooks** | `src/hooks/useSubAssignments.tsx` |
| **Flag étape** | `workflow_steps.allow_sub_assignment` (true par défaut sur step 4) |
| **Notifications** | In-app : « Nouvelle sous-assignation » |

Fichiers clés :

- `src/components/SubAssignmentPanel.tsx`
- `src/hooks/useSubAssignments.tsx`
- `supabase/migrations/20260428175825_3c4e7ec3-afe1-4f64-96b5-16cb6a4124ab.sql`

---

## 4. Flux prévu (sous-assignation)

```
Assigné principal (mail_assignments step 4)
    │
    ├─► Crée sous-assignation(s) → mail_sub_assignments (status: pending)
    │       └─► Notification in-app au sous-assigné
    │
    ├─► Sous-assigné soumet contribution textuelle (status: submitted)
    │
    ├─► Assigné principal valide ou rejette (status: validated / rejected)
    │       └─► Si rejeté : sous-assigné peut reprendre
    │
    └─► Assigné principal soumet son traitement final (mail_contributions)
            └─► Avancement étape suivante (si règles satisfaites)
```

Message affiché dans l'UI (`SubAssignmentPanel`) :

> *« L'avancement de l'étape sera bloqué tant que toutes les sous-assignations ne sont pas validées. »*

**Attention :** ce blocage n'est **plus appliqué côté serveur** (voir § 5).

---

## 5. Écarts et dette technique

### 5.1 Garde-fou backend perdu

La migration `20260428175825` ajoutait dans `advance_workflow_step` :

- Bloquer `approve` / `complete` / `acknowledge` si l'utilisateur a des sous-assignations `pending` ou `submitted`.

Les refontes de `advance_workflow_step` (juin 2026 : `20260603120000`, `20260603150000`, `20260616200000`, etc.) **ne contiennent plus** cette vérification.

### 5.2 `submit_step4_treatment` ignore les sous-assignations

Un assigné peut soumettre son traitement principal **sans** avoir validé toutes ses sous-assignations. Aucune jointure avec `mail_sub_assignments`.

### 5.3 `dg_advance` contourne tout

Même avec l'ancien garde-fou, `dg_advance` n'était pas concerné. Le DG peut forcer l'avancement sans attendre sous-assignations ni autres assignés (documenté dans `supabase/scripts/e2e_test_scenario.md`, scénario 9).

### 5.4 Pas d'intégration visuelle

Les contributions sous-assignées (`submission_notes`) **n'apparaissent pas** dans :

- `TreatmentsList`
- `MailContributionsPanel`
- `WorkflowTimeline`

Seul le délégant les voit dans `SubAssignmentPanel`.

### 5.5 Visibilité DG — non tranchée

| Option | État actuel |
|--------|-------------|
| DG voit uniquement les traitements des assignés principaux | ✅ via `mail_contributions` |
| DG voit aussi le détail des sous-traitements | ❌ RLS : `directeur` / `dg` exclus de `mail_sub_assignments` |

Policies actuelles (`20260428175825`) — lecture :

- Délégant (`sub_assigned_by = auth.uid()`)
- Sous-assigné (`sub_assigned_to = auth.uid()`)
- Admin / superadmin / dircab

### 5.6 Qui peut déléguer / à qui

| Règle | Implémentation actuelle |
|-------|-------------------------|
| Qui délègue | Tout utilisateur avec `mail_assignments` à l'étape courante (pas de filtre rôle « manager/cadre ») |
| Pool de délégués | `conseiller`, `conseiller_juridique`, `agent` uniquement |
| Filtre `access_mode` | Non appliqué dans `SubAssignmentPanel` (un `viewer` pourrait théoriquement déléguer) |

### 5.7 SLA

- `parent_deadline_at` = copie de `mails.deadline_at` à la création.
- Pas de rappel SLA, pas d'alerte dédiée, pas de prolongation par sous-tâche.

### 5.8 Migration prod

- Fichier : `20260428175825_3c4e7ec3-afe1-4f64-96b5-16cb6a4124ab.sql`
- **Non référencé** dans `supabase/scripts/production_migrations_guide.md`
- Vérifier en prod avant toute finalisation :

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'mail_sub_assignments'
) AS table_exists;

SELECT step_order, name, allow_sub_assignment
FROM workflow_steps
WHERE step_order = 4;
```

---

## 6. Décisions métier à trancher (avant implémentation)

Cocher / valider avec les parties prenantes :

- [ ] **D1 — Qui peut déléguer ?**
  - Option A : tout assigné `contributor` à l'étape 4
  - Option B : rôles spécifiques (cadres, managers, liste configurable)
  - Option C : flag par utilisateur ou par assignation

- [ ] **D2 — À qui peut-on déléguer ?**
  - Option A : agents / conseillers (actuel)
  - Option B : élargir (autres cadres, rôles RBAC)
  - Option C : liste restreinte par service / mission

- [ ] **D3 — Visibilité DG**
  - Option A : DG voit **uniquement** le traitement consolidé de l'assigné principal
  - Option B : DG voit **aussi** le détail de chaque sous-traitement (onglet ou section dédiée)
  - Option C : configurable (`site_settings` ou RBAC)

- [ ] **D4 — `dg_advance` et sous-assignations**
  - Option A : le DG peut toujours forcer (override)
  - Option B : blocage si sous-assignations non validées (même pour le DG)
  - Option C : avertissement + confirmation explicite

- [ ] **D5 — SLA sous-tâches**
  - Option A : même échéance que le courrier (actuel)
  - Option B : sous-échéance calculée (ex. 50 % du SLA restant)
  - Option C : échéance manuelle par délégation

- [ ] **D6 — Notifications**
  - In-app seulement (actuel)
  - + E-mail (via `dispatch-workflow-notifications` ou type dédié)
  - + Rappel SLA

- [ ] **D7 — Intégration des sous-traitements dans le dossier**
  - Option A : section séparée « Sous-traitements » (lecture seule pour DG si D3=B)
  - Option B : agrégation automatique dans le traitement principal à la validation
  - Option C : les deux

---

## 7. Plan de finalisation proposé

### Phase 0 — Prérequis (audit)

1. Confirmer présence table + RLS en prod (requête § 5.8).
2. Appliquer migration `20260428175825` si absente ; l'ajouter au guide prod.
3. Trancher les décisions D1–D7 (§ 6).

### Phase 1 — Enforcement backend (critique)

1. Réintroduire le contrôle sous-assignations dans **`advance_workflow_step`** :
   - Bloquer si sous-assignations `pending` ou `submitted` pour l'utilisateur qui avance.
   - Comportement `dg_advance` selon D4.
2. Ajouter le même contrôle dans **`submit_step4_treatment`** :
   - Refuser la soumission si l'assigné a des sous-assignations non `validated`.
3. Migration SQL dédiée (ex. `20260616900000_sub_assignment_enforcement.sql`).
4. Tests SQL + scénario E2E (§ 8).

### Phase 2 — Visibilité et dossier

1. RLS : policy SELECT pour DG/directeur si D3 = B ou C.
2. Afficher sous-traitements dans le dossier :
   - Panneau dédié ou extension de `MailContributionsPanel` / `TreatmentsList`.
3. Filtrer délégation : `access_mode = 'contributor'` + rôles autorisés (D1, D2).

### Phase 3 — Notifications et SLA

1. E-mail sous-assignation (Edge Function ou extension `dispatch-workflow-notifications`).
2. Rappels SLA si D5 ≠ A.
3. Option admin : toggle `allow_sub_assignment` dans `WorkflowStepManager`.

### Phase 4 — Qualité et doc

1. Scénario E2E complet dans `supabase/scripts/e2e_test_scenario.md`.
2. Entrée dans `production_migrations_guide.md`.
3. Mise à jour `docs/STAGING_ACCESS_TESTS.md` (matrice personas + transitions T9–T12).

---

## 8. Scénario E2E cible (à ajouter)

| # | Acteur | Action | Résultat attendu |
|---|--------|--------|------------------|
| T9 | Assigné A (contributor) | Sous-assigner agent X avec instructions | `mail_sub_assignments` pending ; notif X |
| T10 | Agent X | Soumettre contribution | status `submitted` ; A voit la soumission |
| T11 | Assigné A | Tenter « Soumettre mon traitement » avant validation | **Refus** (si Phase 1 OK) |
| T12 | Assigné A | Valider contribution X, soumettre traitement | OK ; avancement si tous assignés OK |
| T13 | DG | Ouvrir dossier | Selon D3 : voir ou non détail sous-traitements |
| T14 | DG | `dg_advance` avec sous-assignations en cours | Selon D4 |

---

## 9. Références code

| Fichier | Rôle |
|---------|------|
| `src/components/SubAssignmentPanel.tsx` | UI délégation / validation |
| `src/hooks/useSubAssignments.tsx` | CRUD + notifications in-app |
| `src/components/MailDossierView.tsx` | Intégration panneau sous-assignations |
| `src/components/WorkflowActions.tsx` | Soumission traitement principal + `dg_advance` |
| `src/lib/workflow-display.ts` | Visibilité contributions DG vs assignés |
| `supabase/migrations/20260428175825_*.sql` | Table, RLS, flag `allow_sub_assignment`, ancien garde-fou RPC |
| `supabase/migrations/20260603120000_*.sql` | RPC `submit_step4_treatment` (sans sous-assignations) |
| `supabase/migrations/20260616200000_*.sql` | Dernière version `advance_workflow_step` (sans garde-fou sous-assign.) |
| `.lovable/plan.md` | Mention « sous-assignation pilotée par allow_sub_assignment » (refonte WorkflowActions) |

---

## 10. Schéma d'architecture cible (vision)

```
                    ┌─────────────────────────────────────┐
                    │           Courrier (mails)           │
                    │     deadline_at = SLA étape 4        │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
 mail_assignments            mail_sub_assignments          mail_contributions
 (assignés principaux)        (délégation interne)          (traitement officiel)
          │                           │                           │
          │    sub_assigned_by ───────┘                           │
          │    parent_assignment_id ───►                          │
          │                                                       │
          └─────────────────── finalise ─────────────────────────►│
                                                                  │
                    visible DG ◄── selon décision D3 ─────────────┘
                    advance_workflow_step / submit_step4_treatment
                    (garde-fous Phase 1)
```

---

## 11. Notes pour la reprise du travail

- Ne pas confondre **sous-assignation** (délégation interne step 4) et **pré-assignation DG** (étape 2 → assignation step 4) : ce sont des flux différents.
- La refonte dynamique de `WorkflowActions` (`.lovable/plan.md`) prévoit de piloter la sous-assignation via `allow_sub_assignment` — compatible avec ce document.
- Toute finalisation doit inclure une **migration idempotente** et une entrée dans le **guide prod** (lettre suivante après AI).
- En cas de doute sur l'état prod : exécuter `supabase/scripts/production_audit.sql` (table `mail_sub_assignments` listée).

---

*Document créé pour cadrer la finalisation future — ne pas implémenter sans validation des décisions § 6.*
