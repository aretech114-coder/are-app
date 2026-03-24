import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { TreatmentsList } from "@/components/TreatmentsList";
import { Step4ContextPanel } from "@/components/Step4ContextPanel";
import { getStepLabel, getStepColor } from "@/lib/workflow-engine";
import { MailDetailFields } from "@/components/MailDetailFields";
import { Search, Eye, CheckCircle, Clock, Paperclip } from "lucide-react";
import { AttachmentIndicator, AttachmentViewer } from "@/components/AttachmentViewer";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface RawAssignment {
  id: string;
  mail_id: string;
  step_number: number;
  status: string;
  completed_at: string | null;
  created_at: string;
  instructions: string | null;
  mails: any;
}

interface GroupedEntry {
  mail_id: string;
  mail: any;
  assignments: { step_number: number; status: string; completed_at: string | null; created_at: string; instructions: string | null }[];
  latestStep: number;
  latestStatus: string;
  latestDate: string;
  hasAttachment: boolean;
}

const statusLabels: Record<string, string> = {
  pending: "En attente",
  completed: "Terminé",
  proposed: "Proposé",
  acknowledged: "Consulté",
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  completed: "bg-success/10 text-success border-success/30",
  proposed: "bg-info/10 text-info border-info/30",
  acknowledged: "bg-primary/10 text-primary border-primary/30",
};

const mailStatusLabels: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  processed: "Traité",
  archived: "Archivé",
};

const mailStatusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-info/10 text-info border-info/30",
  processed: "bg-success/10 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-border",
};

