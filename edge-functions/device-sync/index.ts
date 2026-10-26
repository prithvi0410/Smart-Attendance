import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    const rawToken = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await sha256(rawToken);

    const { device_id, action, uid } = await req.json();

    const { data: device, error: devError } = await supabaseClient
      .from("devices")
      .select("id, is_active, device_token_hash, current_mode")
      .eq("device_name", device_id)
      .single();

    if (devError || !device || !device.is_active || device.device_token_hash !== tokenHash) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // If action is register_uid, update the device's last_register_uid
    if (action === "register_uid" && uid) {
      await supabaseClient.from("devices").update({ last_register_uid: uid }).eq("id", device.id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Otherwise, perform a standard sync
    // Get pending commands
    const { data: commands } = await supabaseClient
      .from("device_commands")
      .select("*")
      .eq("device_id", device.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    return new Response(JSON.stringify({
      mode: device.current_mode,
      command: commands && commands.length > 0 ? commands[0] : null
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
