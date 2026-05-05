## Objectif

Produire une nouvelle version du PDF `offre_technique_are_hsolutions_20260402064755-2.pdf` en remplaçant uniquement la marque, les coordonnées et le logo, sans toucher au design (mise en page, couleurs, typographie, images de contenu, ordre des 20 pages).

## Livrable

- `offre_technique_are_muksoft_v1.pdf` dans `/mnt/documents/`
- Format identique à l'original (mêmes pages, mêmes dimensions, mêmes couleurs, même typographie)

## Remplacements à appliquer (et **rien d'autre**)

| Élément original | Nouvelle valeur |
|------------------|-----------------|
| `HUBERT SOLUTION SARLU` (en-têtes, pieds, titres) | `MUKSOFT CORPORATION SARLU` |
| `Hubert Solution SARLU` (mentions courantes) | `MUKSOFT CORPORATION SARLU` |
| `Hubert Solution` (formes courtes, ex. « Pourquoi Choisir Hubert Solution ? ») | `MUKSOFT CORPORATION` |
| Email `contact@hubert-solutions.cd` (page 20) | `contact@muksoft.net` |
| Téléphone (page 20) | `+243 81 214 35 17` |
| Adresse (page 20) | `53, av. Kindu, C. Barumbu, Kinshasa, RDC` |
| Logo Hubert Solution (toutes les pages où il apparaît) | Nouveau logo générique « tableau de bord / application » |

Tout le reste du contenu (textes métiers, modules, architecture, planning, etc.) reste **strictement identique**.

## Approche technique

1. **Extraire les pages de l'original** comme fond conservé (pikepdf/pypdf).
2. **Repérer les emplacements** des occurrences de `HUBERT SOLUTION SARLU` et du logo via `pdfplumber` (coordonnées x, y, largeur, hauteur de chaque mot/image).
3. **Masquer chaque occurrence** par un rectangle blanc de la même couleur de fond (en-têtes blancs / pieds blancs ; pour les bandeaux colorés on prélèvera la couleur exacte du fond avant pose du rectangle).
4. **Réimprimer le texte de remplacement** par-dessus avec ReportLab, en conservant :
   - même police (Helvetica/DejaVu équivalente),
   - même taille (mesurée à partir des spans pdfplumber),
   - même couleur (lue dans le PDF original),
   - même alignement.
5. **Logo** : générer un pictogramme SVG simple « tableau de bord » (rectangle arrondi + 4 tuiles + barres) en couleurs neutres compatibles avec la maquette existante, puis le rasteriser et l'insérer aux mêmes coordonnées que l'ancien logo.
6. **Page 20 (contact)** : masquer les 3 lignes de coordonnées et imprimer les nouvelles valeurs aux mêmes positions.
7. **Fusion overlay** via `pypdf` : `page.merge_page(overlay_page)` pour chaque page modifiée.

## QA visuelle obligatoire

- Conversion `pdftoppm -jpeg -r 150` du PDF final.
- Inspection systématique des **20 pages** :
  - aucune trace de l'ancienne marque,
  - aucun rectangle blanc visible sur fond coloré,
  - alignements et tailles préservés,
  - logo présent et lisible aux bons emplacements,
  - coordonnées correctes et complètes en page 20.
- Cycle correctif jusqu'à zéro défaut.

## Hors périmètre

- Aucune modification du code applicatif, de la base de données ou des Edge Functions.
- Aucune retouche de design, de couleurs, d'icônes de contenu ou de structure des slides.
- Pas de génération PowerPoint : livraison **PDF uniquement**.
