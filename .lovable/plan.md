

# Plan : Historique enrichi, traitement collectif amélioré et clarté visuelle

## Problèmes identifiés

1. **Historique** : Affiche les `mail_assignments` brutes. Si un utilisateur est assigné à l'étape 2 ET l'étape 6 pour le même courrier, il voit 2 lignes distinctes au lieu d'une seule entrée mise à jour. Aucune visibilité sur les traitements des autres intervenants ni sur les pièces jointes du workflow.

2. **Étape 4 — bouton avancement** : Actuellement tous les assignés voient "Entrez votre traitement". L'utilisateur veut que seul le dernier assigné restant voie le bouton qui déclenche l'avancement. Les autres ne voient que "Enregistrer".

3. **TreatmentsList** : Les contributions des conseillers n'ont pas de code couleur unifié par intervenant. Pas de "signature" visuelle claire.

4. **Pièces jointes workflow** : Les fichiers attachés durant les transitions (annotations, documents joints aux étapes 2, 3, 4...) ne sont pas visibles dans l'historique ni le détail.

---

## Approche

### A. Historique groupé par courrier (HistoryPage)

Au lieu d'afficher une ligne par `mail_assignment`, **grouper par `mail_id`** :
- Requêter toutes les `mail_assignments` de l'utilisateur connecté
- Grouper par `mail_id` : une seule ligne par courrier dans le tableau
- Afficher l'étape la plus récente de l'utilisateur et son dernier statut
- Dans le détail : montrer toutes les interventions de l'utilisateur sur ce courrier (multi-étapes)
- Afficher les traitements des autres intervenants via `TreatmentsList`
- Collecter les pièces jointes de toutes les `workflow_transitions` du courrier

### B. Bouton conditionnel à l'étape 4 (WorkflowActions)

Modifier la logique step 4 :
- Requêter le nombre total d'assignés et le nombre de complétés
- Si `(total - complétés) > 1` : afficher uniquement "Enregistrer mon traitement" (sauvegarde sans avancement)
- Si `(total - complétés) == 1` et c'est moi : afficher "Enregistrer & Valider le traitement" (sauvegarde + avancement)
- Même logique pour l'étape 7

### C. TreatmentsList avec couleurs et signatures

- Attribuer une couleur par intervenant (palette de 8 couleurs prédéfinies, rotation par index)
- Chaque bloc de traitement : bordure gauche colorée, nom en gras avec la couleur correspondante
- Ajouter la date/heure de soumission sous le nom
- Afficher les pièces jointes inline avec le composant `AttachmentViewer`

### D. Pièces jointes du workflow dans le détail

- Nouveau composant `WorkflowAttachments` : parse toutes les `workflow_transitions` du courrier pour extraire les URLs `📎 Document joint: ...`
- Afficher dans le détail de l'historique et du suivi, groupé par étape

---

## Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/pages/HistoryPage.tsx` | Groupement par mail_id, détail enrichi avec pièces jointes workflow |
| `src/components/WorkflowActions.tsx` | Bouton conditionnel étape 4/7 : "Enregistrer" vs "Enregistrer & Valider" |
| `src/components/TreatmentsList.tsx` | Couleurs par intervenant, signature, dates, AttachmentViewer |
| `src/components/MailDetailFields.tsx` | Ajout section pièces jointes workflow (extraites des transitions) |

### Aucune migration SQL nécessaire
Toutes les données existent déjà dans `mail_assignments`, `workflow_transitions` et `mails`.

