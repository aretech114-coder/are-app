/** User-facing labels — institutional DG terminology (no "Ministre" in UI). */

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrateur",
  supervisor: "Superviseur",
  agent: "Agent",
  ministre: "Directeur général (DG)",
  directeur: "Directeur général (DG)",
  dg: "Directeur général (DG)",
  dircab: "DGA",
  dircaba: "Assistant DGA",
  conseiller_juridique: "Conseiller juridique",
  secretariat: "Secrétariat",
  conseiller: "Conseiller",
  reception: "Réception",
  autorite_1: "Directeur général (DG)",
  autorite_2: "DGA",
  autorite_3: "Assistant DGA",
  autorite_4: "Conseiller juridique",
  chef_departement: "Chef de département",
  secretaire_direction: "Secrétaire de direction",
  collaborateur: "Collaborateur",
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

export const UI_LABELS = {
  dg: "Directeur général",
  dgShort: "DG",
  dgAbsent: "DG absent",
  dgAbsentHint: "Désigner un intérimaire pour assumer le traitement DG",
  dgAnnotation: "Annotation du Directeur général",
  dgValidation: "Validation DG",
  dgInstructions: "Instructions du Directeur général pour le traitement de ce dossier...",
  dgValidationComment: "Observations du Directeur général sur la validation...",
  preAssignmentByDg: "Pré-assignation par le Directeur général",
  assignForTreatment: "Assigner des personnes au traitement",
  returnToDg: "Renvoyer au Directeur général",
  approveToDgValidation: "Approuver → Validation DG",
  validatedByDg: "Note validée par le Directeur général",
  routedToDg: "Routé vers le Directeur général",
  routedInterim: "Routé vers intérimaire (DG absent)",
  treatedBy: "Traité par",
} as const;

/** Static workflow step names fallback (DB workflow_steps overrides in UI). */
export const WORKFLOW_STEP_LABELS: Record<number, { name: string; description: string }> = {
  1: { name: "Réception", description: "Scan, attribution ID, saisie métadonnées" },
  2: { name: "Traitement DG", description: "Orientation et instructions du Directeur général" },
  3: { name: "Filtrage stratégique (DGA)", description: "Validation des instructions et réaffectation par le DGA" },
  4: { name: "Traitement", description: "Rédaction notes techniques ou réponses" },
  5: { name: "Vérification (DGA)", description: "Vérification par le DGA avant validation DG" },
  6: { name: "Validation DG", description: "Validation finale ou rejet par le Directeur général" },
  7: { name: "Consultation Conseillers", description: "Les conseillers consultent la validation de leur note technique" },
  8: { name: "Retour & Preuve de Dépôt", description: "Retour du document avec preuve de dépôt et scan" },
  9: { name: "Archivage Final", description: "Clôture définitive et transfert au dépôt central" },
};

export type MailStorageBucket = "mail-incoming" | "mail-documents";

export type MailAttachmentMeta = {
  name: string;
  path: string;
  url: string;
  bucket?: MailStorageBucket;
};

/** Resolve attachment URLs from mail row (jsonb + legacy single url). */
export function getMailAttachmentUrls(mail: {
  attachment_url?: string | null;
  attachment_urls?: MailAttachmentMeta[] | null;
}): string[] {
  const fromJson = Array.isArray(mail.attachment_urls)
    ? mail.attachment_urls.map((a) => a.url).filter(Boolean)
    : [];
  if (fromJson.length > 0) return fromJson;
  if (mail.attachment_url) return [mail.attachment_url];
  return [];
}
