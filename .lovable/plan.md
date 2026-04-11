

# Revue complète : anomalies et oublis detectes

## Bugs trouvés

### 1. Double balise `<h1>` imbriquée (Auth.tsx + ForgotPasswordPage.tsx)
- **Auth.tsx ligne 48** : `<h1 className="text-2xl font-bold"><h1 className="text-2xl font-bold">{settings.site_title || "ARE App"}</h1></h1>`
- **ForgotPasswordPage.tsx ligne 49** : meme probleme identique
- **Impact** : HTML invalide, accessibilite cassee

### 2. Titre HTML tronqué dans `index.html`
- Ligne 6 : `<title>ARE A</title>` au lieu de `ARE App`
- Les meta OG aussi : `"ARE A"` tronqué

### 3. `manifest.json` theme_color desynchronise
- Valeur statique `#0F172A` alors que le primary est `#0EA5E9`
- Le JS met a jour dynamiquement le meta tag mais pas le manifest

### 4. Import `useState` inutilisé dans `AppLayout.tsx`
- Ligne 1 : `useState` importé mais jamais utilisé (warning TypeScript/lint)

### 5. `InstallGuide` s'affiche dans l'iframe de preview Lovable
- Pas de garde contre `window.self !== window.top` ni les domaines preview
- Risque d'afficher le guide d'installation dans l'editeur

### 6. Default route `/` pour non-reception
- L'utilisateur connecté arrive sur `/` (Dashboard) mais le bottom nav mobile ne highlight rien car aucun onglet ne pointe vers `/`
- **Correction** : rediriger vers `/inbox` par defaut apres login

### 7. `notify_password_reset_request` appele sans authentification
- Sur ForgotPasswordPage, l'utilisateur n'est pas connecté => l'appel RPC utilise l'anon key
- La RPC est SECURITY DEFINER donc elle fonctionne, mais il faudrait verifier que l'anon role a bien le droit EXECUTE sur cette fonction

## Plan de correction

| # | Fichier | Correction |
|---|---------|-----------|
| 1 | `src/pages/Auth.tsx` | Supprimer le `<h1>` imbriqué |
| 2 | `src/pages/ForgotPasswordPage.tsx` | Supprimer le `<h1>` imbriqué |
| 3 | `index.html` | Corriger titre `ARE App` et meta OG |
| 4 | `public/manifest.json` | Aligner `theme_color` sur `#0EA5E9` |
| 5 | `src/components/AppLayout.tsx` | Retirer import `useState` inutilisé |
| 6 | `src/components/InstallGuide.tsx` | Ajouter garde iframe/preview host |
| 7 | `src/App.tsx` | Rediriger `/` vers `/inbox` pour les roles non-reception |
| 8 | Migration SQL | Accorder EXECUTE sur `notify_password_reset_request` au role anon |

Toutes ces corrections sont mineures et peuvent etre faites en une seule passe.

