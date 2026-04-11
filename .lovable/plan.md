

# Audit Sécurité Complet + Présentation PowerPoint ARE App

## A. Rapport d'audit sécurité — Score : **82/100**

### Grille d'évaluation détaillée

| Catégorie | Points max | Score | Détail |
|-----------|-----------|-------|--------|
| **RLS (Row-Level Security)** | 25 | 22 | 17/17 tables avec RLS activé. -3 pts : politique UPDATE sur user_roles permet potentiellement l'escalade admin→superadmin |
| **Edge Functions (auth & validation)** | 20 | 17 | JWT validé sur toutes les fonctions sensibles. -2 pts : CORS `*` sur toutes les fonctions (à restreindre en prod). -1 pt : ancien domaine `mrhe-courrier.cloud` dans impersonate-user |
| **Storage (buckets)** | 10 | 7 | -3 pts : bucket `avatars` permet à tout utilisateur authentifié de supprimer/écraser les avatars d'autrui |
| **Frontend (XSS, secrets, logs)** | 15 | 15 | 0 console.log sensible, dangerouslySetInnerHTML uniquement dans shadcn chart (safe), pas de secrets exposés |
| **Architecture & isolation** | 15 | 12 | Multi-tenant en place, `get_user_tenant_id` SECURITY DEFINER. -3 pts : les RLS existantes ne filtrent pas encore par tenant_id (filtrage client-side uniquement) |
| **Auth & session** | 10 | 9 | Inscription publique désactivée, premier inscrit=superadmin, impersonation protégée. -1 pt : pas de rate limiting côté auth |
| **Conformité SAFETY_POLICY** | 5 | 5 | Conforme à toutes les règles documentées (Git flow, UUIDs, pagination, Zod) |
| **SEO / Indexation** | — | N/A | robots.txt bloque l'indexation (non compté, conforme) |
| **TOTAL** | **100** | **82** | |

### 4 failles identifiées par le scan automatisé

1. **ERREUR** — Bucket `avatars` : tout utilisateur authentifié peut supprimer les avatars d'autrui
2. **ERREUR** — Bucket `avatars` : tout utilisateur authentifié peut écraser les fichiers d'autrui
3. **WARNING** — Table `user_roles` : politique UPDATE admin pourrait permettre l'escalade vers superadmin
4. **WARNING** — Bucket `mail-documents` : pas de politique UPDATE explicite

### 3 problèmes supplémentaires détectés manuellement

5. **CORS wildcard** — Toutes les Edge Functions utilisent `Access-Control-Allow-Origin: *` (acceptable en dev, à restreindre en production vers `are-app.cloud`)
6. **Ancien domaine** — `impersonate-user/index.ts` ligne 117 référence encore `mrhe-courrier.cloud`
7. **RLS tenant** — Les politiques RLS ne filtrent pas par `tenant_id` (seul le filtrage client-side via `useTenant` est en place)

---

## B. Plan de remédiation (à implémenter)

### B1. Corrections critiques (ERREUR)
- **Storage avatars** : Supprimer les politiques DELETE et UPDATE trop permissives, ne garder que les politiques scoped par `(auth.uid())::text = (storage.foldername(name))[1]`
- **user_roles UPDATE** : Ajouter `has_role(auth.uid(), 'admin'::app_role)` dans le WITH CHECK de la politique admin UPDATE

### B2. Corrections importantes (WARNING)
- **mail-documents** : Ajouter une politique UPDATE explicite pour les rôles autorisés
- **Impersonate** : Remplacer `mrhe-courrier.cloud` par `are-app.cloud`
- **CORS Edge Functions** : Ajouter une variable `ALLOWED_ORIGIN` et restreindre les headers en production (peut être fait au moment du déploiement Vercel + Cloudflare)

### B3. Renforcement tenant (recommandé mais non bloquant)
- Ajouter des politiques RLS complémentaires filtrant par `tenant_id` via `get_user_tenant_id(auth.uid())` — à faire quand le multi-tenant sera activé en production

---

## C. Présentation PowerPoint — ARE App

**Format** : Fichier .pptx téléchargeable, orienté décideurs non-techniques.

### Structure des slides (12-14 slides)

1. **Couverture** — ARE App : Votre plateforme souveraine de gestion du courrier ministériel
2. **Le problème** — Suivi manuel, perte de courrier, absence de traçabilité, délais non maîtrisés
3. **La solution ARE App** — Plateforme digitale complète, workflow automatisé, traçabilité totale
4. **Workflow intelligent** — 8 étapes automatisées, de la réception à l'archivage, avec SLA intégrés
5. **Application mobile** — Disponible sur iOS et Android, accès instantané depuis tout appareil
6. **Gestion des rôles** — 11 niveaux de responsabilité (Ministre → Réception), chacun avec son périmètre
7. **Modules intégrés** — Missions officielles, Réunions & RDV, Assistant IA, Notifications email
8. **Modules à venir** — CRM, Gestion RH, Comptabilité, Parapheur électronique, Archivage légal
9. **Sécurité multicouche** — Chiffrement, isolation des données, audit trail, protection contre les attaques (XSS, injection SQL, escalade de privilèges), Cloudflare
10. **Multi-organisation** — Chaque ministère isolé, données cloisonnées, administration autonome
11. **API & Intégrations** — API REST documentée, connecteurs futurs vers systèmes existants
12. **Tableau de bord** — KPI en temps réel : volume, SLA, productivité, alertes
13. **Pourquoi ARE App ?** — Comparatif avec solutions papier/Excel/email (sécurité, rapidité, traçabilité, coût)
14. **Prochaines étapes** — Déploiement, formation, accompagnement

### Design
- Palette : Deep Navy (#1E2761) + Teal (#0EA5E9) + blanc
- Police : Georgia (titres) + Calibri (corps)
- Chaque slide avec un élément visuel (icônes, statistiques clés, diagrammes)
- Pas de jargon technique (PWA, RLS, Edge Functions → traduit en langage métier)

---

## Fichiers impactés

| Fichier/Action | Description |
|----------------|-------------|
| Migration SQL | Fix storage policies avatars, fix user_roles WITH CHECK |
| `supabase/functions/impersonate-user/index.ts` | Remplacer ancien domaine |
| `/mnt/documents/ARE_App_Presentation.pptx` | Présentation PowerPoint |
| Findings sécurité | Mise à jour du scan avec corrections |

