import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAuditEvent, requestMeta } from "../_shared/audit-log.ts";
import { buildEmailFromStepTemplates } from "../_shared/notification-template.ts";
import { sendEmail } from "../_shared/send-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NotificationType = "transition" | "pre_assignment" | "register" | "rejection" | "sla_alert";

interface DispatchPayload {
  mail_id: string;
  step_number: number;
  notification_type: NotificationType;
  action?: string;
  fallback_user_id?: string | null;
  trigger_source: string;
  dry_run?: boolean;
  force_send?: boolean;
}

interface RecipientRow {
  user_id: string;
  access_mode: "contributor" | "viewer" | "default";
}

interface DeliveryResult {
  recipient_user_id: string;
  recipient_email: string | null;
  recipient_name: string;
  access_mode: string;
  status: "sent" | "failed" | "skipped";
  skip_reason?: string;
  error_message?: string;
  provider?: string;
  provider_message_id?: string | null;
}

const TYPE_TITLES: Record<string, string> = {
  transition: "Nouvelle tâche assignée",
  pre_assignment: "Pré-assignation par le Directeur général",
  register: "Nouveau courrier enregistré",
  rejection: "Dossier renvoyé",
  sla_alert: "Dépassement de délai SLA",
};

async function canManageWorkflow(adminClient: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleData?.role === "superadmin") return true;
  if (roleData?.role !== "admin") return false;

  const { data: perm } = await adminClient
    .from("admin_permissions")
    .select("is_enabled")
    .eq("permission_key", "manage_workflow")
    .maybeSingle();

  return perm?.is_enabled === true;
}

