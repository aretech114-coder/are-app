import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Paperclip, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Treatment {
  authorName: string;
  content: string;
  attachmentUrl: string | null;
  documentType: string | null;
}

export function TreatmentsList({ mailId }: { mailId: string }) {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTreatments();
  }, [mailId]);

  const fetchTreatments = async () => {
    setLoading(true);

    // Get step 4 transitions (both submit_treatment and complete with step 4)
    const { data: transitions } = await supabase
      .from("workflow_transitions")
      .select("performed_by, notes, action")
      .eq("mail_id", mailId)
      .in("action", ["submit_treatment", "complete"])
      .order("created_at", { ascending: true });

    if (!transitions || transitions.length === 0) {
      setLoading(false);
      return;
    }

    // Filter only step 4 related transitions (from_step = 4)
    const { data: allTransitions } = await supabase
      .from("workflow_transitions")
      .select("performed_by, notes, action, from_step")
      .eq("mail_id", mailId)
      .eq("from_step", 4)
      .order("created_at", { ascending: true });

    if (!allTransitions || allTransitions.length === 0) {
      setLoading(false);
      return;
    }

    // Filter out the "all completed" auto-transition
    const personalSubmissions = allTransitions.filter(
      t => t.notes && !t.notes.startsWith("✅")
    );

    // Get unique performer IDs
    const performerIds = [...new Set(personalSubmissions.map(t => t.performed_by))];
    
    // Fetch profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", performerIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    // Parse each submission
    const parsed: Treatment[] = personalSubmissions.map(t => {
      const notes = t.notes || "";
      
      // Extract attachment URL
      const attachMatch = notes.match(/📎 Document joint: (.+?)(?:\n|$)/);
      const attachmentUrl = attachMatch ? attachMatch[1].trim() : null;

      // Extract document type
      const typeMatch = notes.match(/📄 Type de document: (.+?)(?:\n|$)/);
      const documentType = typeMatch ? typeMatch[1].trim() : null;

      // Extract content
      const contentMatch = notes.match(/📋 Contenu:\n([\s\S]*?)(?:\n💬|$)/);
      const content = contentMatch ? contentMatch[1].trim() : "";

      return {
        authorName: profileMap.get(t.performed_by) || "Conseiller",
        content,
        attachmentUrl,
        documentType,
      };
    });

    setTreatments(parsed.filter(t => t.content));
    setLoading(false);
  };

  if (loading) return null;
  if (treatments.length === 0) return null;

  return (
    <div className="p-4 rounded-lg bg-accent border space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        Traitement(s) soumis
      </h4>
      {treatments.map((t, idx) => (
        <div key={idx} className="p-3 rounded-lg bg-background/50 border space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1">
            <User className="h-3 w-3" />
            {t.authorName}
            {t.documentType && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                {t.documentType}
              </span>
            )}
          </p>
          <p className="text-sm whitespace-pre-wrap">{t.content}</p>
          {t.attachmentUrl && (
            <div className="flex items-center gap-2 p-2 rounded border bg-muted/30">
              <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs truncate flex-1">Pièce jointe</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <a href={t.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir
                </a>
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
