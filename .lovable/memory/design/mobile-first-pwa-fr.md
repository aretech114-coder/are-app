---
name: Mobile-First PWA Bottom Navigation
description: Bottom nav 5 onglets mobile, sidebar masquée, inbox liste/détail responsive, safe-area iOS
type: design
---

## Mobile Bottom Navigation
- Composant `MobileBottomNav.tsx` : 5 onglets fixes en bas (Réception, Réunions, Historique, Missions, Compte)
- Visible uniquement `md:hidden`, icônes Lucide + label 10px
- Active state : `text-primary` + `font-semibold` + `stroke-[2.5]`
- Support `env(safe-area-inset-bottom)` pour appareils avec notch

## Layout Mobile
- `AppLayout.tsx` : sidebar masquée via `hidden md:flex`, bottom nav intégré
- Header simplifié sur mobile (pas de dropdown avatar, remplacé par onglet Compte)
- Padding contenu : `p-3` mobile, `p-6` desktop, `pb-20` mobile pour ne pas chevaucher le footer

## Inbox Mobile
- Vue liste plein écran avec cards compactes
- Au clic : vue détail plein écran avec bouton retour (ArrowLeft)
- Dialogs IA et documents extraits en `renderAiDialog()` / `renderDocDialog()` réutilisables

## CSS
- `viewport-fit=cover` dans index.html
- Utilitaire `.pb-safe` dans index.css
