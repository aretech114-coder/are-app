# ARE Platform — Safety Policy & Governance

> **Version** : 1.0  
> **Date** : 2026-04-11  
> **Statut** : Actif  
> **Domaine production** : `are-app.cloud`

---

## A. Identité du projet

| Clé | Valeur |
|-----|--------|
| **Nom** | ARE Platform |
| **Domaine production** | `are-app.cloud` |
| **Stack frontend** | React 18, TypeScript 5, Tailwind CSS 3, Vite 5, shadcn/ui |
| **Stack backend** | Supabase (PostgreSQL, Auth, Storage, Edge Functions Deno) |
| **Déploiement frontend** | Vercel |
| **Vision** | Plateforme SaaS multi-modules : courrier → RH → CRM → fleet → communication |

---

## B. Posture de l'agent développeur

1. **Développeur senior full-stack** — React, TypeScript, Python/FastAPI, Deno, SQL avancé.
2. **Expert cybersécurité** — Audit systématique de chaque changement avant exécution. Capacité à identifier et prévenir les vecteurs d'attaque (injection SQL, XSS, CSRF, privilege escalation, data leakage).
3. **Garant de la qualité** — Zéro deprecation, code maintenable, architecture scalable.
4. **Responsabilité** — Avant chaque action, consulter ce document. Notifier tout risque identifié au collaborateur humain et attendre approbation explicite avant exécution.

---

## C. Méthodologie Git Flow

```text
Lovable (édition) → develop (branche par défaut)
                        ↓
               Pull Request : develop → main
                        ↓
               Merge → main → Auto-deploy (Vercel + Edge Functions)
```

### Règles strictes

| Règle | Description |
|-------|-------------|
| **R1** | Lovable ne pousse **JAMAIS** directement dans `main` |
| **R2** | Tout commit va dans `develop` |
| **R3** | Le merge vers `main` se fait **uniquement** via Pull Request approuvée |
| **R4** | Edge Functions et migrations SQL suivent le même flux |
| **R5** | Aucun force push sur `main` ou `develop` |

---

## D. Règles de sécurité

### D1. Base de données
- **RLS obligatoire** sur toute table sans exception
- Aucune politique RLS avec condition `true` (trop permissive) sans justification documentée
- Les fonctions `SECURITY DEFINER` doivent avoir `search_path = public` et une validation de rôle interne
- Aucune migration destructive (`DROP TABLE`, `DROP COLUMN`, `DELETE FROM` en masse, `ALTER TYPE` avec perte de données) sans approbation explicite
- Pagination obligatoire (limit ≤ 1000) sur toute requête exposée au client
- Les clés primaires utilisent `gen_random_uuid()` — jamais de clés séquentielles exposées

### D2. Edge Functions
- Validation JWT systématique (header `Authorization`)
- Vérification du rôle du caller via `user_roles` avant toute opération sensible
- Validation des inputs avec schémas stricts (Zod côté client, validation manuelle côté Deno)
- Rate limiting sur les endpoints critiques
- Aucun secret hardcodé — utilisation exclusive de `Deno.env.get()`
- Logging des erreurs sans exposition de données sensibles dans les réponses

### D3. Frontend
- Aucun secret dans le code source (seuls `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` sont autorisés)
- Pas de `dangerouslySetInnerHTML` sans sanitisation via DOMPurify
- Validation Zod sur tous les formulaires avant soumission
- Pas de `console.log` de données sensibles (tokens, emails, mots de passe)
- Protection XSS sur tout contenu généré par l'IA (sanitisation avant rendu)

### D4. CORS & Réseau
- Headers CORS restrictifs en production (domaine `are-app.cloud` uniquement)
- En développement, `Access-Control-Allow-Origin: *` accepté temporairement
- Aucune exposition d'endpoints internes sans authentification

### D5. Gestion des secrets
- Tous les secrets sont stockés via le gestionnaire de secrets Lovable Cloud
- Rotation des secrets recommandée tous les 90 jours
- Liste des secrets requis : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SUPABASE_SERVICE_ROLE_KEY`

### D6. Migrations SQL — Exécution manuelle obligatoire (SQL Editor)

**Règle absolue** : aucune migration SQL n'est exécutée par GitHub Actions, par la CLI Supabase, ni par aucun automatisme. Toutes les migrations sont jouées **manuellement** par le collaborateur via le **SQL Editor** de Supabase, sur Staging puis Production.

> Le workflow `deploy-migrations.yml` a été supprimé. Seul `deploy-functions.yml` (Edge Functions) reste en CI/CD automatique.

#### Procédure obligatoire à chaque migration

1. **Génération du fichier** : Lovable produit un fichier `.sql` téléchargeable dans `/mnt/documents/migrations/`
2. **Nomenclature** : `YYYY-MM-DD_description.sql` (ex : `2026-04-19_add_login_appearance_policy.sql`)
3. **Contenu obligatoire** :
   - SQL complet, idempotent (`IF NOT EXISTS` / `IF EXISTS`), commenté
   - En-tête : description, date, niveau de risque, ordre d'exécution (Staging → Production)
   - Instructions de rollback explicites
4. **Notification explicite** : Lovable doit toujours **annoncer** au collaborateur :
   - Le nom du fichier généré
   - Le résumé fonctionnel de l'impact
   - L'ordre d'exécution (Staging d'abord, puis Production après validation)
5. **Conformité D1/D7** : RLS, idempotence, non-destructivité, valeurs par défaut/nullable
6. **Exécution manuelle** : le collaborateur copie le SQL dans le SQL Editor des deux projets Supabase
7. **Aucune migration n'est considérée comme appliquée** tant que le collaborateur n'a pas confirmé son exécution sur **Staging ET Production**

#### Mode de livraison

- **Par défaut** : à chaque besoin de migration, Lovable génère et notifie immédiatement le fichier `.sql`
- **À la demande** : le collaborateur peut aussi demander explicitement la regénération d'un fichier

### D7. Continuité et intégrité des données

Toute modification de la base de données doit garantir la préservation des données existantes et la continuité des services.

| Règle | Description |
|-------|-------------|
| **CI-1** | Migrations non-destructives : privilégier `ADD COLUMN`, `CREATE INDEX`, jamais `DROP TABLE`, `DROP COLUMN` ou `TRUNCATE` sans approbation explicite |
| **CI-2** | Idempotence obligatoire : utiliser `IF NOT EXISTS` / `IF EXISTS` sur toutes les opérations DDL |
| **CI-3** | Jamais de `DELETE FROM` sans clause `WHERE` en migration |
| **CI-4** | Rollback documenté pour chaque migration critique (instructions de retour arrière) |
| **CI-5** | Tests de non-régression : vérifier que les requêtes existantes fonctionnent après chaque migration |
| **CI-6** | Sauvegarde recommandée avant toute migration structurelle majeure |
| **CI-7** | Les colonnes ajoutées doivent avoir des valeurs par défaut ou être `NULL`-ables pour ne pas casser les insertions existantes |

---

## E. Protocole d'action

### Avant chaque modification

```text
1. Lire SAFETY_POLICY.md
2. Identifier les fichiers impactés
3. Évaluer les risques :
   - Impact sur les données existantes ?
   - Impact sur les sessions actives ?
   - Risque de régression ?
   - Migration destructive ?
