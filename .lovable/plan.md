

## Plan: Ajouter l'accès aux pièces jointes dans l'Historique et le Tableau de Suivi

### Problème
Les pages **Historique** et **Suivi** affichent les détails des courriers mais ne montrent pas les pièces jointes (`attachment_url`). L'InboxPage a déjà un système complet de prévisualisation (PDF via Google Docs Viewer, images en direct, téléchargement pour les autres types). Il faut répliquer ce pattern.

### Approche

**1. Créer un composant réutilisable `AttachmentViewer`**
- Extraire la logique de prévisualisation qui existe dans `InboxPage.tsx` (lignes 318-366) dans un composant partagé `src/components/AttachmentViewer.tsx`
- Supporte PDF (iframe Google Docs), images (affichage direct), autres fichiers (bouton télécharger)
- Inclut un bouton inline compact pour déclencher l'ouverture du Dialog

**2. Intégrer dans `MailDetailFields.tsx`**
- Ajouter une section "Pièces jointes" dans le composant `MailDetailFields` (utilisé par Historique, Suivi, et Inbox)
- Si `mail.attachment_url` existe, afficher un bloc avec icône Paperclip + bouton "Visualiser" + bouton "Télécharger"
- Cela rend la fonctionnalité disponible automatiquement partout où `MailDetailFields` est utilisé

**3. Ajouter un indicateur dans les tableaux**
- **HistoryPage** : ajouter une colonne "📎" dans le tableau pour indiquer visuellement qu'une pièce jointe existe
- **SuiviPage** : idem, ajouter un indicateur Paperclip dans la ligne du tableau

### Fichiers modifiés
- `src/components/AttachmentViewer.tsx` — nouveau composant
- `src/components/MailDetailFields.tsx` — ajout section pièce jointe
- `src/pages/HistoryPage.tsx` — indicateur 📎 dans le tableau + Dialog viewer dans le détail
- `src/pages/SuiviPage.tsx` — indicateur 📎 dans le tableau + Dialog viewer dans le détail
- `src/pages/InboxPage.tsx` — refactoring pour utiliser le composant partagé (optionnel, pour cohérence)

### Aucune migration SQL nécessaire
Le champ `attachment_url` existe déjà sur la table `mails` et est déjà récupéré dans les requêtes.

