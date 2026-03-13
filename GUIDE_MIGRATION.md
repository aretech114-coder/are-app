# 🚀 Guide de Migration — CourierPro

## Architecture Cible

| Composant | Lovable Cloud | Production |
|-----------|--------------|------------|
| Frontend | Lovable Preview | **Vercel** |
| Backend/DB | Lovable Cloud (Supabase) | **Supabase** (Cloud ou Self-hosted) |
| Edge Functions | Auto-déployées | **Supabase CLI** (`supabase functions deploy`) |
| Stockage | Buckets Supabase | Identique |

---

## 1. Prérequis

- [Node.js](https://nodejs.org/) v18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) installé (`npm i -g supabase`)
- Compte [Vercel](https://vercel.com)
- Compte [Supabase](https://supabase.com) (ou instance self-hosted)
- Compte GitHub (pour lier Vercel au dépôt)

---

## 2. Créer le projet Supabase

### 2.1 Créer le projet

1. Aller sur [app.supabase.com](https://app.supabase.com)
2. Créer un nouveau projet, choisir la région la plus proche de vos utilisateurs
3. Noter les informations suivantes depuis **Settings → API** :
   - `SUPABASE_URL` (ex: `https://xxxxx.supabase.co`)
   - `SUPABASE_ANON_KEY` (clé publique/anon)
   - `SUPABASE_SERVICE_ROLE_KEY` (clé privée — ne jamais exposer côté client)

### 2.2 Appliquer le schéma de base de données

Lier le CLI Supabase à votre projet :

```bash
supabase login
supabase link --project-ref <votre-project-ref>
```

Appliquer toutes les migrations :

```bash
supabase db push
```

Cela crée automatiquement :
- Toutes les tables (mails, profiles, user_roles, calendar_events, missions, etc.)
- Les enums (app_role, mail_priority, mail_status, etc.)
- Les fonctions PostgreSQL (has_role, get_my_role, handle_new_user, add_app_role, etc.)
- Les triggers (handle_new_user sur auth.users)
- Toutes les politiques RLS

### 2.3 Créer les buckets de stockage

Dans le dashboard Supabase → **Storage** :

| Bucket | Public | Usage |
|--------|--------|-------|
| `avatars` | ✅ Oui | Photos de profil |
| `branding` | ✅ Oui | Logo et favicon |
| `mail-documents` | ❌ Non | Pièces jointes des courriers |

### 2.4 Configurer l'authentification

- **Settings → Auth → Email** :
  - Désactiver "Enable email confirmations" si vous voulez la confirmation automatique par l'admin
  - Ou garder activé pour vérification par email
- **Settings → Auth → URL Configuration** :
  - Site URL : `https://votre-domaine.com`
  - Redirect URLs : ajouter `https://votre-domaine.com/reset-password`

---

## 3. Déployer les Edge Functions

### 3.1 Liste des fonctions

| Fonction | Rôle | Secrets requis |
|----------|------|----------------|
| `create-user` | Création d'utilisateurs par le SuperAdmin | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `update-user` | Modification d'utilisateurs | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `manage-roles` | Gestion dynamique des rôles | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| `sla-checker` | Vérification des SLA/délais | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| `ai-assistant` | Assistant IA (résumé, brouillon) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` + voir §3.3 |

### 3.2 Déployer

```bash
supabase functions deploy create-user --no-verify-jwt
supabase functions deploy update-user --no-verify-jwt
supabase functions deploy manage-roles --no-verify-jwt
supabase functions deploy sla-checker --no-verify-jwt
supabase functions deploy ai-assistant --no-verify-jwt
```

> `--no-verify-jwt` car l'authentification est gérée dans le code des fonctions elles-mêmes.

### 3.3 ⚠️ Migration de l'Assistant IA (IMPORTANT)

L'assistant IA utilise actuellement l'API Lovable AI (`LOVABLE_API_KEY` + `https://ai.gateway.lovable.dev`), qui **ne sera pas disponible** en dehors de Lovable.

**Vous devez remplacer par un fournisseur IA compatible OpenAI** :

**Option A — OpenAI directement :**
```bash
supabase secrets set OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

Puis modifier `supabase/functions/ai-assistant/index.ts` :
- Remplacer `LOVABLE_API_KEY` par `OPENAI_API_KEY`
- Remplacer l'URL `https://ai.gateway.lovable.dev/v1/chat/completions` par `https://api.openai.com/v1/chat/completions`
- Remplacer le modèle par `gpt-4o` ou `gpt-4o-mini`

**Option B — Google Gemini (via OpenAI-compatible endpoint) :**
```bash
supabase secrets set GEMINI_API_KEY=AIzaXXXXXXXXX
```
- URL : `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- Modèle : `gemini-2.5-flash`

**Option C — Désactiver l'IA :** Supprimer les appels à `ai-assistant` dans le code frontend si non nécessaire.

### 3.4 Configurer les secrets Supabase

```bash
supabase secrets set SUPABASE_URL=https://xxxxx.supabase.co
supabase secrets set SUPABASE_ANON_KEY=eyJhbGci...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Si Option A (OpenAI) :
supabase secrets set OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

> Note : `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont automatiquement disponibles dans les Edge Functions Supabase Cloud. Vous n'avez besoin de les set manuellement que pour du self-hosted.

---

## 4. Préparer le Frontend pour Vercel

### 4.1 Nettoyer les dépendances Lovable

Supprimer le package spécifique à Lovable :

```bash
npm uninstall lovable-tagger
```

### 4.2 Modifier `vite.config.ts`

Retirer le plugin `lovable-tagger` :

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 4.3 Variables d'environnement Vercel

Dans Vercel → **Settings → Environment Variables**, ajouter :

| Variable | Valeur |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Votre clé `anon` Supabase |

> ⚠️ Ne jamais mettre la `SERVICE_ROLE_KEY` dans les variables Vercel — elle est uniquement pour les Edge Functions.

### 4.4 Fichier `.env` local (développement)

Créer un `.env` à la racine :

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...
```

### 4.5 Supprimer le fichier `.env` actuel

Le `.env` actuel contient les identifiants Lovable Cloud — le supprimer et le recréer avec vos propres valeurs.

---

## 5. Déployer sur Vercel

### 5.1 Connecter le dépôt

1. Pousser le code sur GitHub
2. Aller sur [vercel.com/new](https://vercel.com/new)
3. Importer le dépôt GitHub
4. Configuration :
   - **Framework Preset** : Vite
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`
   - **Install Command** : `npm install`
5. Ajouter les variables d'environnement (§4.3)
6. Déployer

### 5.2 Configurer les redirections SPA

Créer un fichier `vercel.json` à la racine :

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

Cela garantit que React Router fonctionne correctement (pas de 404 sur les routes directes).

---

## 6. Configuration Post-Déploiement

### 6.1 Mettre à jour les URLs Supabase

Dans le dashboard Supabase → **Auth → URL Configuration** :
- **Site URL** : `https://votre-domaine-vercel.vercel.app` (ou votre domaine custom)
- **Redirect URLs** : ajouter votre domaine + `/reset-password`

### 6.2 Mettre à jour les CORS des Edge Functions

Les headers CORS dans les Edge Functions utilisent `Access-Control-Allow-Origin: *`.
Pour plus de sécurité en production, restreindre à votre domaine :

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://votre-domaine.com",
  // ...
};
```

### 6.3 Créer le premier SuperAdmin

1. S'inscrire via la page `/auth` (le premier utilisateur obtient automatiquement le rôle `superadmin` grâce au trigger `handle_new_user`)
2. Ensuite désactiver l'inscription publique dans **Supabase → Auth → Settings**

### 6.4 Configurer le SLA Checker (optionnel)

Pour les vérifications automatiques de SLA, configurer un cron job qui appelle la fonction :

```bash
# Avec Supabase Cron (pg_cron) ou un service externe
curl -X POST https://xxxxx.supabase.co/functions/v1/sla-checker \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"
```

---

## 7. Checklist de Migration

- [ ] Projet Supabase créé
- [ ] Migrations appliquées (`supabase db push`)
- [ ] Buckets de stockage créés (avatars, branding, mail-documents)
- [ ] Edge Functions déployées (5 fonctions)
- [ ] Secrets configurés dans Supabase
- [ ] **Assistant IA migré** vers OpenAI/Gemini (ou désactivé)
- [ ] `lovable-tagger` supprimé
- [ ] `vite.config.ts` nettoyé
- [ ] `vercel.json` créé pour les redirections SPA
- [ ] Variables d'environnement configurées dans Vercel
- [ ] URLs de redirection configurées dans Supabase Auth
- [ ] Premier utilisateur créé (SuperAdmin auto)
- [ ] Inscription publique désactivée
- [ ] Test complet de bout en bout

---

## 8. Résumé des fichiers à modifier

| Fichier | Action |
|---------|--------|
| `vite.config.ts` | Retirer `lovable-tagger` |
| `.env` | Remplacer par vos identifiants Supabase |
| `vercel.json` | **Créer** — redirections SPA |
| `supabase/functions/ai-assistant/index.ts` | Migrer vers OpenAI/Gemini |
| `package.json` | Retirer `lovable-tagger` des devDependencies |

> Tous les autres fichiers (composants, pages, hooks, Edge Functions) fonctionnent **sans modification** avec un projet Supabase standard.
