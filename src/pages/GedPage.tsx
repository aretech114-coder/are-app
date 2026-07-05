import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Download } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { toast } from "sonner";

interface GedDocumentRow {
  id: string;
  mail_id: string;
  reference_number: string | null;
  sender_name: string | null;
  file_name: string;
  pdf_storage_path: string;
  file_size_bytes: number | null;
  generated_at: string;
}

export default function GedPage() {
  const { settings } = useSiteSettings();
  const { can } = useRolePermissions();
  const [documents, setDocuments] = useState<GedDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const moduleEnabled = settings.ged_module_enabled === "true";
  const canView = moduleEnabled && (can("archives", "view") || can("integrations", "view"));
  const canDownload = can("archives", "download");

  const fetchDocuments = useCallback(async () => {
    if (!moduleEnabled) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ged_documents")
        .select("id, mail_id, reference_number, sender_name, file_name, pdf_storage_path, file_size_bytes, generated_at")
        .order("generated_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setDocuments((data ?? []) as GedDocumentRow[]);
    } catch (err) {
      console.error("fetch ged_documents:", err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [moduleEnabled]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) =>
        d.reference_number?.toLowerCase().includes(q) ||
        d.sender_name?.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q),
    );
  }, [documents, search]);

  const downloadPdf = async (doc: GedDocumentRow) => {
    if (!canDownload) {
      toast.error("Téléchargement non autorisé");
      return;
    }
    const { data, error } = await supabase.storage
      .from("ged-documents")
      .createSignedUrl(doc.pdf_storage_path, 120);

    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Impossible de générer le lien");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (!moduleEnabled) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="page-header">Gestion documentaire (GED)</h1>
        <p className="text-muted-foreground text-sm">
          Le module GED n&apos;est pas activé. Activez-le depuis Intégrations &amp; Modules.
        </p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="page-header">Gestion documentaire (GED)</h1>
        <p className="text-muted-foreground text-sm">Accès non autorisé.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Gestion documentaire (GED)
        </h1>
        <p className="page-description">
          Dossiers PDF consolidés générés à l&apos;archivage des courriers
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher par référence, expéditeur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun dossier GED pour le moment.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Expéditeur</TableHead>
                <TableHead>Fichier</TableHead>
                <TableHead>Généré le</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-mono text-xs">{doc.reference_number}</TableCell>
                  <TableCell>{doc.sender_name}</TableCell>
                  <TableCell className="text-xs truncate max-w-[200px]">{doc.file_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(doc.generated_at), "dd MMM yyyy HH:mm", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    {canDownload && (
                      <Button size="sm" variant="ghost" onClick={() => downloadPdf(doc)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
