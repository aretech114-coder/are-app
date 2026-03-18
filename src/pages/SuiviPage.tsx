import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { Step4ContextPanel } from "@/components/Step4ContextPanel";
import { TreatmentsList } from "@/components/TreatmentsList";
import { MailDetailFields } from "@/components/MailDetailFields";
import { MailEditDialog, MailDeleteDialog } from "@/components/MailEditDialog";
import { getStepLabel, getStepColor, WORKFLOW_STEPS } from "@/lib/workflow-engine";
import { Search, CalendarIcon, Eye, AlertTriangle, Clock, CheckCircle, Archive, BarChart3, Pencil, Trash2, TrendingUp, TrendingDown, Paperclip } from "lucide-react";
import { AttachmentIndicator } from "@/components/AttachmentViewer";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const statusLabels: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  processed: "Traité",
  archived: "Archivé",
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-info/10 text-info border-info/30",
  processed: "bg-success/10 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const priorityLabels: Record<string, string> = {
  low: "Faible",
  normal: "Normal",
  high: "Élevée",
  urgent: "Urgent",
};

export default function SuiviPage() {
  const { role, hasPermission } = useAuth();
  const [mails, setMails] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStep, setFilterStep] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [selectedMail, setSelectedMail] = useState<any>(null);
  const [editMail, setEditMail] = useState<any>(null);
  const [deleteMail, setDeleteMail] = useState<any>(null);
  const [showStats, setShowStats] = useState(true);

  // Permission: SuperAdmin always can, Admin only if toggle enabled
  const canEditDelete = role === "superadmin" || (role === "admin" && hasPermission("manage_mail_entries"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: mailsData }, { data: profilesData }] = await Promise.all([
      supabase.from("mails").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    setMails(mailsData || []);
    setProfiles(profilesData || []);
    setLoading(false);
  };

  const getProfileName = (id: string) => profiles.find(p => p.id === id)?.full_name || "—";
  const isOverdue = (mail: any) => mail.deadline_at && new Date(mail.deadline_at) < new Date() && mail.status !== "archived";

  const getOverdueHours = (mail: any) => {
    if (!mail.deadline_at) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(mail.deadline_at).getTime()) / (1000 * 60 * 60)));
  };

  const filtered = mails.filter(m => {
    if (search && !(
      m.subject?.toLowerCase().includes(search.toLowerCase()) ||
      m.sender_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.reference_number?.toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterStep !== "all" && String(m.current_step) !== filterStep) return false;
    if (filterUser !== "all" && m.assigned_agent_id !== filterUser && m.registered_by !== filterUser) return false;
    if (filterPriority !== "all" && m.priority !== filterPriority) return false;
    if (dateFrom && new Date(m.created_at) < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59);
      if (new Date(m.created_at) > end) return false;
    }
    return true;
  });

  // KPIs
  const totalMails = filtered.length;
  const inProgress = filtered.filter(m => m.status === "in_progress").length;
  const archived = filtered.filter(m => m.status === "archived").length;
  const overdue = filtered.filter(m => isOverdue(m)).length;
  const pending = filtered.filter(m => m.status === "pending").length;
  const processed = filtered.filter(m => m.status === "processed").length;
  const urgent = filtered.filter(m => m.priority === "urgent").length;
  const avgStepAll = filtered.length > 0 ? (filtered.reduce((s, m) => s + (m.current_step || 1), 0) / filtered.length).toFixed(1) : "—";

  // Chart data
  const stepDistribution = WORKFLOW_STEPS.map(s => ({
    name: `É${s.step}`,
    fullName: s.name,
    value: filtered.filter(m => (m.current_step || 1) === s.step && m.status !== "archived").length,
  }));

  const priorityDistribution = [
    { name: "Faible", value: filtered.filter(m => m.priority === "low").length, color: "hsl(var(--muted-foreground))" },
    { name: "Normal", value: filtered.filter(m => m.priority === "normal").length, color: "hsl(199,89%,48%)" },
    { name: "Élevée", value: filtered.filter(m => m.priority === "high").length, color: "hsl(38,92%,50%)" },
    { name: "Urgent", value: filtered.filter(m => m.priority === "urgent").length, color: "hsl(0,84%,60%)" },
  ];

  const COLORS = ["hsl(199,89%,48%)", "hsl(270,60%,55%)", "hsl(38,92%,50%)", "hsl(152,69%,40%)", "hsl(0,84%,60%)", "hsl(190,80%,45%)", "hsl(215,28%,50%)", "hsl(25,90%,55%)", "hsl(320,60%,50%)"];

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterStep("all");
    setFilterUser("all");
    setFilterPriority("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Tableau de Suivi</h1>
          <p className="page-description">Vue d'ensemble de tous les dossiers et leur progression</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowStats(!showStats)}>
          <BarChart3 className="h-4 w-4 mr-1" />
          {showStats ? "Masquer" : "Afficher"} stats
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total", value: totalMails, icon: BarChart3, cls: "text-primary bg-primary/10" },
          { label: "En attente", value: pending, icon: Clock, cls: "text-warning bg-warning/10" },
          { label: "En cours", value: inProgress, icon: TrendingUp, cls: "text-info bg-info/10" },
          { label: "En retard", value: overdue, icon: AlertTriangle, cls: "text-destructive bg-destructive/10" },
          { label: "Traités", value: processed, icon: CheckCircle, cls: "text-success bg-success/10" },
          { label: "Archivés", value: archived, icon: Archive, cls: "text-muted-foreground bg-muted" },
          { label: "Urgents", value: urgent, icon: TrendingDown, cls: "text-destructive bg-destructive/10" },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="p-3 flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${card.cls}`}>
                <card.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none">{card.value}</p>
                <p className="text-[10px] text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {showStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Distribution par étape</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stepDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" className="text-[10px]" />
                  <YAxis className="text-[10px]" />
                  <Tooltip formatter={(value: number, name: string, props: any) => [value, props.payload.fullName]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {stepDistribution.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Répartition par priorité</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={priorityDistribution.filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                      {priorityDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {priorityDistribution.map(d => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>{d.name}: <strong>{d.value}</strong></span>
                    </div>
                  ))}
                  <div className="pt-2 border-t text-xs text-muted-foreground">
                    Étape moy.: <strong>{avgStepAll}</strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Rechercher par objet, expéditeur, référence..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="processed">Traité</SelectItem>
                <SelectItem value="archived">Archivé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStep} onValueChange={setFilterStep}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Étape" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes étapes</SelectItem>
                {WORKFLOW_STEPS.map(s => (
                  <SelectItem key={s.step} value={String(s.step)}>É{s.step}: {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priorité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="low">Faible</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Élevée</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Utilisateur" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous utilisateurs</SelectItem>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-1", dateFrom && "text-primary")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yy") : "Du"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-1", dateTo && "text-primary")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM/yy") : "Au"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" onClick={clearFilters}>Réinitialiser</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Objet</TableHead>
                <TableHead>Expéditeur</TableHead>
                <TableHead>Étape</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Assigné à</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="w-8"><Paperclip className="h-3.5 w-3.5" /></TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Aucun dossier trouvé</TableCell></TableRow>
              ) : (
                filtered.map(mail => {
                  const overdueH = getOverdueHours(mail);
                  const isCritical = overdueH > 72;
                  const isWarning = overdueH > 0 && overdueH <= 72;

                  return (
                    <TableRow key={mail.id} className={isCritical ? "bg-destructive/8" : isWarning ? "bg-warning/5" : ""}>
                      <TableCell className="font-mono text-xs">{mail.reference_number}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{mail.subject}</TableCell>
                      <TableCell className="text-sm">{mail.sender_name}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(mail.current_step || 1)}`}>
                          {getStepLabel(mail.current_step || 1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[mail.status] || ""}`}>
                          {statusLabels[mail.status] || mail.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${mail.priority === "urgent" ? "bg-destructive/10 text-destructive border-destructive/30" : mail.priority === "high" ? "bg-warning/10 text-warning border-warning/30" : ""}`}>
                          {priorityLabels[mail.priority] || mail.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{mail.assigned_agent_id ? getProfileName(mail.assigned_agent_id) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {mail.deadline_at ? (
                          <span className={isOverdue(mail) ? "text-destructive font-medium" : ""}>
                            {isOverdue(mail) && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                            {format(new Date(mail.deadline_at), "dd/MM HH:mm")}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {isOverdue(mail) ? (
                          isCritical ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-bold whitespace-nowrap">🚨 Critique +{overdueH}h</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium whitespace-nowrap">⚠️ +{overdueH}h</span>
                          )
                        ) : (
                          <span className="text-[10px] text-muted-foreground">OK</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(mail.created_at), "dd/MM/yy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedMail(mail)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEditDelete && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setEditMail(mail)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteMail(mail)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMail} onOpenChange={(open) => !open && setSelectedMail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Détails du dossier — {selectedMail?.reference_number}
            </DialogTitle>
          </DialogHeader>
          {selectedMail && (
            <div className="space-y-4">
              <WorkflowStepper currentStep={selectedMail.current_step || 1} />
              <MailDetailFields mail={selectedMail} getProfileName={getProfileName} />
              <TreatmentsList mailId={selectedMail.id} />
              <Step4ContextPanel mailId={selectedMail.id} />
              <div className="p-3 rounded-lg border bg-muted/20">
                <h4 className="text-sm font-semibold mb-2">Historique du workflow</h4>
                <WorkflowTimeline mailId={selectedMail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editMail && (
        <MailEditDialog
          mail={editMail}
          open={!!editMail}
          onOpenChange={(open) => !open && setEditMail(null)}
          onSaved={() => { setEditMail(null); fetchData(); }}
        />
      )}

      {/* Delete Dialog */}
      {deleteMail && (
        <MailDeleteDialog
          mail={deleteMail}
          open={!!deleteMail}
          onOpenChange={(open) => !open && setDeleteMail(null)}
          onDeleted={() => { setDeleteMail(null); setSelectedMail(null); fetchData(); }}
        />
      )}
    </div>
  );
}
