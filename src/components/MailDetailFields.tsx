import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Navigation, Paperclip } from "lucide-react";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { AttachmentDownloadButton } from "@/components/AttachmentDownloadButton";
import { DgDecisionSummary } from "@/components/DgDecisionSummary";
import { UI_LABELS, getMailAttachmentUrls } from "@/lib/labels";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useMailWorkflowContext } from "@/hooks/useMailWorkflowContext";
import type { WorkflowStep } from "@/hooks/useWorkflowSteps";
import {
  getVisualWorkflowStepNumber,
  priorityLabels,
  shouldHideDgSummaryCard,
  shouldShowWorkflowBlock,
  statusLabels,
} from "@/lib/workflow-display";

interface MailDetailFieldsProps {
  mail: any;
  getProfileName?: (id: string) => string;
  activeSteps?: WorkflowStep[];
  role?: string | null;
  circuitLabel?: string | null;
  embedAttachments?: boolean;
  onViewAttachments?: () => void;
  allowAttachmentDownload?: boolean;
}

function FieldCategory({
  title,
  displayStep,
  color,
  children,
}: {
  title: string;
  displayStep: number;
  color: string;
  children: React.ReactNode;
}) {
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
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-background border">
          É{displayStep}
        </span>
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

function StepNote({ text, iconColor }: { text: string; iconColor: string }) {
  return (
    <div className="flex gap-2.5">
      <Navigation className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} />
      <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}

export function MailDetailFields({
  mail,
  getProfileName,
  activeSteps = [],
  role = null,
  circuitLabel = null,
  embedAttachments = true,
  onViewAttachments,
  allowAttachmentDownload = false,
}: MailDetailFieldsProps) {
  const isOverdue =
    mail.deadline_at && new Date(mail.deadline_at) < new Date() && mail.status !== "archived";
  const { settings } = useSiteSettings();
  const authLong = settings.authority_title_long || UI_LABELS.dg;
  const currentStep = mail.current_step || 1;
  const attachmentUrls = getMailAttachmentUrls(mail);

  const workflowCtx = useMailWorkflowContext(mail.id);

  const visual = (stepOrder: number) => getVisualWorkflowStepNumber(activeSteps, stepOrder);

  const hideDgBlock = shouldHideDgSummaryCard(currentStep, role);

  const hasDgContent =
    !!workflowCtx.dgNotes ||
    workflowCtx.dgAssignments.length > 0 ||
    workflowCtx.meetings.length > 0;

  const showStep2 =
    shouldShowWorkflowBlock(2, currentStep, activeSteps) &&
    !hideDgBlock &&
    (workflowCtx.loading || hasDgContent || currentStep === 2);

  const showStep3 =
    shouldShowWorkflowBlock(3, currentStep, activeSteps) &&
    !mail.ministre_absent &&
    (workflowCtx.loading || !!workflowCtx.dircabOrientation || currentStep === 3);

  const showStep5 =
    shouldShowWorkflowBlock(5, currentStep, activeSteps) &&
    (workflowCtx.loading || !!workflowCtx.dircabVerification || currentStep === 5);

  const showStep6 =
    shouldShowWorkflowBlock(6, currentStep, activeSteps) &&
    (workflowCtx.loading || !!workflowCtx.ministerValidation || currentStep === 6);

  return (
    <div className="space-y-3">
      <FieldCategory title="Réception & Enregistrement" displayStep={1} color="blue">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="N° courrier" value={mail.reference_number} />
          <DetailItem label="Référence registre" value={mail.registry_reference} />
          <DetailItem label="ID système" value={mail.system_reference} />
          <DetailItem label="Circuit / registre" value={circuitLabel} />
          <DetailItem label="Objet" value={mail.subject} />
          <DetailItem label="Expéditeur" value={mail.sender_name} />
          <DetailItem label="Organisation" value={mail.sender_organization} />
          <DetailItem label="Type" value={mail.mail_type} />
          <DetailItem label="Priorité" value={priorityLabels[mail.priority] || mail.priority} />
          {mail.reception_date && (
            <DetailItem
              label="Date de réception"
              value={format(new Date(mail.reception_date), "dd MMMM yyyy", { locale: fr })}
            />
          )}
          <DetailItem label="Heure de dépôt" value={mail.deposit_time} />
          <DetailItem label={UI_LABELS.dgAbsent} value={mail.ministre_absent ? "Oui" : "Non"} />
          {getProfileName && mail.assigned_agent_id && mail.ministre_absent && (
            <DetailItem label={UI_LABELS.treatedBy} value={getProfileName(mail.assigned_agent_id)} />
          )}
          <DetailItem label="Téléphone" value={mail.sender_phone} />
          <DetailItem label="Email" value={mail.sender_email} />
          {mail.sender_address && (
            <DetailItem
              label="Adresse"
              value={[mail.sender_address, mail.sender_city, mail.sender_province, mail.sender_country]
                .filter(Boolean)
                .join(", ")}
            />
          )}
        </div>
        {(mail.comments || mail.description) && (
          <div className="mt-2 space-y-2">
            {mail.comments && (
              <div className="p-2 rounded bg-background/50 text-sm whitespace-pre-wrap">
                <p className="text-[11px] text-muted-foreground mb-1">RAS / notes internes</p>
                {mail.comments}
              </div>
            )}
            {mail.description && mail.description !== mail.comments && (
              <div className="p-2 rounded bg-background/50 text-sm whitespace-pre-wrap">{mail.description}</div>
            )}
          </div>
        )}
        {embedAttachments && attachmentUrls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  Pièce{attachmentUrls.length > 1 ? "s" : ""} jointe{attachmentUrls.length > 1 ? "s" : ""} (réception)
                </span>
              </div>
              <div className="flex items-center gap-1">
                {allowAttachmentDownload &&
                  (Array.isArray(mail.attachment_urls) && mail.attachment_urls.length > 0
                    ? mail.attachment_urls.map(
                        (meta: { url: string; name?: string; bucket?: string; path?: string }, i: number) => (
                          <AttachmentDownloadButton
                            key={i}
                            url={meta.url}
                            name={meta.name}
                            bucket={meta.bucket}
                            path={meta.path}
                            variant="ghost"
                            size="icon"
                          />
                        )
                      )
                    : attachmentUrls.map((url, i) => (
                        <AttachmentDownloadButton key={i} url={url} variant="ghost" size="icon" />
                      )))}
                {onViewAttachments && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onViewAttachments}>
                    Visualiser
                  </Button>
                )}
              </div>
            </div>
            <AttachmentViewer mail={mail} />
          </div>
        )}
      </FieldCategory>

      {showStep2 && (
        <FieldCategory title="Traitement DG" displayStep={visual(2)} color="purple">
          {workflowCtx.loading ? (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          ) : hasDgContent ? (
            <DgDecisionSummary
              notes={workflowCtx.dgNotes}
              assignments={workflowCtx.dgAssignments}
              meetings={workflowCtx.meetings}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Décision et annotations du {authLong} en attente.</p>
          )}
        </FieldCategory>
      )}

      {showStep3 && (
        <FieldCategory title="Filtrage stratégique" displayStep={visual(3)} color="amber">
          {workflowCtx.loading ? (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          ) : workflowCtx.dircabOrientation ? (
            <StepNote text={workflowCtx.dircabOrientation} iconColor="text-amber-600" />
          ) : (
            <p className="text-xs text-muted-foreground">Filtrage DGA en cours.</p>
          )}
        </FieldCategory>
      )}

      {shouldShowWorkflowBlock(4, currentStep, activeSteps) && (
        <FieldCategory title="Traitement des assignés" displayStep={visual(4)} color="emerald">
          {mail.ai_draft ? (
            <div className="p-2 rounded bg-background/50 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
              {mail.ai_draft}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Traitements et soumissions — voir bloc traitements.</p>
          )}
        </FieldCategory>
      )}

      {showStep5 && (
        <FieldCategory title="Vérification DGA" displayStep={visual(5)} color="cyan">
          {workflowCtx.loading ? (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          ) : workflowCtx.dircabVerification ? (
            <StepNote text={workflowCtx.dircabVerification} iconColor="text-cyan-600" />
          ) : (
            <p className="text-xs text-muted-foreground">Vérification DGA en cours.</p>
          )}
        </FieldCategory>
      )}

      {showStep6 && (
        <FieldCategory title={UI_LABELS.dgValidation} displayStep={visual(6)} color="rose">
          {workflowCtx.loading ? (
            <p className="text-xs text-muted-foreground">Chargement...</p>
          ) : workflowCtx.ministerValidationNotes ? (
            <DgDecisionSummary
              notes={workflowCtx.ministerValidationNotes}
              parsed={workflowCtx.ministerValidationParsed}
              annotationTitle="Commentaire de validation du Directeur général"
              attachmentTitle="Document joint à la validation (instructions secrétariat)"
              showAssignments={false}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Validation finale {authLong} en cours.</p>
          )}
        </FieldCategory>
      )}

      {shouldShowWorkflowBlock(8, currentStep, activeSteps) && currentStep >= 8 && (
        <FieldCategory title="Retour & preuve de dépôt" displayStep={visual(8)} color="indigo">
          <p className="text-xs text-muted-foreground mb-2">
            Secrétariat — consultez le récapitulatif complet du dossier ci-dessous avant de rédiger le
            courrier sortant ou joindre la preuve de dépôt.
          </p>
        </FieldCategory>
      )}

      {mail.deadline_at && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm ${
            isOverdue ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20"
          }`}
        >
          {isOverdue && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
          <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
            Échéance : {format(new Date(mail.deadline_at), "dd MMMM yyyy à HH:mm", { locale: fr })}
            {isOverdue && " — EN RETARD"}
          </span>
        </div>
      )}
    </div>
  );
}

export { statusLabels, priorityLabels };

