/**
 * Edge Function: Register Device for Push Notifications
 * 
 * Registers a device token for push notifications.
 * Called from the mobile app after successful FCM/APNs registration.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterDeviceRequest {
  device_token: string;
  platform: "ios" | "android" | "web";
  onesignal_player_id?: string;
  app_version?: string;
  device_model?: string;
  os_version?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get user's current tenant
    const { data: memberships, error: membershipError } = await supabase
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1);

    if (membershipError || !memberships || memberships.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active tenant membership" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const tenantId = memberships[0].tenant_id;

    // Parse request body
    const body: RegisterDeviceRequest = await req.json();

    if (!body.device_token || !body.platform) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: device_token, platform" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Upsert device token
    const { error: upsertError } = await supabase
      .from("push_device_tokens")
      .upsert({
        user_id: user.id,
        tenant_id: tenantId,
        device_token: body.device_token,
        platform: body.platform,
        onesignal_player_id: body.onesignal_player_id || null,
        app_version: body.app_version || null,
        device_model: body.device_model || null,
        os_version: body.os_version || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,device_token",
      });

    if (upsertError) {
      console.error("Error registering device:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to register device" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Also ensure user has notification preferences
    await supabase
      .from("user_notification_preferences")
      .upsert({
        user_id: user.id,
        tenant_id: tenantId,
        push_enabled: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
        ignoreDuplicates: true,
      });

    console.log(`Device registered for user ${user.id}, platform: ${body.platform}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Device registered successfully" 
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in register-device:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
};

serve(handler);
