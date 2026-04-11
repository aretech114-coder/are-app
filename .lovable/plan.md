

# Plan : Phase 3 — API, Emails & Intégrations + Fix Missions mobile

## A. Fix UI — Page Missions (rapide)

**Problème** : Le bouton "Nouvelle Mission" est coincé à droite du titre/sous-titre sur petits écrans.

**Correction** (`src/pages/MissionsPage.tsx` lignes 84-91) :
- Passer le layout en `flex-col` sur mobile (`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`)
- Le bouton passe en dessous du titre sur mobile, pleine largeur ou aligné à gauche
- Sur desktop, le layout reste côte à côte comme aujourd'hui

---

## B. Phase 3 : API & Intégrations

### B1. Emails — Domaine de production `are-app.cloud`

**Objectif** : Les emails de notification (workflow, SLA, réinitialisation) affichent des liens vers `are-app.cloud` et portent une identité visuelle cohérente.

**Modifications** :
1. **`src/lib/workflow-notifications.ts`** : Ajouter un lien "Voir le courrier" dans le template HTML pointant vers `https://are-app.cloud/inbox?mail=<id>`. Utiliser une constante `APP_DOMAIN` définie dans un fichier `src/lib/constants.ts`.
2. **`src/lib/constants.ts`** (nouveau) : Centraliser `APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || "are-app.cloud"` et `APP_NAME = "ARE App"`. Pour le preview, la variable env `VITE_APP_DOMAIN` peut être définie autrement.
3. **`supabase/functions/send-notification-email/index.ts`** : Ajouter un header de réponse `X-App-Domain` et logger le domaine utilisé. Le template HTML est déjà fourni côté client, donc le domaine est injecté à la source.
4. **Emails d'authentification** : Configurer les templates d'emails auth (confirmation, reset) via le système Lovable Cloud Emails pour utiliser le domaine `are-app.cloud` comme expéditeur si le domaine est vérifié.

### B2. API REST publique — Documentation & Endpoints

**Objectif** : Exposer une API documentée pour les intégrations futures (webhooks, systèmes tiers).

**Implémentation** :
1. **Edge Function `api-public/index.ts`** (nouvelle) : Point d'entrée API REST avec authentification par clé API.
   - `GET /api-public?action=mails` — Liste les courriers (filtrable par status, step, date)
   - `GET /api-public?action=mail&id=<uuid>` — Détail d'un courrier
   - `GET /api-public?action=stats` — KPI résumés (volume, SLA, délai moyen)
   - `GET /api-public?action=users` — Liste des utilisateurs (admin uniquement)
   - Authentification : header `X-API-Key` validé contre une table `api_keys`
2. **Table `api_keys`** (migration SQL) :
   - `id uuid PK`, `key_hash text`, `label text`, `created_by uuid`, `permissions jsonb`, `is_active boolean`, `created_at`, `last_used_at`
   - RLS : lecture/écriture superadmin uniquement
3. **Page admin "Clés API"** dans `SystemConfigPage.tsx` :
   - Section dédiée pour générer, lister, révoquer des clés API
   - Affichage de la clé complète uniquement à la création (ensuite masquée)
   - Copie en un clic de l'URL de base : `https://are-app.cloud/functions/v1/api-public`

### B3. Page Intégrations — Vitrine des modules futurs

**Objectif** : Créer une page `/integrations` visible uniquement par superadmin/admin, listant les modules disponibles et à venir.

**Implémentation** :
1. **`src/pages/IntegrationsPage.tsx`** (nouvelle) :
   - Grille de cards pour chaque module :
     - ✅ **Notifications Email** — Actif (SMTP configuré)
     - ✅ **Assistant IA** — Actif (Gemini Flash)
     - ✅ **Missions Officielles** — Actif
     - ✅ **Réunions & RDV** — Actif
     - 🔒 **CRM** — Bientôt disponible
     - 🔒 **Gestion RH** — Bientôt disponible
     - 🔒 **Comptabilité** — Bientôt disponible
     - 🔒 **Archivage Légal** — Bientôt disponible
     - 🔒 **Webhooks Sortants** — Bientôt disponible
   - Les modules verrouillés affichent un badge "Bientôt" et sont non-cliquables
   - Chaque card montre : icône, nom, description courte, statut (actif/bientôt)
2. **Routing** : Ajouter `/integrations` dans `App.tsx`, protégé superadmin/admin
3. **Navigation** : Ajouter dans `AccountPage.tsx` et `AppSidebar.tsx`

### B4. Préparation Multi-tenant (structure uniquement)

**Objectif** : Poser les bases pour le multi-tenant sans implémentation fonctionnelle.

**Implémentation** :
1. **Table `tenants`** (migration SQL) :
   - `id uuid PK`, `name text`, `domain text UNIQUE`, `is_active boolean DEFAULT true`, `settings jsonb DEFAULT '{}'`, `created_at`
   - Pas de RLS pour l'instant (table de référence interne)
2. **Colonne `tenant_id`** : Ajoutée à la table `mails` (nullable, `DEFAULT NULL`) — ne casse rien, prépare le partitionnement futur
3. **Note dans la page Intégrations** : Card "Multi-tenant" avec statut "En préparation"

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/pages/MissionsPage.tsx` | Fix layout boutons mobile |
| `src/lib/constants.ts` | Nouveau — APP_DOMAIN, APP_NAME |
| `src/lib/workflow-notifications.ts` | Lien cliquable dans les emails |
| `src/pages/IntegrationsPage.tsx` | Nouveau — vitrine modules |
| `src/pages/SystemConfigPage.tsx` | Section "Clés API" |
| `src/App.tsx` | Route `/integrations` |
| `src/pages/AccountPage.tsx` | Lien Intégrations |
| `src/components/AppSidebar.tsx` | Lien Intégrations |
| `supabase/functions/api-public/index.ts` | Nouveau — API REST publique |
| Migration SQL | Tables `api_keys`, `tenants`, colonne `tenant_id` sur `mails` |

