import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_KEYS = new Set([
  "site_title",
  "site_subtitle",
  "site_tagline",
  "sidebar_initials",
  "favicon_url",
  "sidebar_logo_url",
  "pwa_icon_url",
  "allow_indexing",
  "show_forgot_password",
  "show_remember_me",
  "primary_color",
  "secondary_color",
  "accent_color",
  "sidebar_bg_color",
  "background_color",
  "link_color",
  "font_heading",
  "font_body",
  "login_bg_color",
  "login_bg_image_url",
  "login_logo_url",
  "show_login_title",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const requestedKeys = Array.isArray(body?.keys) ? body.keys.filter((key: unknown): key is string => typeof key === "string") : [];
    const keys = requestedKeys.filter((key) => ALLOWED_KEYS.has(key));

    const query = supabase
      .from("site_settings")
      .select("setting_key, setting_value")
      .order("setting_key");

    const { data, error } = keys.length > 0 ? await query.in("setting_key", keys) : await query;

    if (error) throw error;

    return new Response(JSON.stringify({ settings: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});