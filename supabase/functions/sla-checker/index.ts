import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find overdue mails (deadline passed, not archived/processed)
    const { data: overdueMails, error } = await supabase
      .from("mails")
      .select("id, subject, reference_number, assigned_agent_id, current_step, deadline_at")
      .lt("deadline_at", now)
      .not("status", "in", '("archived","processed")')
      .order("deadline_at", { ascending: true });

    if (error) throw error;

    if (!overdueMails || overdueMails.length === 0) {
      return new Response(JSON.stringify({ message: "No overdue mails found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Ministre and DirCab users for dashboard notifications
    const { data: leaderRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["ministre", "dircab"]);

    const leaderUserIds = leaderRoles?.map(r => r.user_id) || [];

    let notificationsCreated = 0;

    for (const mail of overdueMails) {
      // Check if we already sent a notification for this mail today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: existingNotif } = await supabase
        .from("notifications")
        .select("id")
        .eq("mail_id", mail.id)
        .eq("title", "⚠️ Alerte SLA — Retard de traitement")
        .gte("created_at", todayStart.toISOString())
        .limit(1);

      if (existingNotif && existingNotif.length > 0) continue;

      // Notify assigned agent
      if (mail.assigned_agent_id) {
        await supabase.from("notifications").insert({
          user_id: mail.assigned_agent_id,
          title: "⚠️ Alerte SLA — Retard de traitement",
          message: `Le courrier "${mail.subject}" (Réf: ${mail.reference_number}) a dépassé son délai de traitement.`,
          mail_id: mail.id,
        });
        notificationsCreated++;
      }

      // Notify leaders (Ministre + DirCab)
      for (const leaderId of leaderUserIds) {
        if (leaderId !== mail.assigned_agent_id) {
          await supabase.from("notifications").insert({
            user_id: leaderId,
            title: "⚠️ Alerte SLA — Retard de traitement",
            message: `Le courrier "${mail.subject}" (Réf: ${mail.reference_number}) est en retard à l'étape ${mail.current_step}.`,
            mail_id: mail.id,
          });
          notificationsCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `SLA check complete`,
        overdue_count: overdueMails.length,
        notifications_created: notificationsCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});