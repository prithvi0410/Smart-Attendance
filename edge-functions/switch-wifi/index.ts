import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: corsHeaders });
    }
    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !user) throw new Error("Unauthorized");

    const { network_id, device_id } = await req.json();

    const { data: net, error: netError } = await supabaseClient
      .from("device_wifi_networks")
      .select("*")
      .eq("id", network_id)
      .single();

    if (netError || !net) throw new Error("Network not found");

    // Make it top priority
    await supabaseClient.from("device_wifi_networks").update({ priority: 1 }).eq("id", network_id);

    // Queue command
    const { data: command, error: cmdError } = await supabaseClient
      .from("device_commands")
      .insert({
        device_id,
        command: "provision_wifi",
        payload: {
          network_id: net.id,
          ssid: net.ssid,
          encrypted_credentials: net.encrypted_password,
          priority: 1
        },
        created_by: user.id
      })
      .select("id")
      .single();

    if (cmdError) throw cmdError;

    return new Response(JSON.stringify({ success: true, command_id: command.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
