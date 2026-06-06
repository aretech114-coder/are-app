import { APP_URL } from "@/lib/constants";
import { WORKFLOW_STEP_LABELS } from "@/lib/labels";

export const NOTIFICATION_SHORTCODES = [
  { key: "{{recipient_name}}", label: "Nom du destinataire" },
  { key: "{{recipient_email}}", label: "E-mail du destinataire" },
  { key: "{{step_name}}", label: "Nom de l'étape" },
  { key: "{{step_number}}", label: "Numéro d'étape" },
  { key: "{{mail_subject}}", label: "Objet du courrier" },
  { key: "{{reference_number}}", label: "Référence courrier" },
  { key: "{{access_mode_label}}", label: "Mode (traitement / lecture seule)" },
  { key: "{{assignees_list}}", label: "Liste des assignés" },
  { key: "{{assignees_count}}", label: "Nombre d'assignés" },
  { key: "{{inbox_url}}", label: "Lien vers le courrier" },
] as const;

export interface NotificationTemplateVars {
  recipientName: string;
  recipientEmail: string;
  stepName: string;
  stepNumber: number;
  mailSubject: string;
  referenceNumber?: string;
  accessMode: "contributor" | "viewer" | "default";
  assigneesList: string;
  assigneesCount: number;
  mailId: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function accessModeLabel(mode: NotificationTemplateVars["accessMode"]): string {
  if (mode === "viewer") return "Lecture seule (copie)";
  if (mode === "contributor") return "Traitement assigné";
  return "Responsable par défaut";
}

export function buildTemplateVarMap(vars: NotificationTemplateVars): Record<string, string> {
  const inboxUrl = `${APP_URL}/inbox?mail=${vars.mailId}`;
  return {
    recipient_name: escapeHtml(vars.recipientName),
    recipient_email: escapeHtml(vars.recipientEmail),
    step_name: escapeHtml(vars.stepName),
    step_number: String(vars.stepNumber),
    mail_subject: escapeHtml(vars.mailSubject),
    reference_number: escapeHtml(vars.referenceNumber || ""),
    access_mode: vars.accessMode,
    access_mode_label: escapeHtml(accessModeLabel(vars.accessMode)),
    assignees_list: escapeHtml(vars.assigneesList),
    assignees_count: String(vars.assigneesCount),
    inbox_url: inboxUrl,
  };
}

export function applyNotificationTemplate(
  template: string | null | undefined,
  vars: NotificationTemplateVars
): string | null {
  if (!template?.trim()) return null;

  const map = buildTemplateVarMap(vars);
  let result = template;
  for (const [key, value] of Object.entries(map)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export function formatNotificationSubject(
  template: string | null,
  vars: Pick<NotificationTemplateVars, "stepName" | "stepNumber" | "mailSubject" | "referenceNumber">,
  fallback: string
): string {
  if (!template?.trim()) return fallback;
  const map = buildTemplateVarMap({
    ...vars,
    recipientName: "",
    recipientEmail: "",
    accessMode: "default",
    assigneesList: "",
    assigneesCount: 0,
    mailId: "",
  });
  let result = template;
  for (const [key, value] of Object.entries(map)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

const STEP_DEFAULT_SUBJECTS: Record<number, string> = {
  2: "📬 Courrier à orienter — {{step_name}}",
  4: "📬 Courrier à traiter — {{step_name}}",
  6: "✅ Validation requise — {{step_name}}",
  8: "📎 Retour et preuve de dépôt — {{step_name}}",
  9: "🗄️ Archivage final — {{step_name}}",
};

const STEP_DEFAULT_BODIES: Record<number, string> = {
  2: `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Un nouveau courrier est disponible à l'étape <strong>{{step_name}}</strong> et requiert votre orientation.</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p>Personnes concernées par ce dossier : {{assignees_list}} ({{assignees_count}}).</p>
<p><a href="{{inbox_url}}">Ouvrir le courrier</a></p>`,

  4: `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Un courrier vous est assigné pour <strong>{{access_mode_label}}</strong> à l'étape <strong>{{step_name}}</strong>.</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p>Co-assignés sur ce dossier : {{assignees_list}}.</p>
<p><a href="{{inbox_url}}">Accéder au traitement</a></p>`,

  6: `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Un courrier est en attente de <strong>validation DG</strong> à l'étape <strong>{{step_name}}</strong>.</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p><a href="{{inbox_url}}">Valider ou renvoyer le dossier</a></p>`,

  8: `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Un courrier validé est prêt pour le <strong>retour et la preuve de dépôt</strong> (étape {{step_number}} — {{step_name}}).</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p><a href="{{inbox_url}}">Traiter le retour</a></p>`,

  9: `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Un courrier est prêt pour l'<strong>archivage final</strong> (étape {{step_number}} — {{step_name}}).</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p><a href="{{inbox_url}}">Clôturer le dossier</a></p>`,
};

const STEP_DEFAULT_VIEWER_BODIES: Record<number, string> = {
  4: `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Vous êtes en <strong>copie lecture seule</strong> sur un courrier à l'étape <strong>{{step_name}}</strong>.</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p>Personnes en charge du traitement : {{assignees_list}}.</p>
<p><a href="{{inbox_url}}">Consulter le courrier</a></p>`,
};

export function getDefaultNotificationSubject(stepNumber: number): string {
  return (
    STEP_DEFAULT_SUBJECTS[stepNumber] ||
    `Courrier en attente — {{step_name}}`
  );
}

export function getDefaultNotificationBody(stepNumber: number, viewer = false): string {
  if (viewer && STEP_DEFAULT_VIEWER_BODIES[stepNumber]) {
    return STEP_DEFAULT_VIEWER_BODIES[stepNumber];
  }
  return (
    STEP_DEFAULT_BODIES[stepNumber] ||
    `<p>Bonjour <strong>{{recipient_name}}</strong>,</p>
<p>Un courrier requiert votre attention à l'étape <strong>{{step_name}}</strong> (étape {{step_number}}).</p>
<p><strong>Objet :</strong> {{mail_subject}}<br/><strong>Réf :</strong> {{reference_number}}</p>
<p><a href="{{inbox_url}}">Voir le courrier</a></p>`
  );
}

export function getStepDisplayName(stepNumber: number): string {
  return WORKFLOW_STEP_LABELS[stepNumber as keyof typeof WORKFLOW_STEP_LABELS]?.name || `Étape ${stepNumber}`;
}

export function wrapNotificationEmailHtml(title: string, innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f7; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background-color: #1a1a2e; padding: 24px 32px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${escapeHtml(title)}</h1>
    </div>
    <div style="padding: 32px; color: #333; font-size: 14px; line-height: 1.6;">
      ${innerHtml}
      <p style="color: #888; font-size: 12px; margin: 24px 0 0;">
        Cet e-mail a été envoyé automatiquement par le système ARE App.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function formatNotificationSubjectFromTemplate(
  template: string | null,
  vars: NotificationTemplateVars,
  fallback: string
): string {
  const applied = applyNotificationTemplate(template, vars);
  if (applied && template?.trim()) return applied.replace(/<[^>]+>/g, "");
  return fallback;
}

export function buildEmailFromStepTemplates(params: {
  stepNumber: number;
  stepName: string;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
  bodyViewerTemplate: string | null;
  recipientName: string;
  recipientEmail: string;
  mailSubject: string;
  referenceNumber?: string;
  mailId: string;
  accessMode: "contributor" | "viewer" | "default";
  assigneesList: string;
  assigneesCount: number;
  fallbackTitle: string;
  fallbackSubject: string;
}): { subject: string; bodyHtml: string } {
  const templateVars: NotificationTemplateVars = {
    recipientName: params.recipientName,
    recipientEmail: params.recipientEmail,
    stepName: params.stepName,
    stepNumber: params.stepNumber,
    mailSubject: params.mailSubject,
    referenceNumber: params.referenceNumber,
    accessMode: params.accessMode,
    assigneesList: params.assigneesList,
    assigneesCount: params.assigneesCount,
    mailId: params.mailId,
  };

  const subject = formatNotificationSubjectFromTemplate(
    params.subjectTemplate,
    templateVars,
    params.fallbackSubject
  );

  const isViewer = params.accessMode === "viewer";
  const rawBodyTemplate =
    isViewer && params.bodyViewerTemplate?.trim()
      ? params.bodyViewerTemplate
      : params.bodyTemplate;

  const innerHtml =
    applyNotificationTemplate(rawBodyTemplate, templateVars) ||
    applyNotificationTemplate(getDefaultNotificationBody(params.stepNumber, isViewer), templateVars) ||
    `<p>Bonjour <strong>${escapeHtml(params.recipientName)}</strong>,</p><p>Un courrier requiert votre attention.</p>`;

  return {
    subject,
    bodyHtml: wrapNotificationEmailHtml(params.fallbackTitle, innerHtml),
  };
}
