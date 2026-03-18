import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Paperclip } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";

interface MailDetailFieldsProps {
  mail: any;
  getProfileName?: (id: string) => string;
}

const statusLabels: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  processed: "Traité",
  archived: "Archivé",
};

const priorityLabels: Record<string, string> = {
  low: "Faible",
  normal: "Normal",
  high: "Élevée",
  urgent: "Urgent",
};

function FieldCategory({ title, step, color, children }: { title: string; step: number; color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    blue: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
    purple: "border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20",
    amber: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
    emerald: "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
    rose: "border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20",
    cyan: "border-l-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20",
    indigo: "border-l-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20",
    orange: "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20",
    teal: "border-l-teal-500 bg-teal-50/50 dark:bg-teal-950/20",
  };

  return (
    <div className={`p-3 rounded-lg border-l-4 border border-border ${colorMap[color] || "bg-muted/30"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-background border">É{step}</span>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export function MailDetailFields({ mail, getProfileName }: MailDetailFieldsProps) {
  const isOverdue = mail.deadline_at && new Date(mail.deadline_at) < new Date() && mail.status !== "archived";

  return (
    <div className="space-y-3">
      {/* Étape 1: Réception & Enregistrement */}
      <FieldCategory title="Réception & Enregistrement" step={1} color="blue">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="N° Courrier" value={mail.reference_number} />
          <DetailItem label="Objet" value={mail.subject} />
          <DetailItem label="Expéditeur" value={mail.sender_name} />
          <DetailItem label="Organisation" value={mail.sender_organization} />
          <DetailItem label="Type" value={mail.mail_type} />
          <DetailItem label="Priorité" value={priorityLabels[mail.priority] || mail.priority} />
          {mail.reception_date && (
            <DetailItem label="Date de réception" value={format(new Date(mail.reception_date), "dd MMMM yyyy", { locale: fr })} />
          )}
          <DetailItem label="Heure de dépôt" value={mail.deposit_time} />
          <DetailItem label="Téléphone" value={mail.sender_phone} />
          <DetailItem label="Email" value={mail.sender_email} />
          {mail.sender_address && (
            <DetailItem
              label="Adresse"
              value={`${mail.sender_address}${mail.sender_city ? `, ${mail.sender_city}` : ""}${mail.sender_country ? ` — ${mail.sender_country}` : ""}`}
            />
          )}
        </div>
      </FieldCategory>

      {/* Étape 2: Routage Hiérarchique */}
      {(mail.current_step || 1) >= 2 && (
        <FieldCategory title="Routage Hiérarchique" step={2} color="purple">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem label="Destinataire" value={mail.addressed_to || "—"} />
            <DetailItem label="Ministre absent" value={mail.ministre_absent ? "Oui" : "Non"} />
            <div>
              <p className="text-[11px] text-muted-foreground">Statut</p>
              <Badge variant="outline" className="text-[10px] mt-0.5">
                {statusLabels[mail.status] || mail.status}
              </Badge>
            </div>
            {getProfileName && mail.assigned_agent_id && (
              <DetailItem label="Assigné à" value={getProfileName(mail.assigned_agent_id)} />
            )}
          </div>
          {mail.comments && (
            <div className="mt-2 p-2 rounded bg-background/50 text-sm whitespace-pre-wrap">{mail.comments}</div>
          )}
        </FieldCategory>
      )}

      {/* Étape 3: Filtrage Stratégique */}
      {(mail.current_step || 1) >= 3 && !mail.ministre_absent && (
        <FieldCategory title="Filtrage Stratégique" step={3} color="amber">
          <p className="text-xs text-muted-foreground">DirCab a validé/filtré les assignations pour le traitement.</p>
        </FieldCategory>
      )}

      {/* Étape 4: Traitement */}
      {(mail.current_step || 1) >= 4 && (
        <FieldCategory title="Traitement des Assignés" step={4} color="emerald">
          {mail.ai_draft ? (
            <div className="p-2 rounded bg-background/50 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
              {mail.ai_draft}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Traitement en cours ou pas encore soumis.</p>
          )}
        </FieldCategory>
      )}

      {/* Étape 5: Vérification */}
      {(mail.current_step || 1) >= 5 && (
        <FieldCategory title="Vérification DirCab" step={5} color="cyan">
          <p className="text-xs text-muted-foreground">Vérification par le DirCab avant validation ministérielle.</p>
        </FieldCategory>
      )}

      {/* Étape 6: Validation Ministre */}
      {(mail.current_step || 1) >= 6 && (
        <FieldCategory title="Validation Ministre" step={6} color="rose">
          <p className="text-xs text-muted-foreground">Validation finale par le Ministre.</p>
        </FieldCategory>
      )}

      {/* Échéance */}
      {mail.deadline_at && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border ${isOverdue ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"}`}>
          {isOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
          <span className={`text-sm ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            Échéance: {format(new Date(mail.deadline_at), "dd MMMM yyyy à HH:mm", { locale: fr })}
            {isOverdue && " — EN RETARD"}
          </span>
        </div>
      )}

      {/* Pièces jointes */}
      {mail.attachment_url && (
        <div className="p-3 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pièces jointes</h4>
          </div>
          <AttachmentViewer url={mail.attachment_url} />
        </div>
      )}

      {/* Description */}
      {mail.description && (
        <div className="p-3 rounded-lg bg-muted/30 text-sm whitespace-pre-wrap">{mail.description}</div>
      )}
    </div>
  );
}
