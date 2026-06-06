import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import {
  NOTIFICATION_SHORTCODES,
  applyNotificationTemplate,
  getDefaultNotificationBody,
  getDefaultNotificationSubject,
  type NotificationTemplateVars,
} from "@/lib/notification-template";

const STEP_DEFAULT_MODE: Record<number, string> = {
  2: "default_user",
  3: "default_user",
  4: "dynamic_by_previous_step",
  5: "default_user",
  6: "default_user_with_fallback",
  7: "dynamic_by_previous_step",
  8: "default_user",
  9: "default_user",
};

export interface NotificationTemplateConfig {
  step_number: number;
  notify_enabled: boolean;
  notification_subject_template: string | null;
  notification_body_template: string | null;
  notification_body_viewer_template: string | null;
}

interface WorkflowNotificationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stepNumber: number;
  stepName: string;
  config: NotificationTemplateConfig | null;
  existingResponsible?: {
    assignment_mode: string;
    default_user_id: string | null;
    fallback_step_number: number | null;
  } | null;
  createdBy?: string | null;
  onSaved: (config: NotificationTemplateConfig) => void;
}

const PREVIEW_VARS: NotificationTemplateVars = {
  recipientName: "Jean Dupont",
  recipientEmail: "jean.dupont@example.org",
  stepName: "Traitement",
  stepNumber: 4,
  mailSubject: "Demande de subvention — Projet X",
  referenceNumber: "48937-04-RK",
  accessMode: "contributor",
  assigneesList: "Jean Dupont, Marie Martin, Paul Koffi",
  assigneesCount: 3,
  mailId: "00000000-0000-0000-0000-000000000001",
};

export function WorkflowNotificationEditor({
  open,
  onOpenChange,
  stepNumber,
  stepName,
  config,
  existingResponsible,
  createdBy,
  onSaved,
}: WorkflowNotificationEditorProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyViewer, setBodyViewer] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeField, setActiveField] = useState<"subject" | "body" | "bodyViewer">("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodyViewerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setSubject(
      config?.notification_subject_template?.trim() ||
        getDefaultNotificationSubject(stepNumber)
    );
    setBody(
      config?.notification_body_template?.trim() ||
        getDefaultNotificationBody(stepNumber, false)
    );
    setBodyViewer(
      config?.notification_body_viewer_template?.trim() ||
        getDefaultNotificationBody(stepNumber, true)
    );
  }, [open, config, stepNumber]);

  const insertShortcode = (code: string) => {
    const ref =
      activeField === "subject"
        ? subjectRef
        : activeField === "bodyViewer"
          ? bodyViewerRef
          : bodyRef;

    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const value = el.value;
    const next = value.slice(0, start) + code + value.slice(end);

    if (activeField === "subject") setSubject(next);
    else if (activeField === "bodyViewer") setBodyViewer(next);
    else setBody(next);

    requestAnimationFrame(() => {
      el.focus();
      const pos = start + code.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const resetToDefaults = () => {
    setSubject(getDefaultNotificationSubject(stepNumber));
    setBody(getDefaultNotificationBody(stepNumber, false));
    setBodyViewer(getDefaultNotificationBody(stepNumber, true));
    toast.message("Modèle par défaut restauré (non enregistré)");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        step_number: stepNumber,
        assignment_mode:
          existingResponsible?.assignment_mode || STEP_DEFAULT_MODE[stepNumber] || "default_user",
        default_user_id: existingResponsible?.default_user_id ?? null,
        fallback_step_number:
          existingResponsible?.fallback_step_number ?? (stepNumber === 6 ? 2 : null),
        created_by: createdBy ?? null,
        is_active: true,
        notify_enabled: config?.notify_enabled ?? true,
        notification_subject_template: subject.trim() || null,
        notification_body_template: body.trim() || null,
        notification_body_viewer_template: bodyViewer.trim() || null,
      };

      const { error } = await supabase
        .from("workflow_step_responsibles" as any)
        .upsert(payload, { onConflict: "step_number" });

      if (error) throw error;

      onSaved({
        step_number: stepNumber,
        notify_enabled: payload.notify_enabled,
        notification_subject_template: payload.notification_subject_template,
        notification_body_template: payload.notification_body_template,
        notification_body_viewer_template: payload.notification_body_viewer_template,
      });
      toast.success(`Modèle e-mail enregistré pour l'étape ${stepNumber}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const previewVars: NotificationTemplateVars = {
    ...PREVIEW_VARS,
    stepName,
    stepNumber,
  };

  const previewContributorHtml = applyNotificationTemplate(body, previewVars);
  const previewViewerHtml = applyNotificationTemplate(bodyViewer, {
    ...previewVars,
    accessMode: "viewer",
    recipientName: "Marie Martin",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            E-mail — Étape {stepNumber} : {stepName}
          </DialogTitle>
          <DialogDescription>
            Personnalisez le sujet et le corps du message. Chaque assigné reçoit un e-mail
            individuel avec son nom et les shortcodes remplacés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Shortcodes — cliquer pour insérer</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {NOTIFICATION_SHORTCODES.map((item) => (
                <Badge
                  key={item.key}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/10 font-mono text-[11px]"
                  title={item.label}
                  onClick={() => insertShortcode(item.key)}
                >
                  {item.key}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-subject">Sujet de l'e-mail</Label>
            <Input
              id="notif-subject"
              ref={subjectRef}
              value={subject}
              onFocus={() => setActiveField("subject")}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={getDefaultNotificationSubject(stepNumber)}
            />
          </div>

          <Tabs defaultValue="contributor">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contributor">Message — traitement</TabsTrigger>
              <TabsTrigger value="viewer">Message — lecture seule</TabsTrigger>
            </TabsList>
            <TabsContent value="contributor" className="space-y-2 mt-3">
              <Label htmlFor="notif-body">Corps HTML (assignés traitement / responsable)</Label>
              <Textarea
                id="notif-body"
                ref={bodyRef}
                value={body}
                onFocus={() => setActiveField("body")}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </TabsContent>
            <TabsContent value="viewer" className="space-y-2 mt-3">
              <Label htmlFor="notif-body-viewer">Corps HTML (copie lecture seule)</Label>
              <Textarea
                id="notif-body-viewer"
                ref={bodyViewerRef}
                value={bodyViewer}
                onFocus={() => setActiveField("bodyViewer")}
                onChange={(e) => setBodyViewer(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Utilisé pour les viewers (étape 4, etc.). Si vide à l'envoi, le message traitement est utilisé.
              </p>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium">Aperçu (données fictives)</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border bg-background p-2 text-xs overflow-auto max-h-40">
                <p className="font-medium mb-1 text-muted-foreground">Traitement</p>
                <p className="font-semibold mb-1 truncate">
                  {applyNotificationTemplate(subject, previewVars) || subject}
                </p>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: previewContributorHtml || "<em>Corps vide</em>",
                  }}
                />
              </div>
              <div className="rounded border bg-background p-2 text-xs overflow-auto max-h-40">
                <p className="font-medium mb-1 text-muted-foreground">Lecture seule</p>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: previewViewerHtml || "<em>Corps vide</em>",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={resetToDefaults}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Défauts
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
