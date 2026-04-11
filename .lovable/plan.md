

# Plan : Arrière-plan personnalisable (login) + Page Hub "Compte" mobile

## 1. Arrière-plan de la page de connexion (Auth.tsx)

**Objectif** : Le superadmin peut choisir soit une couleur uniforme, soit uploader une image comme arrière-plan de la page de connexion.

### Modifications :
- **`useSiteSettings.tsx`** : Ajouter deux clés : `login_bg_color` (défaut `#FFFFFF`) et `login_bg_image_url` (défaut vide)
- **`SystemConfigPage.tsx`** : Dans la section Branding, ajouter :
  - Un color picker "Couleur de fond (page connexion)"
  - Un champ upload "Image de fond (page connexion)" — taille recommandée 1920x1080, stocké dans le bucket `branding` sous `login-bg.*`
  - Si une image est uploadée, elle prend la priorité sur la couleur
- **`Auth.tsx`** : Remplacer `bg-background` par un style dynamique :
  - Si `login_bg_image_url` existe → `background-image: url(...)` avec `cover` + `center`
  - Sinon si `login_bg_color` défini → `background-color: <couleur>`
  - Sinon → blanc par défaut
  - Ajouter un overlay semi-transparent pour la lisibilité du formulaire si image
- **`ForgotPasswordPage.tsx`** : Appliquer le même arrière-plan pour cohérence
- **Insertion données** : Ajouter les settings `login_bg_color` et `login_bg_image_url` dans `site_settings`

## 2. Page Hub "Compte" mobile (nouvelle page)

**Objectif** : L'onglet "Compte" du bottom nav ne renvoie plus directement vers `/profile` mais vers une page hub `/account` qui liste les fonctionnalités accessibles selon le rôle.

### Nouvelle page `src/pages/AccountPage.tsx` :
- Header avec avatar, nom et rôle de l'utilisateur
- Liste de liens sous forme de cards/lignes cliquables, filtrées par rôle :

| Élément | Route | Rôles autorisés |
|---------|-------|-----------------|
| Tableau de bord | `/` | superadmin, admin, ministre, dircab |
| Statistiques | `/analytics` | tous sauf reception |
| Tableau de suivi | `/suivi` | ministre, dircab, superadmin, admin |
| Profil | `/profile` | tous |
| Enregistrement | `/mail-entry` | reception, admin, superadmin |
| Administration | `/admin` | admin (manage_users), superadmin |
| Workflow | `/workflow` | admin (manage_workflow), superadmin |
| Configuration système | `/system-config` | superadmin |
| Archives | `/archive` | tous sauf reception |

- Section "Préférences" :
  - Toggle mode sombre/clair (réutilise `ThemeToggle`)
  - Lien vers changement de mot de passe (ancre vers `/profile#password` ou directement dans la page)
- Bouton "Se déconnecter" en bas (rouge)

### Routing :
- **`App.tsx`** : Ajouter route `/account` → `AccountPage`
- **`MobileBottomNav.tsx`** : Changer le path du dernier onglet de `/profile` à `/account`

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/pages/AccountPage.tsx` | Nouveau — hub mobile avec menus par rôle |
| `src/pages/Auth.tsx` | Arrière-plan dynamique (image ou couleur) |
| `src/pages/ForgotPasswordPage.tsx` | Même arrière-plan |
| `src/hooks/useSiteSettings.tsx` | Ajouter `login_bg_color`, `login_bg_image_url` |
| `src/pages/SystemConfigPage.tsx` | Color picker + upload image de fond |
| `src/components/MobileBottomNav.tsx` | Pointer vers `/account` |
| `src/App.tsx` | Route `/account` |
| Insertion données | 2 nouveaux settings |

