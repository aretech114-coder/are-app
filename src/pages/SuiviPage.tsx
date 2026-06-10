import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkflowTrackingAccess } from "@/hooks/useWorkflowTrackingAccess";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { MailDossierView } from "@/components/MailDossierView";
import { useMailCircuitLabel } from "@/hooks/useMailCircuitLabel";
import { useMailContributions, useStepAssigneeCount } from "@/hooks/useMailContributions";
import { shouldShowContributionsPanel } from "@/lib/workflow-display";
import { MailEditDialog, MailDeleteDialog } from "@/components/MailEditDialog";
import { getStepLabel, getStepColor, WORKFLOW_STEPS, listMyMails } from "@/lib/workflow-engine";
import {
  DEFAULT_TRACKING_STATUSES,
  fetchTrackingMails,
  fetchTrackingSummary,
  type TrackingMail,
  type TrackingSummary,
} from "@/lib/workflow-tracking";
import { Search, CalendarIcon, Eye, AlertTriangle, Clock, CheckCircle, Archive, BarChart3, Pencil, Trash2, TrendingUp, TrendingDown, Paperclip } from "lucide-react";
import { AttachmentIndicator } from "@/components/AttachmentViewer";
import { getMailAttachmentUrls } from "@/lib/labels";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

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

const COLORS = ["hsl(199,89%,48%)", "hsl(270,60%,55%)", "hsl(38,92%,50%)", "hsl(152,69%,40%)", "hsl(0,84%,60%)", "hsl(190,80%,45%)", "hsl(215,28%,50%)", "hsl(25,90%,55%)", "hsl(320,60%,50%)"];

