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
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await callerClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Non autorisé" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .single();
      if (!roleData || !["superadmin", "admin"].includes(roleData.role)) {
        return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settingRow } = await supabase
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "step8_auto_advance_hours")
      .maybeSingle();

    const hours = parseInt(settingRow?.setting_value ?? "0", 10);
    if (!hours || hours <= 0) {
      return new Response(
        JSON.stringify({ message: "Auto-advance disabled (step8_auto_advance_hours = 0)", advanced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: overdueMails, error: fetchError } = await supabase
      .from("mails")
      .select("id, assigned_agent_id, reference_number, subject")
      .eq("current_step", 8)
      .is("step8_transmitted_at", null)
      .not("step8_arrived_at", "is", null)
      .lt("step8_arrived_at", new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());

    if (fetchError) throw fetchError;

    if (!overdueMails?.length) {
      return new Response(
        JSON.stringify({ message: "No mails to auto-advance", advanced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let advanced = 0;
    const errors: string[] = [];

    for (const mail of overdueMails) {
      let performedBy = mail.assigned_agent_id as string | null;

      if (!performedBy) {
        const { data: assignment } = await supabase
          .from("mail_assignments")
          .select("assigned_to")
          .eq("mail_id", mail.id)
          .eq("step_number", 8)
          .in("access_mode", ["contributor", "custodian"])
          .limit(1)
          .maybeSingle();
        performedBy = assignment?.assigned_to ?? null;
      }

      if (!performedBy) {
        const { data: secretariat } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "secretariat")
          .limit(1)
          .maybeSingle();
        performedBy = secretariat?.user_id ?? null;
      }

      if (!performedBy) {
        errors.push(`${mail.reference_number}: no performer found`);
        continue;
      }

      const { data: result, error: rpcError } = await supabase.rpc("advance_workflow_step", {
        _mail_id: mail.id,
        _action: "complete",
        _performed_by: performedBy,
        _notes: "Passage automatique après délai configuré (step8_auto_advance_hours)",
        _skip_auto_assign: false,
        _assignee_ids: null,
        _viewer_ids: null,
      });

      if (rpcError) {
        errors.push(`${mail.reference_number}: ${rpcError.message}`);
        continue;
      }

      if (result?.success) {
        advanced++;
      } else {
        errors.push(`${mail.reference_number}: ${result?.error ?? "unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Step 8 auto-advance complete",
        candidates: overdueMails.length,
        advanced,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
