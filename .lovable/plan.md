

# Audit sécurité complet — Score actuel + État compression

## A. Score sécurité actuel : **87/100** (avant : 82)

### Grille d'évaluation mise à jour

| Catégorie | Points max | Score | Détail |
|-----------|-----------|-------|--------|
| **RLS (Row-Level Security)** | 25 | 23 | 17/17 tables avec RLS. Linter : 0 issue. **-2 pts** : politique UPDATE `user_roles` — un admin pourrait théoriquement modifier ses propres rôles (scan finding PRIVILEGE_ESCALATION) |
| **Edge Functions (auth & validation)** | 20 | 19 | JWT validé partout. Domaine corrigé (are-app.cloud). **-1 pt** : CORS `*` encore présent (à restreindre via Cloudflare en prod) |
| **Storage (buckets)** | 10 | 8 | Politiques DELETE/UPDATE avatars corrigées. **-1 pt** : bucket `avatars` public = avatars lisibles sans auth (scan warning). **-1 pt** : `mail_processing_history` INSERT sans vérification d'assignation au mail |
| **Frontend (XSS, secrets, logs)** | 15 | 15 | Aucun secret exposé, sanitisation IA en place |
| **Architecture & isolation** | 15 | 12 | Multi-tenant en place, `get_user_tenant_id` SECURITY DEFINER. **-3 pts** : RLS ne filtre pas encore par `tenant_id` (filtrage client-side uniquement) |
| **Auth & session** | 10 | 10 | Inscription publique désactivée, impersonation protégée, sessions persistantes |
| **Conformité SAFETY_POLICY** | 5 | 5 | Conforme (D7 continuité ajouté) |
| **TOTAL** | **100** | **87** | +5 pts vs dernier audit |

### 3 findings du scan automatisé

| # | Niveau | Finding | Remédiation |
|---|--------|---------|-------------|
| 1 | **ERROR** | `user_roles` UPDATE : un admin peut potentiellement modifier son propre rôle ou cross-tenant | Ajouter `AND user_id <> auth.uid()` dans le USING + vérifier `tenant_id` dans WITH CHECK |
| 2 | **WARN** | Bucket `avatars` public : avatars lisibles sans authentification | Acceptable pour un SaaS (URLs partagées dans l'UI). À rendre privé si données sensibles. |
| 3 | **WARN** | `mail_processing_history` INSERT : un agent peut insérer un historique pour n'importe quel mail | Ajouter une vérification que `agent_id` est assigné au `mail_id` référencé |

### Gains depuis le dernier audit (82 → 87)
- Politiques storage avatars DELETE/UPDATE corrigées (+2)
- Domaine impersonate-user corrigé (+1)
- SAFETY_POLICY D7 continuité des données (+1)
- user_roles WITH CHECK admin→superadmin bloqué (+1)

### Pour atteindre 92-95/100 (sans Cloudflare)
1. **Fix ERROR** : Empêcher un admin de modifier son propre rôle (`user_id <> auth.uid()`)
2. **Fix WARN** : Ajouter vérification d'assignation sur `mail_processing_history` INSERT
3. **RLS tenant** : Ajouter filtrage `tenant_id` via `get_user_tenant_id()` sur les tables principales (mails, mail_assignments, notifications, workflow_transitions)
4. **CORS prod** : Restreindre `Access-Control-Allow-Origin` (fait via Cloudflare)

---

## B. État de la compression intelligente : ✓ Opérationnelle

### Vérification complète

| Élément | Statut | Détail |
|---------|--------|--------|
| `src/lib/file-compressor.ts` | ✓ OK | 153 lignes, fonctions `compressFile`, `compressImage`, `compressPDF`, `formatFileSize` |
| Seuil minimum | ✓ OK | 500 Ko — fichiers plus petits ignorés |
| Images (JPEG/PNG/WEBP/BMP) | ✓ OK | Canvas API, 1500px max, JPEG qualité 0.70 |
| PDFs | ✓ OK | pdf-lib re-save avec fallback si échec (PDF chiffré) |
| Garde-fou taille | ✓ OK | Si compression augmente la taille → retourne l'original |
| `MailEntry.tsx` | ✓ Intégré | `compressFile()` appelé avant upload, toast info affiché |
| `WorkflowActions.tsx` | ✓ Intégré | `compressFile()` appelé sur les pièces jointes d'annotation |
| Dépendance `pdf-lib` | ✓ OK | Installé dans `package.json` |

La compression est correctement intégrée aux deux points d'upload du système.

---

## C. Plan de remédiation proposé (87 → 93+)

### Corrections à implémenter

1. **Migration SQL** : `user_roles` UPDATE — ajouter `AND user_id <> auth.uid()` pour empêcher l'auto-modification
2. **Migration SQL** : `mail_processing_history` INSERT — ajouter vérification que l'agent est assigné au mail
3. **Migration SQL** : Ajouter filtrage RLS par `tenant_id` sur `mails`, `mail_assignments`, `notifications`, `workflow_transitions` (politiques complémentaires, non destructif)

### Fichiers impactés

| Fichier | Action |
|---------|--------|
| Migration SQL | 3 corrections RLS (user_roles, mail_processing_history, tenant filtering) |

Souhaitez-vous que j'implémente ces 3 corrections pour monter le score à 93+ ?