4. Si risque identifié → Notifier le collaborateur avec :
   - Description du risque
   - Niveau de gravité (info / warning / critical)
   - Alternative proposée
5. Attendre approbation explicite
6. Exécuter la modification
7. Vérifier le résultat (build, tests, logs)
```

### Niveaux de risque

| Niveau | Description | Action requise |
|--------|-------------|----------------|
| **Info** | Changement cosmétique, refactoring sans impact fonctionnel | Notification, exécution directe |
| **Warning** | Modification de logique métier, ajout de table, changement d'API | Notification, attente d'approbation |
| **Critical** | Migration destructive, changement de schéma auth, modification RLS | Notification détaillée, approbation explicite obligatoire |

---

## F. Checklist pré-PR (develop → main)

- [ ] RLS actives et testées sur toutes les tables concernées
- [ ] Aucune requête sans pagination (limit ≤ 1000)
- [ ] Pas de `console.log` de données sensibles
- [ ] Pas de `dangerouslySetInnerHTML` sans DOMPurify
- [ ] Zéro deprecation warning dans le build
- [ ] Tests fonctionnels validés sur preview Lovable
- [ ] Edge Functions déployées et testées sur staging
- [ ] Aucun secret exposé dans le code source
- [ ] Validation Zod sur tous les nouveaux formulaires
- [ ] Responsive vérifié (mobile + desktop)
- [ ] Performance acceptable (pas de requêtes N+1, pas de re-renders inutiles)

---

## G. Architecture cible (scalabilité)

### Principes

1. **Modularité** — Base de données organisée par domaine fonctionnel (courrier, RH, CRM, fleet)
2. **API-first** — Endpoints REST prêts pour import/export (CSV, XML, JSON)
3. **Workflow dynamique** — Étapes configurables, réordonnables, avec conditions de transition paramétrables par administration
4. **Multi-tenant ready** — Isolation par organisation (futur)
5. **Interopérabilité** — Webhooks entrants/sortants, SDK client documenté

### Roadmap

```text
Phase 0 — Fondations (actuel)
├── Safety Policy ✓
├── Mise à jour domaine are-app.cloud
├── Audit sécurité existant
└── PWA setup (manifest, meta tags, icônes)

Phase 1 — Workflow dynamique
├── Étapes configurables depuis l'interface admin
├── Ordonnancement drag & drop
├── Rôles par étape configurables
└── Conditions de transition paramétrables

Phase 2 — Mobile-First & PWA
├── Bottom navigation mobile
├── Inbox modal mobile
├── Formulaire wizard multi-étapes
└── Tables → cards responsives

Phase 3 — API & Intégrations
├── Endpoints REST pour import/export
├── Support CSV, XML, JSON
├── Webhooks entrants/sortants
└── SDK client documenté

Phase 4 — Modules métier
├── Module RH
├── Module CRM / Communication
├── Module Fleet (charroi automobile)
└── Module Product Management

Phase 5 — Multi-tenant SaaS
├── Isolation par organisation
├── Facturation / abonnements
├── Onboarding self-service
└── Tableau de bord opérateur
```

---

## H. Règles de qualité du code

1. **Zéro deprecation** — Aucune dépendance ou API dépréciée tolérée
2. **TypeScript strict** — Pas de `any` sauf cas documenté et justifié
3. **Composants focalisés** — Un composant = une responsabilité
4. **Design tokens** — Utilisation exclusive des tokens sémantiques Tailwind (pas de couleurs hardcodées)
5. **Accessibilité** — Labels ARIA, contraste suffisant, navigation clavier
6. **Performance** — Lazy loading, pagination, memoization quand nécessaire
7. **Documentation** — Commentaires sur la logique complexe, pas sur l'évident

---

*Ce document est la référence absolue pour toute action sur le projet ARE Platform. Il doit être consulté avant chaque modification et mis à jour lorsque les règles évoluent.*
