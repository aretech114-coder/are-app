

# Plan : PWA Native Experience, Logo Admin, Sécurité Mot de Passe & Guide Installation

## Objectif
Rendre l'application PWA indistinguable d'une app native sur mobile : header coloré avec primary color, barre d'état fusionnée, guide d'installation, gestion du logo PWA par l'admin, changement de mot de passe sécurisé avec ancien mot de passe, et bouton de déconnexion sur la page Compte.

## Travail en 6 blocs

### 1. Header mobile natif avec primary color
- **`AppLayout.tsx`** : sur mobile, le header utilise `bg-primary text-primary-foreground` au lieu de `bg-card`. Le titre du site est tiré de `useSiteSettings()`.
- **`index.html`** : ajouter `<meta name="theme-color" content="#0EA5E9">` pour colorer la barre d'état du navigateur/PWA.
- **`useSiteSettings.tsx`** : dans l'effet `useEffect`, mettre à jour dynamiquement le `meta[name="theme-color"]` avec la valeur `primary_color` du CMS. Cela garantit que la barre d'état iOS/Android prend la couleur définie par l'admin.
- **`manifest.json`** : le `theme_color` sera aussi mis à jour dynamiquement via JS.

### 2. Logo PWA administrable
- **`SystemConfigPage.tsx`** : ajouter un champ d'upload pour "Icône PWA" (stocké dans le bucket `branding` sous `pwa-icon.png`). L'admin uploade une image carrée 512x512 qui sert d'icône pour le PWA.
- **`site_settings`** : ajouter une clé `pwa_icon_url` (via insert data, pas migration).
- **`useSiteSettings.tsx`** : mettre à jour `manifest.json` dynamiquement via un `<link rel="manifest">` et/ou `<link rel="apple-touch-icon">` pointant vers l'icône uploadée.

### 3. Guide d'installation PWA
- **Créer `src/components/InstallGuide.tsx`** : composant modal/dialog avec :
  - Détection iOS (Safari) : instructions "Partager → Ajouter à l'écran d'accueil" avec captures illustratives textuelles
  - Détection Android/Chrome : bouton "Installer l'application" utilisant l'API `beforeinstallprompt`
  - Affichage automatique si l'app n'est pas en mode standalone et que l'utilisateur ne l'a pas déjà fermé (localStorage flag)
- **Intégrer dans `AppLayout.tsx`** : afficher le guide une seule fois après la première connexion sur mobile

### 4. Changement de mot de passe sécurisé (ancien mot de passe requis)
- **`ProfilePage.tsx`** : ajouter un champ "Mot de passe actuel" avant les champs nouveau/confirmation
- Avant d'appeler `updateUser`, vérifier l'ancien mot de passe via `supabase.auth.signInWithPassword({ email, password: currentPassword })` — si échec, bloquer le changement
- Afficher les messages d'erreur appropriés

### 5. Bouton de déconnexion sur la page Compte (mobile)
- **`ProfilePage.tsx`** : ajouter en bas de page une section avec un bouton rouge "Se déconnecter" qui appelle `signOut()` de `useAuth()`
- Visible sur toutes les tailles d'écran mais particulièrement important sur mobile (le dropdown avatar n'est pas accessible)

### 6. Notification admin pour demandes de mot de passe oublié
- **`ForgotPasswordPage.tsx`** : après l'envoi du lien de réinitialisation, insérer une notification dans la table `notifications` pour tous les admin/superadmin avec le titre "Demande de réinitialisation" et l'email de l'utilisateur
- Utiliser une requête côté client pour récupérer les user_ids des admins via `user_roles` puis insérer les notifications (la RLS permet l'insertion par les rôles autorisés)
- **Alternative plus robuste** : créer une RPC `notify_password_reset_request(email)` SECURITY DEFINER qui insère les notifications pour tous les admins sans exposer la liste des admins au client non authentifié

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/AppLayout.tsx` | Header primary color sur mobile |
| `index.html` | Meta theme-color |
| `src/hooks/useSiteSettings.tsx` | Sync theme-color + apple-touch-icon dynamiques |
| `src/pages/SystemConfigPage.tsx` | Upload icône PWA |
| `src/components/InstallGuide.tsx` | Nouveau — guide installation iOS/Android |
| `src/pages/ProfilePage.tsx` | Ancien mot de passe + bouton déconnexion |
| `public/manifest.json` | Mise à jour |
| Migration SQL | RPC `notify_password_reset_request` |
| `src/pages/ForgotPasswordPage.tsx` | Appel RPC notification admin |
| `mem://design/mobile-first-pwa-fr` | Mise à jour |

## Notes
- Pas de `vite-plugin-pwa` : on reste sur un manifest statique + enregistrement manuel du service worker en production uniquement (conformément aux règles projet).
- Le `meta theme-color` est la clé pour que la barre d'état iOS/Android prenne la couleur primary — c'est ce qui donne l'effet "natif".
- La vérification de l'ancien mot de passe via `signInWithPassword` est la seule méthode disponible avec Supabase Auth (pas de endpoint dédié "verify password").

