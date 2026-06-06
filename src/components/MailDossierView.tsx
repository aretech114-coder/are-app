import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ChevronUp, Clock, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { MailDetailFields } from "@/components/MailDetailFields";
import { TreatmentsList } from "@/components/TreatmentsList";
import { SubAssignmentPanel } from "@/components/SubAssignmentPanel";
import { MailContributionsPanel } from "@/components/MailContributionsPanel";
import { MailSecretariatRecap } from "@/components/MailSecretariatRecap";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { useActiveWorkflowSteps } from "@/hooks/useWorkflowSteps";
import { getMailAttachmentUrls } from "@/lib/labels";
import {
  priorityLabels,
  shouldShowWorkflowBlock,
  statusLabels,
  isDgRole,
} from "@/lib/workflow-display";
import type { MailContribution } from "@/hooks/useMailContributions";
import { useAuth } from "@/hooks/useAuth";

export interface MailDossierViewProps {
  mail: any;
  role?: string | null;
  getProfileName?: (id: string) => string;
  circuitLabel?: string | null;
  showContributionsPanel?: boolean;
  contributions?: MailContribution[];
  step4AssigneeCount?: number;
  onViewAttachments?: () => void;
  defaultStepperCollapsed?: boolean;
  /** Contenu additionnel au-dessus de l'historique (ex. interventions utilisateur) */
  extraBeforeTimeline?: React.ReactNode;
}

export function MailDossierView({
  mail,
  role = null,
  getProfileName,
  circuitLabel = null,
  showContributionsPanel = false,
  contributions = [],
  step4AssigneeCount = 0,
  onViewAttachments,
  defaultStepperCollapsed = true,
  extraBeforeTimeline,
}: MailDossierViewProps) {
  const { user } = useAuth();
  const { data: activeSteps = [] } = useActiveWorkflowSteps();
  const [stepperOpen, setStepperOpen] = useState(!defaultStepperCollapsed);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const currentStep = mail.current_step || 1;
  const hasAttachments = getMailAttachmentUrls(mail).length > 0;
  const isOverdue =
    mail.deadline_at && new Date(mail.deadline_at) < new Date() && mail.status !== "archived";

  useEffect(() => {
    setStepperOpen(!defaultStepperCollapsed);
  }, [mail.id, defaultStepperCollapsed]);

  const showTreatments = shouldShowWorkflowBlock(4, currentStep, activeSteps);
  const showSecretariatRecap = currentStep >= 8;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* En-tête compact */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] shrink-0">
                {statusLabels[mail.status] || mail.status || "En cours"}
              </Badge>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {priorityLabels[mail.priority] || mail.priority}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive" className="text-[10px]">
                  En retard
                </Badge>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug">{mail.subject}</h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {mail.sender_name}
              {mail.sender_organization ? ` — ${mail.sender_organization}` : ""}
            </p>
          </div>
          {hasAttachments && onViewAttachments && (
            <Button type="button" size="sm" variant="outline" className="shrink-0 h-8" onClick={onViewAttachments}>
              <Paperclip className="h-3.5 w-3.5 mr-1" />
              Document
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(mail.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
          </span>
          <span className="font-mono">N° {mail.reference_number}</span>
          {mail.registry_reference && (
            <span className="font-mono">Réf. {mail.registry_reference}</span>
          )}
          {circuitLabel && <span>{circuitLabel}</span>}
          {mail.deadline_at && (
            <span className={isOverdue ? "text-destructive font-medium" : ""}>
              Échéance {format(new Date(mail.deadline_at), "dd MMM HH:mm", { locale: fr })}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setStepperOpen((o) => !o)}
        >
          {stepperOpen ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
          {stepperOpen ? "Masquer" : "Voir"} le parcours workflow
        </Button>
        {stepperOpen && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <WorkflowStepper currentStep={currentStep} />
          </div>
        )}
      </div>

      {/* Corps scrollable */}
      <div className="flex-1 overflow-auto p-4 space-y-3 min-h-0">
        <MailDetailFields
          mail={mail}
          getProfileName={getProfileName}
          activeSteps={activeSteps}
          role={role}
          circuitLabel={circuitLabel}
          embedAttachments
          onViewAttachments={onViewAttachments}
        />

        {showSecretariatRecap && (
          <MailSecretariatRecap
            mailId={mail.id}
            mail={mail}
            contributions={contributions}
            step4AssigneeCount={step4AssigneeCount}
          />
        )}

        {showTreatments && !showContributionsPanel && <TreatmentsList mailId={mail.id} />}

        <SubAssignmentPanel mailId={mail.id} currentStep={currentStep} />

        {showContributionsPanel && (
          <MailContributionsPanel
            contributions={contributions}
            assigneeCount={step4AssigneeCount}
            showAllDrafts={isDgRole(role)}
            currentUserId={user?.id}
            title={
              isDgRole(role)
                ? "Contributions des assignés"
                : "Traitements des collaborateurs"
            }
          />
        )}

        {extraBeforeTimeline}

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={() => setTimelineOpen((o) => !o)}
          >
            {timelineOpen ? "Masquer" : "Voir"} l'historique du workflow
          </Button>
          {timelineOpen && (
            <div className="mt-2 p-3 rounded-lg border bg-muted/20">
              <WorkflowTimeline mailId={mail.id} activeSteps={activeSteps} groupByStep />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
