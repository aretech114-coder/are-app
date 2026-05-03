## Objectif

Régénérer le document "ARE Plateforme — État Cible" en **PowerPoint éditable (.pptx)** au lieu d'un PDF figé, en corrigeant les défauts visuels signalés et en simplifiant la palette.

## Livrable

- **Fichier** : `ARE_Plateforme_Etat_Cible_v3.pptx` (16:9, 10 slides)
- **Format** : PowerPoint natif, totalement éditable (textes, formes, couleurs modifiables dans PowerPoint, Keynote ou Google Slides)
- **PDF d'aperçu** : `ARE_Plateforme_Etat_Cible_v3.pdf` (généré en parallèle pour QA visuelle uniquement)

## Corrections demandées

### 1. Palette simplifiée (3 couleurs maximum)
Suppression du teal / turquoise. Nouvelle palette stricte :

| Rôle | Couleur | Hex |
|------|---------|-----|
| Fond / titres dominants | Bleu foncé (Deep Navy) | `#0B2A4A` |
| Accent principal | Jaune doré | `#F5B800` |
| Accent secondaire / surfaces claires | Bleu ciel propre | `#9CC9E8` |
| Neutres autorisés | Blanc / gris très clair | `#FFFFFF` / `#F4F6F9` |

Le teal `#1C7293` et toutes les variantes turquoise sont **retirés** de l'ensemble du document.

### 2. Slide 3 — Architecture en 4 couches
- Les libellés **L1, L2, L3, L4** passent du jaune au **blanc** (`#FFFFFF`).
- Les bandes de couches conservent un fond bleu foncé dégradé léger (sans turquoise).
- Le jaune est réservé aux puces / icônes d'accent uniquement.

### 3. Correction des superpositions de texte
Audit slide par slide pour repérer les chevauchements observés sur la v2 :
- Slide "Trajectoire" (roadmap) : espacement vertical des jalons et des descriptions.
- Slide "Identité Microsoft 365" : repositionnement du diagramme de flux pour ne pas chevaucher les libellés.
- Slide "Sécurité" : agrandissement des cartes pour éviter le débordement des textes longs.
- Slide finale : titre et sous-titre séparés par un espace suffisant.

Chaque zone de texte sera dimensionnée avec marge de sécurité et `valign: middle` pour éviter les collisions.

## Détails techniques

- **Génération** : `pptxgenjs` (Node.js) — produit un .pptx natif et 100 % éditable.
- **Polices** : Calibri (corps) + Calibri Bold (titres) — universelles et compatibles PowerPoint/Keynote/Google Slides.
- **Format** : 16:9 (33,87 cm × 19,05 cm), cohérent avec une présentation moderne.
- **QA obligatoire** : conversion .pptx → PDF via LibreOffice → images JPEG → inspection visuelle de chaque slide pour vérifier l'absence de superposition avant livraison. Cycle correctif jusqu'à 0 défaut.

## Slides conservées (structure inchangée)

1. Couverture — ARE Plateforme, État Cible
2. Vision stratégique
3. Architecture en 4 couches (L1→L4 en blanc)
4. Périmètre fonctionnel modulaire
5. Identité Microsoft 365 (OIDC / Entra ID)
6. Sécurité & conformité
7. Gouvernance des données
8. Trajectoire en 3 phases
9. Indicateurs cibles
10. Synthèse / appel à l'action

## Hors périmètre

- Aucune modification du code applicatif, de la base de données ou des Edge Functions.
- Aucun changement structurel des slides : seules la palette, la couleur des libellés L1–L4 et les superpositions sont corrigées.
