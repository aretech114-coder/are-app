// Auto-deployed via GitHub Actions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAuditEvent, requestMeta } from "../_shared/audit-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIVILEGED_ROLES = new Set(["admin", "superadmin"]);
const BAN_DURATION = "876000h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    const callerRole = roleData?.role as string | undefined;
    const isSuperAdmin = callerRole === "superadmin";
    const isAdmin = callerRole === "admin";

    if (!isSuperAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isAdmin) {
      const { data: permissions } = await adminClient
        .from("admin_permissions")
        .select("permission_key, is_enabled")
        .eq("permission_key", "edit_users")
        .maybeSingle();
      if (permissions?.is_enabled !== true) {
        return new Response(JSON.stringify({ error: "Vous n'avez pas la permission de modifier les utilisateurs" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const disabled = body?.disabled === true;
    const rawIds = Array.isArray(body?.user_ids) ? body.user_ids : [];
    const userIds = [...new Set(rawIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))];

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userIds.includes(callerId)) {
      return new Response(JSON.stringify({ error: "Vous ne pouvez pas modifier le statut de votre propre compte" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRows, error: rolesError } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    if (rolesError) {
      return new Response(JSON.stringify({ error: rolesError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleByUser = new Map((roleRows || []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]));
    const isBulk = userIds.length > 1;
    const privilegedTargets = userIds.filter((id) => PRIVILEGED_ROLES.has(roleByUser.get(id) || "agent"));

    if (isBulk && privilegedTargets.length > 0) {
      return new Response(
        JSON.stringify({ error: "Les comptes admin et super admin ne peuvent pas être traités en masse" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isBulk && isAdmin && roleByUser.get(userIds[0]) === "superadmin") {
      return new Response(JSON.stringify({ error: "Un administrateur ne peut pas modifier un Super Admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: string[] = [];
    let updated = 0;

    for (const userId of userIds) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: disabled ? BAN_DURATION : "none",
      });
      if (authError) {
        errors.push(`${userId}: ${authError.message}`);
        continue;
      }
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ is_disabled: disabled })
        .eq("id", userId);
      if (profileError) {
        errors.push(`${userId}: ${profileError.message}`);
        continue;
      }
      updated += 1;
    }

    const { ip_address, user_agent } = requestMeta(req);
    const action = isBulk
      ? disabled
        ? "user.bulk_disable"
        : "user.bulk_enable"
      : disabled
        ? "user.disable"
        : "user.enable";

    await logAuditEvent(adminClient, {
      actor_user_id: callerId,
      actor_role: callerRole,
      action,
      category: "user",
      entity_type: "user",
      entity_id: isBulk ? null : userIds[0],
      summary: isBulk
        ? `${disabled ? "Désactivation" : "Activation"} en masse : ${updated} compte(s)`
        : `Compte ${disabled ? "désactivé" : "activé"}`,
      metadata: { user_ids: userIds, disabled, updated, errors },
      ip_address,
      user_agent,
    });

    if (updated === 0) {
      return new Response(JSON.stringify({ error: errors[0] || "Aucun compte mis à jour", errors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, updated, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
