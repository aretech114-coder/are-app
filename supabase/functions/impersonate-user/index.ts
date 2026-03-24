import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity with anon client
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: caller },
      error: userError,
    } = await anonClient.auth.getUser();

    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const isSuperAdmin = callerRole?.role === "superadmin";
    const isAdmin = callerRole?.role === "admin";

    if (!isSuperAdmin && !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Accès refusé : rôle insuffisant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If admin, check impersonate permission
    if (isAdmin) {
      const { data: perm } = await adminClient
        .from("admin_permissions")
        .select("is_enabled")
        .eq("permission_key", "impersonate_users")
        .single();

      if (!perm?.is_enabled) {
        return new Response(
          JSON.stringify({ error: "Permission d'impersonation non activée" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent admin from impersonating superadmin
    if (isAdmin) {
      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", target_user_id)
        .single();

      if (targetRole?.role === "superadmin") {
        return new Response(
          JSON.stringify({ error: "Impossible d'impersonner un SuperAdmin" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get target user email
    const { data: targetAuth, error: targetError } =
      await adminClient.auth.admin.getUserById(target_user_id);

    if (targetError || !targetAuth?.user?.email) {
      return new Response(
        JSON.stringify({ error: "Utilisateur cible introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate magic link
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: targetAuth.user.email,
      });

    if (linkError || !linkData) {
      console.error("generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: "Impossible de générer le lien d'accès" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The properties contain hashed_token and verification_url
    // We need to construct the proper URL for the frontend to consume
    const properties = linkData.properties;
    const verificationUrl = properties?.action_link;

    return new Response(
      JSON.stringify({
        url: verificationUrl,
        target_email: targetAuth.user.email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("impersonate-user error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
