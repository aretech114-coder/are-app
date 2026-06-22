import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Archive, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { listMyMails } from "@/lib/workflow-engine";
import { fetchTrackingMails } from "@/lib/workflow-tracking";
import { useWorkflowTrackingAccess } from "@/hooks/useWorkflowTrackingAccess";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { MailArchiveDialog } from "@/components/MailArchiveDialog";
import { AttachmentIndicator } from "@/components/AttachmentViewer";
import { getMailAttachmentUrls } from "@/lib/labels";

const priorityLabels: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

export default function ArchivePage() {
  const { hasGlobalTracking } = useWorkflowTrackingAccess();
  const { can } = useRolePermissions();
  const [mails, setMails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedMail, setSelectedMail] = useState<any | null>(null);

  const canView = can("archives", "view");
  const canDownload = can("archives", "download");

  const fetchArchive = useCallback(async () => {
    setLoading(true);
    try {
      let data: any[] = [];
      if (hasGlobalTracking) {
        const result = await fetchTrackingMails(
          { statuses: ["archived"], search: search.trim() || null },
          1,
          500
        );
        data = result.mails;
      } else {
        data = await listMyMails(["archived"]);
      }
      setMails(data.filter((m) => m.status === "archived"));
    } catch (err) {
      console.error("fetchArchive failed:", err);
      setMails([]);
    } finally {
      setLoading(false);
    }
  }, [hasGlobalTracking, search]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      setMails([]);
      return;
    }
    const timer = setTimeout(fetchArchive, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [canView, fetchArchive, search]);

  const filtered = useMemo(() => {
    return mails.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        m.subject?.toLowerCase().includes(q) ||
        m.sender_name?.toLowerCase().includes(q) ||
        m.reference_number?.toLowerCase().includes(q) ||
        m.qr_code_data?.toLowerCase().includes(q);
      const matchPriority = priorityFilter === "all" || m.priority === priorityFilter;
      return matchSearch && matchPriority;
    });
  }, [mails, search, priorityFilter]);

  const openMail = (mail: any) => {
    setSelectedMail(mail);
  };

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6">
          <h1 className="page-header">Archives Centrales</h1>
          <p className="page-description text-muted-foreground">
            Vous n&apos;avez pas accès aux archives centrales.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="page-header">Archives Centrales</h1>
        <p className="page-description">Répertoire des courriers archivés — consultation en lecture seule</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par expéditeur, référence, QR code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priorité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="low">Basse</SelectItem>
            <SelectItem value="normal">Normale</SelectItem>
            <SelectItem value="high">Haute</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Expéditeur</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>PJ</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Aucun courrier archivé accessible
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openMail(m)}
                >
                  <TableCell className="font-mono text-xs">{m.reference_number}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[240px] truncate">{m.subject}</TableCell>
                  <TableCell className="text-sm">{m.sender_name}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        m.priority === "urgent"
                          ? "bg-destructive/10 text-destructive"
                          : m.priority === "high"
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {priorityLabels[m.priority] || m.priority}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AttachmentIndicator hasAttachment={getMailAttachmentUrls(m).length > 0} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(m.created_at), "dd/MM/yyyy", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMail(m);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <MailArchiveDialog
        mail={selectedMail}
        open={!!selectedMail}
        onOpenChange={(open) => !open && setSelectedMail(null)}
        allowDownload={canDownload}
      />
    </div>
  );
}
