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
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;

    if (!isServiceRole) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Non autorisé" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await callerClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Non autorisé" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const userId = userData.user.id;
      const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).single();
      if (!roleData || !["superadmin", "admin"].includes(roleData.role)) {
        return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const nowIso = now.toISOString();

    // Find overdue mails (deadline passed, not archived/processed)
    const { data: overdueMails, error } = await supabase
      .from("mails")
      .select("id, subject, reference_number, assigned_agent_id, current_step, deadline_at, priority")
      .lt("deadline_at", nowIso)
      .not("status", "in", '("archived","processed")')
      .order("deadline_at", { ascending: true });

    if (error) throw error;
    if (!overdueMails || overdueMails.length === 0) {
      return new Response(JSON.stringify({ message: "No overdue mails found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: leaderRoles } = await supabase
      .from("user_roles").select("user_id, role").in("role", ["ministre", "dircab"]);
    const leaderUserIds = leaderRoles?.map(r => r.user_id) || [];

    let notificationsCreated = 0;
    let remindersCreated = 0;

    for (const mail of overdueMails) {
      // Step 4: Don't expire - send reminders every 48h to pending assignees
      if (mail.current_step === 4) {
        const { data: pendingAssignments } = await supabase
          .from("mail_assignments")
          .select("id, assigned_to, reminder_count, last_reminder_at")
          .eq("mail_id", mail.id)
          .eq("step_number", 4)
          .eq("status", "pending");

        if (pendingAssignments && pendingAssignments.length > 0) {
          for (const assignment of pendingAssignments) {
            // Check if 48h passed since last reminder (or first reminder)
            const lastReminder = assignment.last_reminder_at ? new Date(assignment.last_reminder_at) : null;
            const hoursSinceLastReminder = lastReminder
              ? (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60)
              : 999; // Force first reminder

            if (hoursSinceLastReminder >= 48 || (!lastReminder && assignment.reminder_count === 0)) {
              // Get assignee profile for email
              const { data: profile } = await supabase
                .from("profiles").select("full_name, email").eq("id", assignment.assigned_to).single();

              // Create notification
              const reminderNum = assignment.reminder_count + 1;
              const isUrgent = reminderNum >= 2;
              await supabase.from("notifications").insert({
                user_id: assignment.assigned_to,
                title: isUrgent
                  ? "🚨 RAPPEL CRITIQUE — Traitement en retard"
                  : "⚠️ Rappel — Traitement en retard",
                message: `Le courrier "${mail.subject}" (Réf: ${mail.reference_number}) attend votre traitement depuis le ${new Date(mail.deadline_at!).toLocaleDateString("fr-FR")}. Rappel n°${reminderNum}.`,
                mail_id: mail.id,
              });

              // Update reminder count
              await supabase.from("mail_assignments")
                .update({ reminder_count: reminderNum, last_reminder_at: nowIso })
                .eq("id", assignment.id);

              // Send email if profile has email
              if (profile?.email) {
                try {
                  await supabase.functions.invoke("send-notification-email", {
                    body: {
                      recipient_email: profile.email,
                      recipient_name: profile.full_name || "Utilisateur",
                      subject: isUrgent
                        ? `🚨 RAPPEL CRITIQUE — Traitement en retard (${mail.reference_number})`
                        : `⚠️ Rappel — Traitement en retard (${mail.reference_number})`,
                      body_html: buildReminderHtml(profile.full_name || "Utilisateur", mail, reminderNum, isUrgent),
                      mail_id: mail.id,
                      step_number: 4,
                      notification_type: "sla_alert",
                    },
                  });
                } catch (e) {
                  console.error("Email reminder error:", e);
                }
              }

              remindersCreated++;
            }
          }
        }
        continue; // Skip standard SLA notifications for step 4
      }

      // Standard SLA notifications for other steps
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: existingNotif } = await supabase
        .from("notifications").select("id")
        .eq("mail_id", mail.id)
        .eq("title", "⚠️ Alerte SLA — Retard de traitement")
        .gte("created_at", todayStart.toISOString())
        .limit(1);

      if (existingNotif && existingNotif.length > 0) continue;

      if (mail.assigned_agent_id) {
        await supabase.from("notifications").insert({
          user_id: mail.assigned_agent_id,
          title: "⚠️ Alerte SLA — Retard de traitement",
          message: `Le courrier "${mail.subject}" (Réf: ${mail.reference_number}) a dépassé son délai de traitement.`,
          mail_id: mail.id,
        });
        notificationsCreated++;
      }

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
        message: "SLA check complete",
        overdue_count: overdueMails.length,
        notifications_created: notificationsCreated,
        reminders_created: remindersCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildReminderHtml(name: string, mail: any, reminderNum: number, isUrgent: boolean): string {
  const urgentBanner = isUrgent
    ? `<div style="background:#dc2626;color:#fff;padding:12px 32px;font-weight:bold;font-size:14px;">🚨 RAPPEL CRITIQUE — Plus de 2 rappels envoyés</div>`
    : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="background:#1a1a2e;padding:24px 32px;">
    <h1 style="color:#fff;margin:0;font-size:20px;">${isUrgent ? "🚨 Rappel Critique" : "⚠️ Rappel de Traitement"}</h1>
  </div>
  ${urgentBanner}
  <div style="padding:32px;">
    <p style="color:#333;font-size:16px;margin:0 0 16px;">Bonjour <strong>${name}</strong>,</p>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Le courrier ci-dessous attend votre traitement et a dépassé le délai imparti. 
      Ceci est le <strong>rappel n°${reminderNum}</strong>.
    </p>
    <div style="background:#f8f9fa;border-left:4px solid ${isUrgent ? "#dc2626" : "#f59e0b"};padding:16px;border-radius:4px;margin:16px 0;">
      <p style="margin:0 0 8px;color:#333;font-size:14px;"><strong>Objet :</strong> ${mail.subject}</p>
      <p style="margin:0;color:#666;font-size:13px;"><strong>Réf :</strong> ${mail.reference_number}</p>
    </div>
    <p style="color:#888;font-size:12px;margin:24px 0 0;"><p style="color:#888;font-size:12px;margin:24px 0 0;">Cet e-mail a été envoyé automatiquement par le système ARE App.</p></p>
  </div>
</div></body></html>`;
}
