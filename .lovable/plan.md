

# Plan : Header mobile natif — logo, tagline & fond continu

## Problèmes identifiés
1. **Double texte** : "ARE" (initiales) + "ARE App" (titre) s'affichent côté mobile — garder uniquement le logo + "ARE App"
2. **Fond bleu incomplet** : le bleu du header ne couvre pas la zone de la barre d'état (heure, batterie, réseau)
3. **Pas de logo par défaut** : quand aucun logo n'est uploadé, on affiche juste du texte
4. **Pas de tagline** : ajouter "Gestion des courriers" sous le titre, configurable via CMS

## Corrections

### 1. `AppLayout.tsx` — Refonte header mobile
- Supprimer l'affichage conditionnel des initiales (`sidebar_initials || "ARE"`)
- Afficher toujours : **logo** (uploadé ou généré par défaut) + **"ARE App"** + **tagline**
- Ajouter `pt-[env(safe-area-inset-top)]` sur le header mobile pour que le fond bleu couvre la zone de la barre d'état
- Tagline : `settings.site_tagline || "Gestion des courriers"` en texte 10px, opacité 80%

### 2. `index.html` — Status bar style
- Changer `apple-mobile-web-app-status-bar-style` de `black-translucent` à `default` pour forcer le fond bleu sous la barre d'état en PWA

### 3. Logo par défaut (SVG inline)
- Générer un petit SVG minimaliste (enveloppe/courrier stylisée) comme logo par défaut quand `sidebar_logo_url` est vide
- 28x28px, blanc sur fond transparent, intégré directement dans le composant

### 4. `useSiteSettings.tsx` — Ajouter `site_tagline`
- Ajouter `site_tagline` à l'interface `SiteSettings` avec default `"Gestion des courriers"`
- Limite : 40 caractères max (environ 3-4 mots)

### 5. `SystemConfigPage.tsx` — Champ tagline dans CMS
- Ajouter un champ texte "Description courte (tagline)" dans la section Identité
- `maxLength={40}` avec compteur de caractères affiché
- Insérer le setting `site_tagline` dans la base si absent

### 6. Migration SQL — Insérer le setting `site_tagline`
- INSERT du nouveau setting via l'outil d'insertion de données

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/AppLayout.tsx` | Refonte header mobile, logo SVG, tagline, safe-area |
| `index.html` | Status bar style |
| `src/hooks/useSiteSettings.tsx` | Ajouter `site_tagline` |
| `src/pages/SystemConfigPage.tsx` | Champ tagline avec limite caractères |
| Insertion données | Setting `site_tagline` |

