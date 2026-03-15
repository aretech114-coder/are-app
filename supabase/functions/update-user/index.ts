// Auto-deployed via GitHub Actions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Verify caller using getUser with service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData?.user) {
      console.error("Auth error:", userError?.message);
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

    const callerRole = roleData?.role;
    const isSuperAdmin = callerRole === "superadmin";
    const isAdmin = callerRole === "admin";

    if (!isSuperAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, full_name, email, password, role } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isAdmin) {
      const { data: permissions } = await adminClient
        .from("admin_permissions")
        .select("permission_key, is_enabled")
        .in("permission_key", ["edit_users", "reset_passwords"]);

      const permissionMap = new Map((permissions || []).map((p: any) => [p.permission_key, p.is_enabled]));
      const canEditUsers = permissionMap.get("edit_users") === true;
      const canResetPasswords = permissionMap.get("reset_passwords") === true;

      const wantsProfileEdit = typeof full_name !== "undefined" || typeof email !== "undefined" || typeof role !== "undefined";
      const wantsPasswordReset = typeof password === "string" && password.length > 0;

      if (wantsProfileEdit && !canEditUsers) {
        return new Response(JSON.stringify({ error: "Vous n'avez pas la permission de modifier les utilisateurs" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (wantsPasswordReset && !canResetPasswords) {
        return new Response(JSON.stringify({ error: "Vous n'avez pas la permission de réinitialiser les mots de passe" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Prevent admin from modifying superadmin users
    if (isAdmin) {
      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .single();

      if (targetRole?.role === "superadmin") {
        return new Response(JSON.stringify({ error: "Un administrateur ne peut pas modifier un Super Admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Prevent escalation to superadmin
    if (role === "superadmin") {
      return new Response(JSON.stringify({ error: "Impossible d'attribuer le rôle superadmin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate password strength if provided
    if (password && password.length < 6) {
      return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 6 caractères" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update auth user (email, password)
    const authUpdate: Record<string, any> = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(user_id, authUpdate);
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update profile
    if (full_name || email) {
      const profileUpdate: Record<string, any> = {};
      if (full_name) profileUpdate.full_name = full_name;
      if (email) profileUpdate.email = email;
      await adminClient.from("profiles").update(profileUpdate).eq("id", user_id);
    }

    // Update role
    if (role) {
      await adminClient.from("user_roles").update({ role }).eq("user_id", user_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
