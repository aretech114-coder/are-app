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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller identity and role
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

    if (roleData?.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Accès réservé au SuperAdmin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all auth users (paginated, up to 1000)
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
      page: 1,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUsers = authData.users || [];

    // Get existing profiles and roles
    const [{ data: existingProfiles }, { data: existingRoles }] = await Promise.all([
      adminClient.from("profiles").select("id"),
      adminClient.from("user_roles").select("user_id"),
    ]);

    const profileIds = new Set((existingProfiles || []).map((p: any) => p.id));
    const roleUserIds = new Set((existingRoles || []).map((r: any) => r.user_id));

    let profilesCreated = 0;
    let rolesCreated = 0;
    const errors: string[] = [];

    for (const authUser of authUsers) {
      // Create missing profile
      if (!profileIds.has(authUser.id)) {
        const { error: pErr } = await adminClient.from("profiles").insert({
          id: authUser.id,
          email: authUser.email || "",
          full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "",
        });
        if (pErr) {
          errors.push(`Profile ${authUser.email}: ${pErr.message}`);
        } else {
          profilesCreated++;
        }
      }

      // Create missing role
      if (!roleUserIds.has(authUser.id)) {
        const { error: rErr } = await adminClient.from("user_roles").insert({
          user_id: authUser.id,
          role: "agent",
        });
        if (rErr) {
          errors.push(`Role ${authUser.email}: ${rErr.message}`);
        } else {
          rolesCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        auth_users_total: authUsers.length,
        profiles_created: profilesCreated,
        roles_created: rolesCreated,
        errors: errors.length > 0 ? errors : undefined,
      }),
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
