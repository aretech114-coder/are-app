

# Impact du renommage des rôles + Nouveau PowerPoint

## 1. Analyse d'impact — Renommage des rôles

Le renommage des rôles touche **massivement** le système. Voici le bilan :

| Zone | Fichiers impactés | Exemples |
|------|-------------------|----------|
| **Enum PostgreSQL `app_role`** | 1 (migration SQL) | Ajout des nouvelles valeurs, conservation des anciennes |
| **Policies RLS** | ~50 policies sur 12 tables | Toutes les `has_role(... 'ministre')` etc. |
| **Edge Functions** | 8 fonctions | `sla-checker`, `ai-assistant`, etc. |
| **Frontend (src/)** | 11 fichiers | `workflow-engine.ts`, `AppSidebar.tsx`, `Dashboard.tsx`, `WorkflowActions.tsx`, `AccountPage.tsx`, etc. |
| **Workflow engine** | 2 fichiers clés | `workflow-engine.ts`, `workflow-assignment.ts` |

### Stratégie sûre (non-destructive)

**Ne PAS renommer les rôles existants.** À la place :
1. **Ajouter** les nouveaux rôles à l'enum (`autorité_1`, `autorité_2`, `autorité_3`, `autorité_4`, `directeur`, `chef_departement`, `secretaire_direction`, `collaborateur`)
2. Créer une **table de mapping** ou constante `ROLE_LABELS` pour l'affichage (ex: `autorité_1` → "Autorité 1 (DG/Ministre)")
3. Mettre à jour les **labels d'affichage** sans toucher la logique métier
4. Les anciens rôles restent fonctionnels — migration progressive ultérieure

### Nouvelle hiérarchie proposée

```text
┌─────────────────────────────────────────────┐
│              ADMINISTRATION                 │
│  superadmin ─── admin ─── supervisor        │
├─────────────────────────────────────────────┤
│              HIÉRARCHIE                     │
│                                             │
│  Autorité 1 (DG / Ministre)                │
│      │                                      │
│  Autorité 2 (DGA / DirCab)                 │
│      │                                      │
│  Autorité 3 (Assistant DG / DirCabA)       │
│      │                                      │
│  Autorité 4 (Conseiller Juridique)         │
│      │                                      │
│  ┌───┴──────────────────────────────┐       │
│  │  Direction 1..6                  │       │
│  │   ├── Directeur                  │       │
│  │   ├── Chef de département        │       │
│  │   ├── Secrétaire de direction    │       │
│  │   └── Collaborateur              │       │
│  └──────────────────────────────────┘       │
│                                             │
│  Conseiller (transversal)                   │
├─────────────────────────────────────────────┤
│  Réception ─── Secrétariat                  │
└─────────────────────────────────────────────┘
```

## 2. Plan d'exécution

### Étape A — Diagramme Mermaid de la hiérarchie
Générer un diagramme visuel de la nouvelle structure organisationnelle.

### Étape B — Ajouter les rôles à l'enum (migration SQL)
Ajouter les 5 nouveaux rôles (`autorité_1` à `autorité_4`, `directeur`, `chef_departement`, `secretaire_direction`, `collaborateur`) à l'enum `app_role` **sans supprimer les anciens**. Aucun impact sur le code existant.

### Étape C — Mettre à jour les labels d'affichage
Ajouter les labels français dans les constantes `ROLE_LABELS` de `workflow-engine.ts`, `AccountPage.tsx`, `WorkflowActions.tsx`, `AppSidebar.tsx`.

### Étape D — Générer le PowerPoint mis à jour
Créer un `.pptx` éditable basé sur la présentation existante (`ARE_App_Presentation.pptx`), mis à jour avec :
- La nouvelle hiérarchie de rôles
- Les fonctionnalités ajoutées depuis (sécurité, SLA, audit QR, assistant IA, missions, etc.)
- Design professionnel adapté pour présentation demain

## Ce qui ne sera PAS touché
- La logique du workflow (étapes 1-8) reste identique
- Les RLS policies existantes restent fonctionnelles
- Les Edge Functions ne changent pas
- Les utilisateurs actuels conservent leurs rôles