export default function HistoryPage() {
  const { user } = useAuth();
  const [grouped, setGrouped] = useState<GroupedEntry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<GroupedEntry | null>(null);
  const [workflowAttachments, setWorkflowAttachments] = useState<{ step: number; url: string; performer: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("mail_assignments")
      .select("id, mail_id, step_number, status, completed_at, created_at, instructions, mails(id, subject, reference_number, sender_name, priority, status, current_step, mail_type, addressed_to, deadline_at, created_at, description, comments, attachment_url, ai_draft, sender_organization, sender_phone, sender_email, sender_address, sender_city, sender_country, reception_date, deposit_time, ministre_absent)")
      .eq("assigned_to", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur fetch historique:", error.message);
    }

    // Group by mail_id
    const map = new Map<string, GroupedEntry>();
    for (const raw of (data || []) as RawAssignment[]) {
      const mail = raw.mails;
      if (!mail) continue;
      const existing = map.get(raw.mail_id);
      const assignment = {
        step_number: raw.step_number,
        status: raw.status,
        completed_at: raw.completed_at,
        created_at: raw.created_at,
        instructions: raw.instructions,
      };
      if (existing) {
        existing.assignments.push(assignment);
        // Keep latest
        if (new Date(raw.created_at) > new Date(existing.latestDate)) {
          existing.latestStep = raw.step_number;
          existing.latestStatus = raw.status;
          existing.latestDate = raw.created_at;
        }
      } else {
        map.set(raw.mail_id, {
          mail_id: raw.mail_id,
          mail,
          assignments: [assignment],
          latestStep: raw.step_number,
          latestStatus: raw.status,
          latestDate: raw.created_at,
          hasAttachment: !!mail.attachment_url,
        });
      }
    }

    // Sort by latest date desc
    const entries = Array.from(map.values()).sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
    setGrouped(entries);
    setLoading(false);
  };

  // Fetch workflow attachments when detail opens
  useEffect(() => {
    if (!selectedEntry) { setWorkflowAttachments([]); return; }
    (async () => {
      const { data: transitions } = await supabase
        .from("workflow_transitions")
        .select("from_step, notes, performed_by")
        .eq("mail_id", selectedEntry.mail_id)
        .order("created_at", { ascending: true });

      if (!transitions) return;

      const performerIds = [...new Set(transitions.map(t => t.performed_by))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", performerIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      const attachments: { step: number; url: string; performer: string }[] = [];
      for (const t of transitions) {
        const match = t.notes?.match(/📎 Document joint: (.+?)(?:\n|$)/);
        if (match) {
          attachments.push({
            step: t.from_step || 0,
            url: match[1].trim(),
            performer: nameMap.get(t.performed_by) || "Système",
          });
        }
      }
      setWorkflowAttachments(attachments);
    })();
  }, [selectedEntry]);

  const filtered = grouped.filter((e) => {
    const matchSearch =
      e.mail?.subject?.toLowerCase().includes(search.toLowerCase()) ||
      e.mail?.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
      e.mail?.sender_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.latestStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const isOverdue = (entry: GroupedEntry) => {
    if (!entry.mail?.deadline_at) return false;
    return new Date(entry.mail.deadline_at) < new Date() && entry.mail.status !== "archived";
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header">Historique de Traitement</h1>
        <p className="page-description">Suivi personnel des courriers où vous avez été assigné</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par objet, référence, expéditeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut assignation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
            <SelectItem value="proposed">Proposé</SelectItem>
            <SelectItem value="acknowledged">Consulté</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Mes étapes</TableHead>
              <TableHead>Mon statut</TableHead>
              <TableHead>Étape actuelle</TableHead>
              <TableHead>Statut courrier</TableHead>
              <TableHead className="w-8"><Paperclip className="h-3.5 w-3.5" /></TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Chargement...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Aucun historique trouvé</TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => (
                <TableRow
                  key={entry.mail_id}
                  className={`cursor-pointer hover:bg-accent/50 transition-colors ${isOverdue(entry) ? "bg-destructive/5" : ""}`}
                  onClick={() => setSelectedEntry(entry)}
                >
                  <TableCell className="font-mono text-xs">{entry.mail?.reference_number}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{entry.mail?.subject}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {entry.assignments
                        .sort((a, b) => a.step_number - b.step_number)
                        .map((a, i) => (
                          <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(a.step_number)}`}>
                            É{a.step_number}
                          </span>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${statusColors[entry.latestStatus] || ""}`}>
                      {entry.latestStatus === "completed" ? (
                        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Terminé</span>
                      ) : entry.latestStatus === "pending" ? (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> En attente</span>
                      ) : (
                        statusLabels[entry.latestStatus] || entry.latestStatus
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.mail?.current_step && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(entry.mail.current_step)}`}>
                        {getStepLabel(entry.mail.current_step)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${mailStatusColors[entry.mail?.status || ""] || ""}`}>
                      {mailStatusLabels[entry.mail?.status || ""] || entry.mail?.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <AttachmentIndicator hasAttachment={entry.hasAttachment} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(entry.latestDate), "dd/MM/yyyy HH:mm", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedEntry(entry); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Détails — {selectedEntry?.mail?.reference_number}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry?.mail && (
            <div className="space-y-4">
              {/* Workflow progress */}
              <WorkflowStepper currentStep={selectedEntry.mail.current_step || 1} />

              {/* My assignments summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mes interventions</h4>
                {selectedEntry.assignments
                  .sort((a, b) => a.step_number - b.step_number)
                  .map((a, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${
                      a.status === "completed" ? "bg-success/5 border-success/30" :
                      a.status === "pending" ? "bg-warning/5 border-warning/30" :
                      a.status === "acknowledged" ? "bg-primary/5 border-primary/30" :
                      "bg-muted/30"
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Étape {a.step_number} — {getStepLabel(a.step_number)}
                        </p>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[a.status] || ""}`}>
                          {a.status === "completed" ? "✅ Terminé" :
                           a.status === "pending" ? "⏳ En attente" :
                           a.status === "acknowledged" ? "👁 Consulté" :
                           statusLabels[a.status] || a.status}
                        </Badge>
                      </div>
                      {a.completed_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Complété le {format(new Date(a.completed_at), "dd MMMM yyyy à HH:mm", { locale: fr })}
                        </p>
                      )}
                      {a.instructions && (
                        <p className="text-xs text-muted-foreground mt-1 italic">Instructions: {a.instructions}</p>
                      )}
                    </div>
                  ))}
              </div>

              {/* Mail details categorized by step */}
              <MailDetailFields mail={selectedEntry.mail} />

              {/* Workflow attachments from transitions */}
              {workflowAttachments.length > 0 && (
                <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Documents joints au workflow
                  </h4>
                  {workflowAttachments.map((wa, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded border bg-background/50">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStepColor(wa.step)}`}>É{wa.step}</span>
                      <span className="text-xs text-muted-foreground flex-1 truncate">{wa.performer}</span>
                      <AttachmentViewer url={wa.url} inline />
                    </div>
                  ))}
                </div>
              )}

              {/* Treatments */}
              <TreatmentsList mailId={selectedEntry.mail_id} />

              {/* Context panel */}
              <Step4ContextPanel mailId={selectedEntry.mail_id} />

              {/* Full workflow timeline */}
              <div className="p-3 rounded-lg border bg-muted/20">
                <h4 className="text-sm font-semibold mb-2">Historique complet du workflow</h4>
                <WorkflowTimeline mailId={selectedEntry.mail_id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
