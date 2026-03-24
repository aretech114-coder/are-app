

# Plan : Impersonation réelle via Edge Function

## Problème actuel
L'impersonation actuelle est purement cosmétique (client-side state). Elle ne change pas la session Supabase, donc les RLS policies continuent de s'appliquer avec l'identité de l'admin. Résultat : on ne voit pas ce que l'utilisateur voit réellement.

## Solution
Créer une Edge Function `impersonate-user` qui utilise l'API admin Supabase pour générer un lien magique (magic link) pour l'utilisateur cible. L'admin clique sur "Se connecter en tant que", une confirmation s'affiche, puis un nouvel onglet s'ouvre avec une session authentique de l'utilisateur cible.

## Architecture

```text
Admin clique "Se connecter en tant que X"
  → Confirmation dialog
  → Appel Edge Function /impersonate-user { target_user_id }
  → Edge Function vérifie que l'appelant est admin/superadmin
  → Utilise auth.admin.generateLink({ type: 'magiclink', email })
  → Retourne l'URL avec le token
  → Le front ouvre window.open(url) dans un nouvel onglet
  → L'utilisateur est connecté en tant que X dans ce nouvel onglet
  → Bannière "Connecté en tant que X — Revenir à mon compte" visible
```

## Fichiers modifiés

| Fichier | Changement |
|---|---|
| `supabase/functions/impersonate-user/index.ts` | **Nouveau** — Edge Function qui vérifie les permissions de l'appelant puis génère un magic link via `auth.admin.generateLink` |
| `src/pages/AdminPage.tsx` | Remplacer `handleImpersonate` : appel à l'Edge Function + `window.open()` dans un nouvel onglet |
| `src/hooks/useImpersonation.tsx` | Simplifier ou supprimer — l'impersonation est maintenant une vraie session dans un autre onglet |
| `src/components/AppLayout.tsx` | Retirer la bannière d'impersonation client-side (plus nécessaire car nouvel onglet = vraie session) |

## Détails techniques

### Edge Function `impersonate-user`
- Reçoit `{ target_user_id }` en POST
- Vérifie que l'appelant (via JWT) est `superadmin` ou `admin` avec permission `impersonate_users`
- Interdit l'impersonation d'un superadmin par un admin
- Récupère l'email de la cible via `auth.admin.getUserById`
- Génère un magic link via `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })`
- Retourne l'URL du magic link

### Côté front (AdminPage)
- Dialog de confirmation : "Voulez-vous vous connecter en tant que {nom} ?"
- Si confirmé : appel fetch à l'Edge Function
- Ouvre `window.open(magicLinkUrl, '_blank')` — nouvel onglet avec session de l'utilisateur
- L'onglet admin reste inchangé avec sa propre session

### Migration SQL
Aucune migration nécessaire. Les tables et permissions existantes suffisent.

## Sécurité
- Seuls les superadmins et admins autorisés peuvent appeler la fonction
- Un admin ne peut pas impersonner un superadmin
- Le magic link est à usage unique et expire rapidement
- L'onglet admin conserve sa propre session intacte

