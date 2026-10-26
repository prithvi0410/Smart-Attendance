import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only accept POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, status: "invalid_request", message: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { device_id, uid } = body;

    if (!device_id || !uid) {
      return new Response(
        JSON.stringify({ success: false, status: "invalid_request", message: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize UID: uppercase, trim, remove spaces
    const normalizedUid = uid.toString().toUpperCase().replace(/\s+/g, "").trim();

    // Validate hex format
    if (!/^[0-9A-F]+$/.test(normalizedUid)) {
      return new Response(
        JSON.stringify({ success: false, status: "invalid_request", message: "Invalid UID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role (server-side only)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Step 1: Authenticate device ---
    const authHeader = req.headers.get("Authorization");
    const deviceToken = authHeader?.replace("Bearer ", "") ?? "";

    if (!deviceToken) {
      return new Response(
        JSON.stringify({ success: false, status: "unauthorized", message: "Device not authorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash the provided token and compare with stored hash
    const encoder = new TextEncoder();
    const data = encoder.encode(deviceToken);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, device_name, is_active, device_token_hash")
      .eq("device_name", device_id)
      .single();

    if (deviceError || !device) {
      return new Response(
        JSON.stringify({ success: false, status: "unauthorized", message: "Device not authorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!device.is_active) {
      return new Response(
        JSON.stringify({ success: false, status: "unauthorized", message: "Device is deactivated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (device.device_token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ success: false, status: "unauthorized", message: "Device not authorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 2: Update device last_seen_at ---
    await supabase
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);

    // --- Step 3: Find active attendance session for this device ---
    const { data: session, error: sessionError } = await supabase
      .from("attendance_sessions")
      .select("id, subject_id, session_date, start_time")
      .eq("device_id", device.id)
      .eq("status", "active")
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error("Session query error:", sessionError);
      return new Response(
        JSON.stringify({ success: false, status: "error", message: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session) {
      return jsonResponse({ success: false, status: "no_active_session", message: "No active attendance session" });
    }

    // --- Step 4: Find student by RFID UID ---
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, roll_no, is_active")
      .eq("rfid_uid", normalizedUid)
      .maybeSingle();

    if (studentError) {
      console.error("Student query error:", studentError);
      return new Response(
        JSON.stringify({ success: false, status: "error", message: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!student) {
      return jsonResponse({ success: false, status: "unknown_card", message: "Card not registered" });
    }

    if (!student.is_active) {
      return jsonResponse({ success: false, status: "unknown_card", message: "Student is inactive" });
    }

    // --- Step 5: Check for existing attendance ---
    const { data: existingRecord } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("session_id", session.id)
      .eq("student_id", student.id)
      .maybeSingle();

    if (existingRecord) {
      return jsonResponse({
        success: true,
        status: "already_marked",
        student_name: student.full_name,
        message: "Already Marked",
      });
    }

    // --- Step 6: Insert attendance record ---
    const scannedAt = new Date().toISOString();
    const { error: insertError } = await supabase
      .from("attendance_records")
      .insert({
        session_id: session.id,
        student_id: student.id,
        device_id: device.id,
        scanned_at: scannedAt,
        status: "present",
      });

    if (insertError) {
      // Handle unique constraint violation (race condition duplicate)
      if (insertError.code === "23505") {
        return jsonResponse({
          success: true,
          status: "already_marked",
          student_name: student.full_name,
          message: "Already Marked",
        });
      }
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, status: "error", message: "Failed to record attendance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 7: Return success ---
    return jsonResponse({
      success: true,
      status: "present",
      student_name: student.full_name,
      roll_no: student.roll_no,
      scanned_at: scannedAt,
      message: "Attendance Marked",
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, status: "error", message: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: return 200 JSON response (keeps ESP32 parsing simple)
function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}
