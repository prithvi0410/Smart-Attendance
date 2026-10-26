import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Helper: Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Encrypt payload using AES-256-GCM
async function encryptGCM(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPlaintext
  );

  // The WebCrypto AES-GCM returns the ciphertext and auth tag concatenated
  const ciphertextBytes = new Uint8Array(ciphertextBuffer);
  
  // Format: IV:CIPHERTEXT_WITH_TAG
  return `${bytesToHex(iv)}:${bytesToHex(ciphertextBytes)}`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", // Need service role to bypass RLS and read encryption_key
      {
        auth: { persistSession: false },
      }
    );

    // 1. Authenticate Dashboard User
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Parse Request Payload
    const { device_id, ssid, password, priority } = await req.json();

    if (!device_id || !ssid || !password) {
      throw new Error("Missing required fields");
    }

    // 3. Get Device Encryption Key
    const { data: device, error: deviceError } = await supabaseClient
      .from("devices")
      .select("encryption_key, is_active")
      .eq("id", device_id)
      .single();

    if (deviceError || !device) {
      throw new Error("Device not found");
    }
    if (!device.is_active) {
      throw new Error("Device is inactive");
    }
    if (!device.encryption_key) {
      throw new Error("Device lacks encryption_key. Run setup first.");
    }

    // 4. Encrypt the Wi-Fi Password
    const encryptedPassword = await encryptGCM(password, device.encryption_key);

    // 5. Insert into device_wifi_networks
    const { data: network, error: netError } = await supabaseClient
      .from("device_wifi_networks")
      .insert({
        device_id,
        ssid,
        encrypted_password: encryptedPassword,
        priority: priority || 100
      })
      .select("id")
      .single();

    if (netError) throw netError;

    // 6. Insert Command into Realtime Queue
    // We send the encrypted payload. We NEVER send the plaintext password.
    const commandPayload = {
      network_id: network.id,
      ssid,
      encrypted_credentials: encryptedPassword,
      priority: priority || 100
    };

    const { data: command, error: cmdError } = await supabaseClient
      .from("device_commands")
      .insert({
        device_id,
        command: "provision_wifi",
        payload: commandPayload,
        created_by: user.id
      })
      .select("id, status")
      .single();

    if (cmdError) throw cmdError;

    // Return Success
    return new Response(
      JSON.stringify({ success: true, command_id: command.id, network_id: network.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Provisioning Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
