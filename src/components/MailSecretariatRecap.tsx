import { ClipboardList, FileText } from "lucide-react";
import { DgDecisionSummary } from "@/components/DgDecisionSummary";
import { MailContributionsPanel } from "@/components/MailContributionsPanel";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { UI_LABELS, getMailAttachmentUrls } from "@/lib/labels";
import { useMailWorkflowContext } from "@/hooks/useMailWorkflowContext";
import type { MailContribution } from "@/hooks/useMailContributions";

interface Props {
  mailId: string;
  mail: { attachment_url?: string | null; attachment_urls?: unknown[] | null };
  contributions?: MailContribution[];
  step4AssigneeCount?: number;
  compact?: boolean;
}

/** Récapitulatif dossier pour le secrétariat à l'étape retour / preuve de dépôt. */
export function MailSecretariatRecap({
  mailId,
  mail,
  contributions = [],
  step4AssigneeCount = 0,
  compact = false,
}: Props) {
  const workflowCtx = useMailWorkflowContext(mailId);
  const incomingUrls = getMailAttachmentUrls(mail);

  const hasValidation =
    !!workflowCtx.ministerValidationNotes || !!workflowCtx.ministerValidationParsed?.annotation;
  const hasDgDecision = !!workflowCtx.dgNotes || workflowCtx.dgAssignments.length > 0;
  const submittedContributions = contributions.filter((c) => c.status === "submitted");
  const viewers = workflowCtx.dgAssignments.filter((a) => a.access_mode === "viewer");

  if (workflowCtx.loading) {
    return (
      <div className="p-3 rounded-lg border bg-muted/20 text-xs text-muted-foreground">
        Chargement du récapitulatif du dossier…
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${compact ? "" : "p-3 rounded-lg border border-indigo-200/60 bg-indigo-50/30 dark:bg-indigo-950/20"}`}>
      {!compact && (
        <h4 className="text-sm font-semibold flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
          <ClipboardList className="h-4 w-4" />
          Récapitulatif complet du dossier
        </h4>
      )}

      {hasValidation && (
        <section className="rounded-lg border border-rose-200/80 bg-rose-50/40 dark:bg-rose-950/20 p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300">
            Instructions du {UI_LABELS.dgShort} — validation (étape 6)
          </p>
          <p className="text-[11px] text-muted-foreground">
            Base de rédaction pour le courrier sortant et les actions du secrétariat.
          </p>
          <DgDecisionSummary
            notes={workflowCtx.ministerValidationNotes}
            parsed={workflowCtx.ministerValidationParsed}
            annotationTitle="Observations et consignes de validation"
            attachmentTitle="Pièce jointe de validation (modèle, consignes…)"
            showAssignments={false}
            compact
          />
        </section>
      )}

      {submittedContributions.length > 0 && (
        <MailContributionsPanel
          contributions={contributions}
          assigneeCount={step4AssigneeCount || undefined}
          title="Interventions des assignés (traitement étape 4)"
          showAllDrafts={false}
        />
      )}

      {hasDgDecision && (
        <section className="rounded-lg border p-3 space-y-2 bg-background/60">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Décision initiale du {UI_LABELS.dgShort} (étape 2)
          </p>
          <DgDecisionSummary
            notes={workflowCtx.dgNotes}
            assignments={workflowCtx.dgAssignments}
            meetings={workflowCtx.meetings}
            compact
          />
        </section>
      )}

      {viewers.length > 0 && (
        <section className="rounded-lg border border-dashed p-3 bg-muted/20">
          <p className="text-xs font-semibold mb-1.5">Personnes en copie lecture seule (étape 4)</p>
          <p className="text-xs text-muted-foreground mb-2">
            Informées du dossier sans obligation de traiter — peuvent avoir laissé des observations en
            consultation.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {viewers.map((v, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full border bg-background">
                {v.full_name}
              </span>
            ))}
          </div>
        </section>
      )}

      {incomingUrls.length > 0 && (
        <section className="rounded-lg border p-3 bg-background/60">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pièce{incomingUrls.length > 1 ? "s" : ""} jointe{incomingUrls.length > 1 ? "s" : ""} à
              l&apos;enregistrement
            </p>
          </div>
          <AttachmentViewer mail={mail} inline />
        </section>
      )}

      {!hasValidation &&
        submittedContributions.length === 0 &&
        !hasDgDecision &&
        incomingUrls.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucune intervention enregistrée sur ce dossier.</p>
        )}
    </div>
  );
}
