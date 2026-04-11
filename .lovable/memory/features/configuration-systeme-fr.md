---
name: Configuration système CMS
description: SystemConfigPage gère branding (titre, logo, favicon), couleurs (6 color pickers), polices (heading/body), SEO, auth settings
type: feature
---
La page Configuration Système (`SystemConfigPage.tsx`) permet au SuperAdmin de gérer :

1. **Branding** : titre (ARE App), sous-titre, initiales, favicon, logo sidebar
2. **Couleurs & Typographie** (nouveau) :
   - 6 couleurs : primary, secondary, accent, sidebar_bg, background, link
   - 2 polices : heading, body (sélection parmi Inter, Poppins, Roboto, Nunito, DM Sans, Montserrat, Open Sans, Lato)
   - Injection dynamique via CSS variables dans `useSiteSettings.tsx` (hexToHsl conversion)
   - Stocké dans `site_settings` (setting_type = 'color' ou 'select')
3. **SEO** : toggle indexation
4. **Auth** : toggle mot de passe oublié, se souvenir de moi
5. **Permissions admin** : toggles granulaires
