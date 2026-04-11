

# Plan : Compression intelligente des documents avant stockage

## Contexte & calcul

Avec 100 courriers/jour, chaque scan PDF à 150 DPI pesant ~500 Ko à 2 Mo :
- **Pire cas** : 100 × 2 Mo = 200 Mo/jour → **~6 Go/mois** → **72 Go/an**
- Avec compression (réduction 60-70%) : **~25 Go/an** — marge confortable sur 100 Go

## Approche technique

**Compression côté navigateur (client-side)** avant l'upload vers le stockage. Aucun serveur supplémentaire nécessaire.

### Logique en 2 étapes :

1. **Images (JPEG/PNG)** — Utiliser le Canvas HTML5 :
   - Redimensionner à max 1500px de large (suffisant pour lisibilité A4)
   - Ré-encoder en JPEG qualité 0.65-0.75 (réduction ~60-70%)
   - Un scan de 2 Mo → ~600 Ko

2. **PDFs** — Utiliser la bibliothèque `pdf-lib` (déjà compatible browser) :
   - Extraire les images intégrées, les recompresser via Canvas
   - Ré-assembler le PDF avec les images optimisées
   - Alternative plus simple : si le PDF est un scan mono-page, convertir en JPEG compressé puis ré-encapsuler en PDF

### Intégration dans le code existant

- **Nouveau utilitaire** : `src/lib/file-compressor.ts` — fonctions `compressImage()` et `compressPDF()`
- **Modification** : `src/pages/MailEntry.tsx` — appeler `compressFile()` dans `handleSubmit` avant `supabase.storage.upload()`
- **Modification** : `src/components/WorkflowActions.tsx` — même compression pour les pièces jointes ajoutées en cours de workflow
- **Indicateur UX** : afficher la taille originale vs compressée (ex: "2.1 Mo → 680 Ko") dans un toast de confirmation

### Paramètres configurables

| Paramètre | Valeur par défaut | Description |
|-----------|------------------|-------------|
| Qualité JPEG | 0.70 | Balance lisibilité/poids |
| Largeur max | 1500px | Résolution suffisante pour A4 |
| Taille max avant compression | 500 Ko | En dessous, pas de compression |
| Format de sortie image | JPEG | Plus léger que PNG pour les scans |

### Limites et garde-fous

- Les fichiers < 500 Ko ne sont pas recompressés (déjà optimaux)
- Les fichiers non-image/non-PDF (Word, Excel) restent inchangés
- La qualité 0.70 en JPEG maintient une lisibilité excellente pour du texte scanné
- Aucune perte sur les documents texte natifs (non scannés)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/lib/file-compressor.ts` | Nouveau — utilitaires compression |
| `src/pages/MailEntry.tsx` | Compression avant upload |
| `src/components/WorkflowActions.tsx` | Compression avant upload annotations |
| `package.json` | Ajout `pdf-lib` |