function resolveAccessMode(
  assignment: { access_mode: string } | undefined,
  isDefaultOnly: boolean
): "contributor" | "viewer" | "default" {
  if (assignment?.access_mode === "viewer") return "viewer";
  if (assignment?.access_mode === "contributor" || assignment?.access_mode === "custodian") {
    return "contributor";
  }
  if (isDefaultOnly) return "default";
  return "contributor";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let payload: DispatchPayload | null = null;
  let callerUserId: string | null = null;
  let adminClient: ReturnType<typeof createClient> | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const { data: userData, error: userError } = await adminClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = userData.user.id;
    }

    payload = await req.json() as DispatchPayload;

    if (!payload.mail_id || !payload.step_number || !payload.notification_type || !payload.trigger_source) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((payload.dry_run || payload.force_send) && !isServiceRole) {
      const allowed = await canManageWorkflow(adminClient, callerUserId!);
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs workflow" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const appUrl = Deno.env.get("APP_URL") || "https://are-app.cloud";
    const stepNumber = payload.step_number;
    const action = payload.action || "approve";
    const isRejection = action === "reject";
    const effectiveType: NotificationType =
      payload.notification_type === "pre_assignment"
        ? "pre_assignment"
        : isRejection
          ? "rejection"
          : payload.notification_type;

    const { data: stepConfig } = await adminClient
      .from("workflow_step_responsibles")
      .select(
        "notify_enabled, notification_subject_template, notification_body_template, notification_body_viewer_template, default_user_id"
      )
      .eq("step_number", stepNumber)
      .maybeSingle();

    const notifyEnabled = stepConfig?.notify_enabled !== false;

    const { data: stepRow } = await adminClient
      .from("workflow_steps")
      .select("name")
      .eq("step_order", stepNumber)
      .eq("is_active", true)
      .maybeSingle();

    const stepName = stepRow?.name || `Étape ${stepNumber}`;

    const { data: mailData } = await adminClient
      .from("mails")
      .select("subject, reference_number, assigned_agent_id")
      .eq("id", payload.mail_id)
      .single();

    if (!mailData) {
      return new Response(JSON.stringify({ error: "Courrier introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assignmentStep =
      effectiveType === "pre_assignment" ? 4 : stepNumber;

    const { data: assignments } = await adminClient
      .from("mail_assignments")
      .select("assigned_to, access_mode, status")
      .eq("mail_id", payload.mail_id)
      .eq("step_number", assignmentStep)
      .in("status", ["pending", "proposed"])
      .in("access_mode", ["contributor", "viewer", "custodian"]);

    const recipientMap = new Map<string, RecipientRow>();

    for (const a of assignments || []) {
      recipientMap.set(a.assigned_to, {
        user_id: a.assigned_to,
        access_mode: resolveAccessMode(a, false),
      });
    }

    if (payload.fallback_user_id) {
      if (!recipientMap.has(payload.fallback_user_id)) {
        recipientMap.set(payload.fallback_user_id, {
          user_id: payload.fallback_user_id,
          access_mode: "default",
        });
      }
    }

    if (mailData.assigned_agent_id && !recipientMap.has(mailData.assigned_agent_id)) {
      recipientMap.set(mailData.assigned_agent_id, {
        user_id: mailData.assigned_agent_id,
        access_mode: "default",
      });
    }

    if (recipientMap.size === 0 && stepConfig?.default_user_id) {
      recipientMap.set(stepConfig.default_user_id, {
        user_id: stepConfig.default_user_id,
        access_mode: "default",
      });
    }

    if (recipientMap.size === 0) {
      const { data: resolvedId, error: resolveError } = await adminClient.rpc(
        "resolve_step_assignee",
        { _step_number: stepNumber, _mail_id: payload.mail_id }
      );
      if (!resolveError && resolvedId) {
        recipientMap.set(resolvedId as string, {
          user_id: resolvedId as string,
          access_mode: "default",
        });
      }
    }

    const recipientIds = [...recipientMap.keys()];
    const { data: profiles } = recipientIds.length
      ? await adminClient.from("profiles").select("id, full_name, email").in("id", recipientIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

    const profileById = new Map((profiles || []).map((p) => [p.id, p]));
    const assigneeNames = (profiles || [])
      .map((p) => p.full_name || p.email || "Utilisateur")
      .join(", ");

    const results: DeliveryResult[] = [];

    if (!notifyEnabled && !payload.force_send) {
      for (const [userId, row] of recipientMap) {
        const p = profileById.get(userId);
        results.push({
          recipient_user_id: userId,
          recipient_email: p?.email ?? null,
          recipient_name: p?.full_name || "Utilisateur",
          access_mode: row.access_mode,
          status: "skipped",
          skip_reason: "notify_disabled",
        });
        if (!payload.dry_run) {
          await adminClient.from("notification_deliveries").insert({
            mail_id: payload.mail_id,
            step_number: stepNumber,
            notification_type: effectiveType,
            recipient_user_id: userId,
            recipient_email: p?.email ?? null,
            status: "skipped",
            skip_reason: "notify_disabled",
            trigger_source: payload.trigger_source,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          dry_run: !!payload.dry_run,
          notify_enabled: false,
          sent: 0,
          failed: 0,
          skipped: results.length,
          recipients: results,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (recipientIds.length === 0) {
      if (!payload.dry_run) {
        await adminClient.from("notification_deliveries").insert({
          mail_id: payload.mail_id,
          step_number: stepNumber,
          notification_type: effectiveType,
          status: "skipped",
          skip_reason: "no_recipients",
          trigger_source: payload.trigger_source,
        });
      }
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: !!payload.dry_run,
          notify_enabled: notifyEnabled,
          sent: 0,
          failed: 0,
          skipped: 1,
          recipients: [],
          warning: "no_recipients",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fallbackSubject = isRejection
      ? `Dossier renvoyé — ${stepName}`
      : effectiveType === "register"
        ? `Nouveau courrier — ${stepName}`
        : effectiveType === "pre_assignment"
          ? `${TYPE_TITLES.pre_assignment} — ${stepName}`
          : `Courrier en attente — ${stepName}`;

    const { ip_address, user_agent } = requestMeta(req);

    for (const [userId, row] of recipientMap) {
      const p = profileById.get(userId);
      const email = p?.email?.trim()?.toLowerCase() || null;
      const name = p?.full_name || "Utilisateur";
      const assignment = assignments?.find((a) => a.assigned_to === userId);
      const isDefaultOnly = !assignment && (userId === payload.fallback_user_id || userId === mailData.assigned_agent_id || userId === stepConfig?.default_user_id);
      const accessMode = resolveAccessMode(assignment, isDefaultOnly);

      if (!email) {
        results.push({
          recipient_user_id: userId,
          recipient_email: null,
          recipient_name: name,
          access_mode: accessMode,
          status: "skipped",
          skip_reason: "no_email",
        });
        if (!payload.dry_run) {
          await adminClient.from("notification_deliveries").insert({
            mail_id: payload.mail_id,
            step_number: stepNumber,
            notification_type: effectiveType,
            recipient_user_id: userId,
            status: "skipped",
            skip_reason: "no_email",
            trigger_source: payload.trigger_source,
          });
        }
        continue;
      }

      const { subject, bodyHtml } = buildEmailFromStepTemplates({
        stepNumber,
        stepName,
        subjectTemplate: stepConfig?.notification_subject_template ?? null,
        bodyTemplate: stepConfig?.notification_body_template ?? null,
        bodyViewerTemplate: stepConfig?.notification_body_viewer_template ?? null,
        recipientName: name,
        recipientEmail: email,
        mailSubject: mailData.subject,
        referenceNumber: mailData.reference_number ?? undefined,
        mailId: payload.mail_id,
        accessMode,
        assigneesList: assigneeNames,
        assigneesCount: recipientIds.length,
        fallbackTitle: TYPE_TITLES[effectiveType] || "Notification ARE App",
        fallbackSubject,
        appUrl,
      });

      if (payload.dry_run) {
        results.push({
          recipient_user_id: userId,
          recipient_email: email,
          recipient_name: name,
          access_mode: accessMode,
          status: "skipped",
          skip_reason: "dry_run",
        });
        continue;
      }

      try {
        const sendResult = await sendEmail({
          recipient_email: email,
          subject,
          body_html: bodyHtml,
        });

        await adminClient.from("notification_deliveries").insert({
          mail_id: payload.mail_id,
          step_number: stepNumber,
          notification_type: effectiveType,
          recipient_user_id: userId,
          recipient_email: email,
          status: "sent",
          provider: sendResult.provider,
          provider_message_id: sendResult.provider_message_id,
          trigger_source: payload.trigger_source,
        });

        await logAuditEvent(adminClient, {
          actor_user_id: callerUserId,
          action: "email.sent",
          category: "email",
          entity_type: "mail",
          entity_id: payload.mail_id,
          summary: `E-mail workflow envoyé à ${email}`,
          metadata: {
            recipient_email: email,
            recipient_user_id: userId,
            notification_type: effectiveType,
            step_number: stepNumber,
            provider: sendResult.provider,
            provider_message_id: sendResult.provider_message_id,
            trigger_source: payload.trigger_source,
          },
          ip_address,
          user_agent,
        });

        results.push({
          recipient_user_id: userId,
          recipient_email: email,
          recipient_name: name,
          access_mode: accessMode,
          status: "sent",
          provider: sendResult.provider,
          provider_message_id: sendResult.provider_message_id,
        });
      } catch (sendErr) {
        const message = sendErr instanceof Error ? sendErr.message : "Unknown error";

        await adminClient.from("notification_deliveries").insert({
          mail_id: payload.mail_id,
          step_number: stepNumber,
          notification_type: effectiveType,
          recipient_user_id: userId,
          recipient_email: email,
          status: "failed",
          error_message: message,
          trigger_source: payload.trigger_source,
        });

        await logAuditEvent(adminClient, {
          actor_user_id: callerUserId,
          action: "email.failed",
          category: "email",
          entity_type: "mail",
          entity_id: payload.mail_id,
          summary: `Échec e-mail workflow vers ${email}`,
          metadata: {
            recipient_email: email,
            notification_type: effectiveType,
            error: message,
            trigger_source: payload.trigger_source,
          },
          ip_address,
          user_agent,
        });

        results.push({
          recipient_user_id: userId,
          recipient_email: email,
          recipient_name: name,
          access_mode: accessMode,
          status: "failed",
          error_message: message,
        });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return new Response(
      JSON.stringify({
        success: failed === 0,
        dry_run: !!payload.dry_run,
        notify_enabled: notifyEnabled,
        sent,
        failed,
        skipped,
        recipients: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("dispatch-workflow-notifications error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
