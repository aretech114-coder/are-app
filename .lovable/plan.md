

# Plan : Phase 4 & 5 — Modules métier (illustratifs) + Multi-tenant fonctionnel

## Phase 4 : Modules métier — structure illustrative uniquement

**Objectif** : Enrichir la page Intégrations avec des cards dédiées aux modules métier futurs. Aucune logique fonctionnelle — juste un catalogue visuel.

### Modifications :
- **`src/pages/IntegrationsPage.tsx`** : Réorganiser en deux sections distinctes :
  - **"Modules actifs"** — les 5 modules existants (Email, IA, Missions, Réunions, API)
  - **"Modules métier"** — nouvelles cards illustratives avec statut "Bientôt" :
    - CRM (déjà présent)
    - Gestion RH (déjà présent)
    - Comptabilité (déjà présent)
    - Archivage Légal (déjà présent)
    - Webhooks Sortants (déjà présent)
    - **Nouveaux** : Gestion documentaire, Parapheur électronique, Tableau de bord décisionnel
  - Chaque card : icône, nom, description courte, badge "Bientôt" verrouillé

Pas de nouvelles routes, pas de nouvelles tables. Juste du contenu visuel.

---

## Phase 5 : Multi-tenant fonctionnel

**Objectif** : Rendre le multi-tenant opérationnel — chaque organisation (tenant) a ses données isolées.

### 5.1 Migration SQL
- Ajouter `tenant_id` aux tables qui n'en ont pas encore : `profiles`, `user_roles`, `notifications`, `mail_assignments`, `workflow_transitions`, `missions`, `calendar_events` (toutes nullable, DEFAULT NULL pour compatibilité)
- Créer une fonction `get_user_tenant_id(uuid)` SECURITY DEFINER qui retourne le `tenant_id` du profil
- Ajouter des politiques RLS complémentaires sur `mails` et les autres tables pour filtrer par `tenant_id` quand celui-ci est défini (les politiques existantes restent, on ajoute une couche tenant)

### 5.2 Gestion des tenants — UI Admin
- **`src/pages/SystemConfigPage.tsx`** : Nouvelle section "Organisations" (superadmin uniquement) :
  - Liste des tenants avec nom, domaine, statut actif/inactif
  - Formulaire d'ajout : nom, domaine (optionnel), settings JSON
  - Toggle activer/désactiver
  - Assigner un tenant à un utilisateur (dropdown dans la page Admin)

### 5.3 Propagation du tenant dans le contexte
- **`src/hooks/useAuth.tsx`** : Charger le `tenant_id` du profil connecté et l'exposer dans le contexte
- **`src/hooks/useTenant.tsx`** (nouveau) : Hook utilitaire pour accéder au tenant courant et filtrer les requêtes
- Les requêtes Supabase dans les pages existantes ajoutent `.eq('tenant_id', tenantId)` quand le tenant est défini (filtrage côté client en complément du RLS)

### 5.4 Mise à jour page Intégrations
- Passer le module "Multi-tenant" de "En préparation" à "Actif"

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/pages/IntegrationsPage.tsx` | Réorganisation sections + nouveaux modules illustratifs |
| Migration SQL | `tenant_id` sur 6 tables, fonction `get_user_tenant_id`, RLS tenant |
| `src/pages/SystemConfigPage.tsx` | Section gestion des tenants |
| `src/hooks/useAuth.tsx` | Exposer `tenant_id` |
| `src/hooks/useTenant.tsx` | Nouveau — hook tenant courant |
| `src/pages/AdminPage.tsx` | Dropdown assignation tenant par utilisateur |