export default function SuiviPage() {
  const { role, hasPermission } = useAuth();
  const { hasGlobalTracking, loading: trackingAccessLoading } = useWorkflowTrackingAccess();

  const [mails, setMails] = useState<TrackingMail[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStep, setFilterStep] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [quickOverdue, setQuickOverdue] = useState(false);
  const [quickUrgent, setQuickUrgent] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [selectedMail, setSelectedMail] = useState<TrackingMail | null>(null);
  const { contributions: detailContributions } = useMailContributions(selectedMail?.id, 4);
  const detailStep4AssigneeCount = useStepAssigneeCount(selectedMail?.id, 4);
  const { data: circuitLabel } = useMailCircuitLabel(selectedMail?.target_service_id);
  const [editMail, setEditMail] = useState<TrackingMail | null>(null);
  const [deleteMail, setDeleteMail] = useState<TrackingMail | null>(null);
  const [showStats, setShowStats] = useState(true);

  const canEditDelete =
    !hasGlobalTracking &&
    (role === "superadmin" || (role === "admin" && hasPermission("manage_mail_entries")));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    hasGlobalTracking,
    debouncedSearch,
    filterStatus,
    filterStep,
    filterPriority,
    includeArchived,
    quickOverdue,
    quickUrgent,
    pageSize,
  ]);

  const trackingFilters = useMemo(() => {
    let statuses: string[];
    if (filterStatus !== "all") {
      statuses = [filterStatus];
    } else if (includeArchived) {
      statuses = [...DEFAULT_TRACKING_STATUSES, "archived"];
    } else {
      statuses = [...DEFAULT_TRACKING_STATUSES];
    }

    return {
      statuses,
      step: filterStep !== "all" ? Number(filterStep) : null,
      priority:
        quickUrgent ? "urgent" : filterPriority !== "all" ? filterPriority : null,
      overdueOnly: quickOverdue,
      search: debouncedSearch || null,
    };
  }, [
    filterStatus,
    filterStep,
    filterPriority,
    includeArchived,
    quickOverdue,
    quickUrgent,
    debouncedSearch,
  ]);

  const fetchRestrictedData = useCallback(async () => {
    setLoading(true);
    const [mailsData, { data: profilesData }] = await Promise.all([
      listMyMails(["pending", "in_progress", "processed", "archived"]),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    setMails(mailsData || []);
    setProfiles(profilesData || []);
    setLoading(false);
  }, []);

  const fetchGlobalData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ mails: pageMails, total }, summaryData, { data: profilesData }] = await Promise.all([
        fetchTrackingMails(trackingFilters, page, pageSize),
        fetchTrackingSummary(trackingFilters),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      setMails(pageMails);
      setTotalCount(total);
      setSummary(summaryData);
      setProfiles(profilesData || []);
    } catch (err) {
      console.error("fetchGlobalData failed:", err);
      setMails([]);
      setTotalCount(0);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [trackingFilters, page, pageSize]);

  useEffect(() => {
    if (trackingAccessLoading) return;
    if (hasGlobalTracking) {
      fetchGlobalData();
    } else {
      fetchRestrictedData();
    }
  }, [trackingAccessLoading, hasGlobalTracking, fetchGlobalData, fetchRestrictedData]);

  const refreshData = () => {
    if (hasGlobalTracking) fetchGlobalData();
    else fetchRestrictedData();
  };

  const getProfileName = (id: string) => profiles.find((p) => p.id === id)?.full_name || "—";
  const isOverdue = (mail: TrackingMail) =>
    mail.deadline_at && new Date(mail.deadline_at) < new Date() && mail.status !== "archived";

  const getOverdueHours = (mail: TrackingMail) => {
    if (!mail.deadline_at) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(mail.deadline_at).getTime()) / (1000 * 60 * 60)));
  };

  const filtered = useMemo(() => {
    if (hasGlobalTracking) return mails;

    return mails.filter((m) => {
      if (
        search &&
        !(
          m.subject?.toLowerCase().includes(search.toLowerCase()) ||
          m.sender_name?.toLowerCase().includes(search.toLowerCase()) ||
          m.reference_number?.toLowerCase().includes(search.toLowerCase())
        )
      ) {
        return false;
      }
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      if (filterStep !== "all" && String(m.current_step) !== filterStep) return false;
      if (filterUser !== "all" && m.assigned_agent_id !== filterUser && m.registered_by !== filterUser) {
        return false;
      }
      if (filterPriority !== "all" && m.priority !== filterPriority) return false;
      if (dateFrom && new Date(m.created_at) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59);
        if (new Date(m.created_at) > end) return false;
      }
      return true;
    });
  }, [hasGlobalTracking, mails, search, filterStatus, filterStep, filterUser, filterPriority, dateFrom, dateTo]);

  const totalMails = hasGlobalTracking ? (summary?.total ?? totalCount) : filtered.length;
  const pending = hasGlobalTracking
    ? (summary?.by_status?.pending ?? 0)
    : filtered.filter((m) => m.status === "pending").length;
  const inProgress = hasGlobalTracking
    ? (summary?.by_status?.in_progress ?? 0)
    : filtered.filter((m) => m.status === "in_progress").length;
  const processed = hasGlobalTracking
    ? (summary?.by_status?.processed ?? 0)
    : filtered.filter((m) => m.status === "processed").length;
  const archived = hasGlobalTracking
    ? (summary?.by_status?.archived ?? 0)
    : filtered.filter((m) => m.status === "archived").length;
  const overdue = hasGlobalTracking
    ? (summary?.overdue ?? 0)
    : filtered.filter((m) => isOverdue(m)).length;
  const urgent = hasGlobalTracking
    ? (summary?.urgent ?? 0)
    : filtered.filter((m) => m.priority === "urgent").length;

  const stepDistribution = WORKFLOW_STEPS.map((s) => ({
    name: `É${s.step}`,
    fullName: s.name,
    value: hasGlobalTracking
      ? (summary?.by_step?.[String(s.step)] ?? 0)
      : filtered.filter((m) => (m.current_step || 1) === s.step && m.status !== "archived").length,
  }));

  const priorityDistribution = [
    {
      name: "Faible",
      value: hasGlobalTracking
        ? (summary?.by_priority?.low ?? 0)
        : filtered.filter((m) => m.priority === "low").length,
      color: "hsl(var(--muted-foreground))",
    },
    {
      name: "Normal",
      value: hasGlobalTracking
        ? (summary?.by_priority?.normal ?? 0)
        : filtered.filter((m) => m.priority === "normal").length,
      color: "hsl(199,89%,48%)",
    },
    {
      name: "Élevée",
      value: hasGlobalTracking
        ? (summary?.by_priority?.high ?? 0)
        : filtered.filter((m) => m.priority === "high").length,
      color: "hsl(38,92%,50%)",
    },
    {
      name: "Urgent",
      value: hasGlobalTracking
        ? (summary?.by_priority?.urgent ?? 0)
        : filtered.filter((m) => m.priority === "urgent").length,
      color: "hsl(0,84%,60%)",
    },
  ];

  const avgStepAll =
    filtered.length > 0
      ? (filtered.reduce((s, m) => s + (m.current_step || 1), 0) / filtered.length).toFixed(1)
      : "—";

  const totalPages = Math.max(1, Math.ceil((hasGlobalTracking ? totalCount : filtered.length) / pageSize));
  const displayRows = hasGlobalTracking ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const rangeTotal = hasGlobalTracking ? totalCount : filtered.length;
  const rangeStart = rangeTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, rangeTotal);

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterStep("all");
    setFilterUser("all");
    setFilterPriority("all");
    setIncludeArchived(false);
    setQuickOverdue(false);
    setQuickUrgent(false);
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const paginationItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const items: (number | "ellipsis")[] = [1];
    if (page > 3) items.push("ellipsis");
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
      items.push(p);
    }
    if (page < totalPages - 2) items.push("ellipsis");
    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Tableau de Suivi</h1>
          <p className="page-description">
            {hasGlobalTracking
              ? "Vue globale workflow — consultation de tous les courriers actifs"
              : "Vue de vos dossiers — progression des courriers qui vous concernent"}
          </p>
          <Badge variant="outline" className="mt-2 text-xs">
            {hasGlobalTracking ? "Vue globale workflow" : "Vue de vos dossiers"}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowStats(!showStats)}>
          <BarChart3 className="h-4 w-4 mr-1" />
          {showStats ? "Masquer" : "Afficher"} stats
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total", value: totalMails, icon: BarChart3, cls: "text-primary bg-primary/10" },
          { label: "En attente", value: pending, icon: Clock, cls: "text-warning bg-warning/10" },
          { label: "En cours", value: inProgress, icon: TrendingUp, cls: "text-info bg-info/10" },
          { label: "En retard", value: overdue, icon: AlertTriangle, cls: "text-destructive bg-destructive/10" },
          { label: "Traités", value: processed, icon: CheckCircle, cls: "text-success bg-success/10" },
          { label: "Archivés", value: archived, icon: Archive, cls: "text-muted-foreground bg-muted" },
          { label: "Urgents", value: urgent, icon: TrendingDown, cls: "text-destructive bg-destructive/10" },
        ].map((card) => (
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
                  <Tooltip formatter={(value: number, _name: string, props: { payload?: { fullName?: string } }) => [value, props.payload?.fullName]} />
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
                    <Pie
                      data={priorityDistribution.filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {priorityDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {priorityDistribution.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>
                        {d.name}: <strong>{d.value}</strong>
                      </span>
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

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={quickOverdue ? "default" : "outline"}
              onClick={() => {
                setQuickOverdue((v) => !v);
                if (!quickOverdue) setQuickUrgent(false);
              }}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              En retard
            </Button>
            <Button
              type="button"
              size="sm"
              variant={quickUrgent ? "default" : "outline"}
              onClick={() => {
                setQuickUrgent((v) => !v);
                if (!quickUrgent) {
                  setQuickOverdue(false);
                  setFilterPriority("all");
                }
              }}
            >
              Urgent
            </Button>
            {hasGlobalTracking && (
              <div className="flex items-center gap-2 ml-auto">
                <Switch
                  id="include-archived"
                  checked={includeArchived}
                  onCheckedChange={setIncludeArchived}
                />
                <Label htmlFor="include-archived" className="text-sm cursor-pointer">
                  Inclure archivés
                </Label>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par objet, expéditeur, référence..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="processed">Traité</SelectItem>
                <SelectItem value="archived">Archivé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStep} onValueChange={setFilterStep}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Étape" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes étapes</SelectItem>
                {WORKFLOW_STEPS.map((s) => (
                  <SelectItem key={s.step} value={String(s.step)}>
                    É{s.step}: {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterPriority}
              onValueChange={(v) => {
                setFilterPriority(v);
                if (v !== "all") setQuickUrgent(false);
              }}
              disabled={quickUrgent}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="low">Faible</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Élevée</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            {!hasGlobalTracking && (
              <>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Utilisateur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous utilisateurs</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
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
              </>
            )}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <TableHead className="w-8">
                  <Paperclip className="h-3.5 w-3.5" />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || trackingAccessLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    Chargement...
                  </TableCell>
                </TableRow>
              ) : displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    Aucun dossier trouvé
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((mail) => {
                  const overdueH = getOverdueHours(mail);
                  const isCritical = overdueH > 72;
                  const isWarning = overdueH > 0 && overdueH <= 72;

                  return (
                    <TableRow
                      key={mail.id}
                      className={isCritical ? "bg-destructive/8" : isWarning ? "bg-warning/5" : ""}
                    >
                      <TableCell className="font-mono text-xs">{mail.reference_number}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{mail.subject}</TableCell>
                      <TableCell className="text-sm">{mail.sender_name}</TableCell>
                      <TableCell>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getStepColor(mail.current_step || 1)}`}
                        >
                          {getStepLabel(mail.current_step || 1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[mail.status] || ""}`}>
                          {statusLabels[mail.status] || mail.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            mail.priority === "urgent"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : mail.priority === "high"
                                ? "bg-warning/10 text-warning border-warning/30"
                                : ""
                          }`}
                        >
                          {priorityLabels[mail.priority] || mail.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {mail.assigned_agent_id ? getProfileName(mail.assigned_agent_id) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {mail.deadline_at ? (
                          <span className={isOverdue(mail) ? "text-destructive font-medium" : ""}>
                            {isOverdue(mail) && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                            {format(new Date(mail.deadline_at), "dd/MM HH:mm")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {isOverdue(mail) ? (
                          isCritical ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-bold whitespace-nowrap">
                              🚨 Critique +{overdueH}h
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium whitespace-nowrap">
                              ⚠️ +{overdueH}h
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-muted-foreground">OK</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <AttachmentIndicator hasAttachment={getMailAttachmentUrls(mail).length > 0} />
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteMail(mail)}
                                className="text-destructive hover:text-destructive"
                              >
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

      {(hasGlobalTracking || filtered.length > pageSize) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {rangeTotal === 0
              ? "Aucun dossier à afficher"
              : `Affichage ${rangeStart}–${rangeEnd} sur ${rangeTotal} dossier${rangeTotal > 1 ? "s" : ""}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Par page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v) as PageSize)}
              >
                <SelectTrigger className="w-[80px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.max(1, p - 1));
                      }}
                      className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  {paginationItems.map((item, idx) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          href="#"
                          isActive={page === item}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(item);
                          }}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.min(totalPages, p + 1));
                      }}
                      className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!selectedMail} onOpenChange={(open) => !open && setSelectedMail(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Détails du dossier — {selectedMail?.reference_number}
              {hasGlobalTracking && (
                <Badge variant="secondary" className="text-xs font-normal ml-2">
                  Lecture seule
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedMail && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <MailDossierView
                mail={selectedMail}
                role={role}
                getProfileName={getProfileName}
                circuitLabel={circuitLabel ?? null}
                showContributionsPanel={shouldShowContributionsPanel(
                  selectedMail.current_step || 0,
                  role,
                  hasGlobalTracking
                )}
                contributions={detailContributions}
                step4AssigneeCount={detailStep4AssigneeCount}
                defaultStepperCollapsed={false}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editMail && (
        <MailEditDialog
          mail={editMail}
          open={!!editMail}
          onOpenChange={(open) => !open && setEditMail(null)}
          onSaved={() => {
            setEditMail(null);
            refreshData();
          }}
        />
      )}

      {deleteMail && (
        <MailDeleteDialog
          mail={deleteMail}
          open={!!deleteMail}
          onOpenChange={(open) => !open && setDeleteMail(null)}
          onDeleted={() => {
            setDeleteMail(null);
            setSelectedMail(null);
            refreshData();
          }}
        />
      )}
    </div>
  );
}
