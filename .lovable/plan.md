

# Phase 2 — Mobile-First, Bottom Navigation & Responsivité PWA

## Objectif
Transformer l'expérience mobile en une interface type application native : barre de navigation fixe en bas (footer), sidebar masquée sur mobile, contenu adaptatif style boîte email.

## Architecture

```text
Desktop (≥768px)                    Mobile (<768px)
┌──────┬────────────────┐           ┌────────────────────┐
│      │                │           │  Header (titre)    │
│ Side │   Content      │           ├────────────────────┤
│ bar  │                │           │                    │
│      │                │           │   Content          │
│      │                │           │   (full width)     │
│      │                │           │                    │
└──────┴────────────────┘           ├────────────────────┤
                                    │ 📥  📋  🕐  ✈️  👤 │
                                    │ Inbox Réu. Hist Mis Cpt│
                                    └────────────────────┘
```

**5 onglets du footer mobile (gauche → droite) :**
1. **Boîte de réception** (`/inbox`) — Inbox
2. **Réunions** (`/reunions`) — CalendarDays
3. **Historique** (`/history`) — History
4. **Missions** (`/missions`) — Plane
5. **Compte** (`/profile`) — User

## Plan d'implémentation

### 1. Créer `MobileBottomNav.tsx`
- Composant avec 5 boutons fixes en `fixed bottom-0`, `h-16`, `z-50`, `bg-card border-t`
- Utilise `useLocation` pour highlight actif (primary color + label bold)
- Icônes Lucide + label sous chaque icône (texte 10px)
- Visible uniquement sur mobile (`md:hidden`)
- Espace de sécurité iOS (`pb-safe` / `env(safe-area-inset-bottom)`)

### 2. Modifier `AppLayout.tsx`
- Importer `useIsMobile` et `MobileBottomNav`
- Sur mobile : masquer la sidebar, masquer le header dropdown avatar (remplacé par l'onglet Compte)
- Ajouter `pb-20` au contenu sur mobile pour ne pas être caché par le footer
- Le `SidebarTrigger` reste accessible via un menu hamburger simplifié en mobile si nécessaire pour accéder aux pages admin

### 3. Modifier `AppSidebar.tsx`
- Ajouter classe `hidden md:flex` pour masquer complètement la sidebar sur mobile
- La sidebar reste identique sur desktop

### 4. Responsivité Inbox (style email mobile)
- Sur mobile : la liste de courriers prend toute la largeur, cards compactes
- Au clic sur un courrier : navigation vers un écran de détail plein écran avec bouton retour
- Utiliser un state conditionnel ou un sous-routage visuel (pas de split panel sur mobile)
- Padding réduit (`p-3` au lieu de `p-6`) sur mobile

### 5. Ajustements globaux CSS
- Ajouter `safe-area-inset` dans `index.css` pour les appareils avec notch
- `viewport-fit=cover` dans le meta viewport de `index.html`
- Réduire les paddings/margins sur mobile pour toutes les pages

### 6. Mémoire projet
- Mettre à jour `mem://design/mobile-first-pwa-fr` avec les détails du bottom nav

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/MobileBottomNav.tsx` | Nouveau — barre de navigation footer |
| `src/components/AppLayout.tsx` | Modifier — intégrer bottom nav, masquer sidebar mobile |
| `src/components/AppSidebar.tsx` | Modifier — `hidden md:flex` |
| `src/pages/InboxPage.tsx` | Modifier — vue liste/détail conditionnelle mobile |
| `src/index.css` | Modifier — safe-area, paddings mobiles |
| `index.html` | Modifier — `viewport-fit=cover` |
| `mem://design/mobile-first-pwa-fr` | Mettre à jour |

## Notes techniques
- Pas de nouvelle dépendance nécessaire
- `useIsMobile()` existe déjà dans le projet
- Le bottom nav n'affiche que les 5 routes universelles — les pages admin/workflow restent accessibles via un menu hamburger ou la sidebar desktop

