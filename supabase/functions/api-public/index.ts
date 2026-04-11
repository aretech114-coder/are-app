import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Validate API key
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return json({ error: "Missing X-API-Key header" }, 401);
  }

  // Hash the key for comparison (simple SHA-256)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(apiKey));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const { data: keyRecord, error: keyError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (keyError || !keyRecord) {
    return json({ error: "Invalid or inactive API key" }, 403);
  }

  // Update last_used_at
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    switch (action) {
      case "mails": {
        const status = url.searchParams.get("status");
        const step = url.searchParams.get("step");
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
        const offset = parseInt(url.searchParams.get("offset") || "0");

        let query = supabase
          .from("mails")
          .select("id, reference_number, subject, sender_name, sender_organization, priority, status, current_step, created_at, deadline_at, mail_type", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (step) query = query.eq("current_step", parseInt(step));

        const { data, count, error } = await query;
        if (error) throw error;
        return json({ data, total: count, limit, offset });
      }

      case "mail": {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "Missing id parameter" }, 400);

        const { data, error } = await supabase
          .from("mails")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        return json({ data });
      }

      case "stats": {
        const { count: total } = await supabase.from("mails").select("*", { count: "exact", head: true });
        const { count: pending } = await supabase.from("mails").select("*", { count: "exact", head: true }).eq("status", "pending");
        const { count: inProgress } = await supabase.from("mails").select("*", { count: "exact", head: true }).eq("status", "in_progress");
        const { count: archived } = await supabase.from("mails").select("*", { count: "exact", head: true }).eq("status", "archived");

        // Overdue count
        const { count: overdue } = await supabase
          .from("mails")
          .select("*", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"])
          .lt("deadline_at", new Date().toISOString());

        return json({
          data: {
            total: total || 0,
            pending: pending || 0,
            in_progress: inProgress || 0,
            archived: archived || 0,
            overdue: overdue || 0,
          },
        });
      }

      case "users": {
        // Check admin permission in API key
        const perms = keyRecord.permissions as string[];
        if (!perms.includes("admin") && !perms.includes("read_users")) {
          return json({ error: "Insufficient permissions" }, 403);
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json({ data });
      }

      default:
        return json({
          error: "Unknown action",
          available_actions: ["mails", "mail", "stats", "users"],
          usage: "?action=mails&status=pending&limit=50&offset=0",
        }, 400);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("API public error:", message);
    return json({ error: message }, 500);
  }
});
