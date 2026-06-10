import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ScrollText, Search, Download, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableUserSingleSelect } from "@/components/SearchableUserPicker";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/labels";
import {
  ACTIONS_BY_CATEGORY,
  AUDIT_CATEGORIES,
  AuditEvent,
  AuditFilters,
  auditEventsToCsv,
  fetchAuditEvents,
  fetchAuditEventsForExport,
  formatAuditSummary,
  getActionLabel,
  getCategoryLabel,
} from "@/lib/audit-log";

type PageSize = 25 | 50 | 100;
const PAGE_SIZE_OPTIONS: PageSize[] = [25, 50, 100];

const categoryBadgeVariant = (category: string) => {
  switch (category) {
    case "user":
      return "destructive" as const;
    case "workflow":
      return "default" as const;
    case "registry":
      return "secondary" as const;
    case "email":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [filters, setFilters] = useState<AuditFilters>({
    datePreset: "30d",
    category: "all",
    action: "",
    actorUserId: "",
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["audit-actor-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const actorNameById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      map.set(u.id, u.full_name || u.email || u.id);
    });
    return map;
  }, [users]);

  const actionOptions = useMemo(() => {
    if (filters.category === "all") {
      return Object.values(ACTIONS_BY_CATEGORY).flat();
    }
    return ACTIONS_BY_CATEGORY[filters.category] ?? [];
  }, [filters.category]);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["audit-events", filters, page, pageSize],
    queryFn: () => fetchAuditEvents(filters, page, pageSize),
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("ellipsis");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAuditEventsForExport(filters, 1000);
      const csv = auditEventsToCsv(rows);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} événement(s) exporté(s)`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Export impossible");
    } finally {
      setExporting(false);
    }
  };

  const entityLink = (event: AuditEvent) => {
    if (event.entity_type === "mail" && event.entity_id) {
      return `/inbox?mail=${event.entity_id}`;
    }
    if (event.entity_type === "user" && event.entity_id) {
      return `/admin`;
    }
    return null;
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Journal d&apos;audit
          </h1>
          <p className="page-description">
            Historique des actions utilisateurs, workflow, registre et e-mails (super admin).
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Select
              value={filters.datePreset}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, datePreset: v as AuditFilters["datePreset"] }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 derniers jours</SelectItem>
                <SelectItem value="30d">30 derniers jours</SelectItem>
                <SelectItem value="90d">90 derniers jours</SelectItem>
                <SelectItem value="all">Toute la période</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.category}
              onValueChange={(v) =>
                setFilters((prev) => ({
                  ...prev,
                  category: v as AuditFilters["category"],
                  action: "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {AUDIT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.action || "__all__"}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, action: v === "__all__" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes actions</SelectItem>
                {actionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {getActionLabel(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher dans le résumé ou l'e-mail…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          <div className="max-w-md">
            <p className="text-xs text-muted-foreground mb-2">Filtrer par acteur</p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <SearchableUserSingleSelect
                  users={users}
                  value={filters.actorUserId}
                  onValueChange={(id) => setFilters((prev) => ({ ...prev, actorUserId: id }))}
                />
              </div>
              {filters.actorUserId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilters((prev) => ({ ...prev, actorUserId: "" }))}
                >
                  Effacer
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Chargement du journal…
            </div>
          ) : isError ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-destructive">{error instanceof Error ? error.message : "Erreur"}</p>
              <Button variant="outline" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              Aucun événement pour ces filtres.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Résumé</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const actorLabel = event.actor_user_id
                    ? actorNameById.get(event.actor_user_id) || event.actor_email
                    : event.actor_email || "Système";
                  return (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(event.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{actorLabel}</div>
                        {event.actor_email && (
                          <div className="text-xs text-muted-foreground">{event.actor_email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={categoryBadgeVariant(event.category)}>
                          {getCategoryLabel(event.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{getActionLabel(event.action)}</TableCell>
                      <TableCell className="text-sm max-w-md truncate">
                        {formatAuditSummary(event)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(event)}>
                          Détail
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "0 événement"
            : `${rangeStart}–${rangeEnd} sur ${total} événement(s)`}
          {isFetching && !isLoading ? " · actualisation…" : ""}
        </p>
        <div className="flex items-center gap-3">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as PageSize)}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {totalPages > 1 && (
            <Pagination>
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
                {pageNumbers.map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`e-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(p);
                        }}
                      >
                        {p}
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

      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle>{formatAuditSummary(selectedEvent)}</SheetTitle>
                <SheetDescription>
                  {format(new Date(selectedEvent.created_at), "EEEE d MMMM yyyy à HH:mm:ss", {
                    locale: fr,
                  })}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Acteur</p>
                  <p className="font-medium">
                    {selectedEvent.actor_user_id
                      ? actorNameById.get(selectedEvent.actor_user_id) || selectedEvent.actor_email
                      : selectedEvent.actor_email || "Système"}
                  </p>
                  {selectedEvent.actor_role && (
                    <p className="text-muted-foreground">
                      {ROLE_LABELS[selectedEvent.actor_role] ?? selectedEvent.actor_role}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Badge variant={categoryBadgeVariant(selectedEvent.category)}>
                    {getCategoryLabel(selectedEvent.category)}
                  </Badge>
                  <Badge variant="outline">{getActionLabel(selectedEvent.action)}</Badge>
                  <Badge variant="secondary">{selectedEvent.source}</Badge>
                </div>

                {selectedEvent.entity_type && (
                  <div>
                    <p className="text-muted-foreground">Entité</p>
                    <p>
                      {selectedEvent.entity_type}
                      {selectedEvent.entity_id ? ` · ${selectedEvent.entity_id}` : ""}
                    </p>
                    {entityLink(selectedEvent) && (
                      <Button variant="link" className="px-0 h-auto" asChild>
                        <a href={entityLink(selectedEvent)!}>
                          Ouvrir <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}

                {(selectedEvent.ip_address || selectedEvent.user_agent) && (
                  <div>
                    <p className="text-muted-foreground">Contexte requête</p>
                    {selectedEvent.ip_address && <p>IP : {selectedEvent.ip_address}</p>}
                    {selectedEvent.user_agent && (
                      <p className="text-xs break-all text-muted-foreground">{selectedEvent.user_agent}</p>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-muted-foreground mb-2">Métadonnées</p>
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-64">
                    {JSON.stringify(selectedEvent.metadata ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
