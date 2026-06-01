import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MailContribution = {
  id: string;
  mail_id: string;
  user_id: string;
  step_number: number;
  body: string | null;
  attachment_urls: { url: string; name?: string }[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  profile?: { full_name: string; email: string };
};

export function useMailContributions(mailId: string | undefined, stepNumber = 4) {
  const [contributions, setContributions] = useState<MailContribution[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContributions = useCallback(async () => {
    if (!mailId) {
      setContributions([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("mail_contributions")
      .select("*")
      .eq("mail_id", mailId)
      .eq("step_number", stepNumber)
      .order("updated_at", { ascending: true });

    if (error) {
      console.error("mail_contributions:", error.message);
      setContributions([]);
      setLoading(false);
      return;
    }

    const rows = data || [];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    let profileMap = new Map<string, { full_name: string; email: string }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    setContributions(
      rows.map((r) => ({
        ...r,
        attachment_urls: (r.attachment_urls as MailContribution["attachment_urls"]) || [],
        profile: profileMap.get(r.user_id),
      }))
    );
    setLoading(false);
  }, [mailId, stepNumber]);

  useEffect(() => {
    fetchContributions();
  }, [fetchContributions]);

  const upsertMyContribution = async (
    userId: string,
    body: string,
    attachmentUrls: { url: string; name?: string }[] = [],
    status: "draft" | "submitted" = "draft"
  ) => {
    if (!mailId) return { error: "missing mail" };
    const { error } = await supabase.from("mail_contributions").upsert(
      {
        mail_id: mailId,
        user_id: userId,
        step_number: stepNumber,
        body,
        attachment_urls: attachmentUrls,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mail_id,user_id,step_number" }
    );
    if (!error) await fetchContributions();
    return { error: error?.message };
  };

  return { contributions, loading, fetchContributions, upsertMyContribution };
}
