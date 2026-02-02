/**
 * Edge Function: Send Push Notifications
 * 
 * This function processes the push_notification_queue and sends
 * notifications via OneSignal to registered devices.
 * 
 * Should be triggered by pg_cron every minute or so.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QueuedNotification {
  id: string;
  user_id: string;
  tenant_id: string;
  shift_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  scheduled_for: string;
  status: string;
}

interface DeviceToken {
  device_token: string;
  platform: string;
  onesignal_player_id: string | null;
}

async function sendOneSignalNotification(
  oneSignalAppId: string,
  oneSignalApiKey: string,
  playerIds: string[],
  title: string,
  message: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (playerIds.length === 0) {
    console.log("No player IDs to send to");
    return false;
  }

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${oneSignalApiKey}`,
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        include_player_ids: playerIds,
        headings: { en: title },
        contents: { en: message },
        data: data || {},
        ios_badgeType: "Increase",
        ios_badgeCount: 1,
        android_accent_color: "FF22C55E",
        small_icon: "ic_notification",
        large_icon: "ic_launcher",
      }),
    });

    const result = await response.json();
    
    if (response.ok && result.id) {
      console.log("OneSignal notification sent:", result.id);
      return true;
    } else {
      console.error("OneSignal error:", result);
      return false;
    }
  } catch (error) {
    console.error("Error sending OneSignal notification:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const oneSignalApiKey = Deno.env.get("ONESIGNAL_API_KEY");

    if (!oneSignalAppId || !oneSignalApiKey) {
      console.log("OneSignal not configured, skipping push notifications");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "OneSignal not configured",
          processed: 0 
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date().toISOString();

    // Get pending notifications that are due
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("push_notification_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(100);

    if (fetchError) {
      throw new Error(`Error fetching queue: ${fetchError.message}`);
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing ${pendingNotifications.length} notifications`);

    let successCount = 0;
    let failCount = 0;

    for (const notification of pendingNotifications as QueuedNotification[]) {
      try {
        // Get device tokens for user
        const { data: tokens, error: tokenError } = await supabase
          .from("push_device_tokens")
          .select("device_token, platform, onesignal_player_id")
          .eq("user_id", notification.user_id)
          .eq("is_active", true);

        if (tokenError || !tokens || tokens.length === 0) {
          console.log(`No active tokens for user ${notification.user_id}`);
          
          // Mark as failed
          await supabase
            .from("push_notification_queue")
            .update({
              status: "failed",
              sent_at: now,
              error_message: "No active device tokens",
            })
            .eq("id", notification.id);
          
          failCount++;
          continue;
        }

        // Get OneSignal player IDs (or use device tokens directly)
        const playerIds = (tokens as DeviceToken[])
          .map(t => t.onesignal_player_id || t.device_token)
          .filter(Boolean) as string[];

        const success = await sendOneSignalNotification(
          oneSignalAppId,
          oneSignalApiKey,
          playerIds,
          notification.title,
          notification.message,
          notification.data || undefined
        );

        // Update notification status
        await supabase
          .from("push_notification_queue")
          .update({
            status: success ? "sent" : "failed",
            sent_at: now,
            error_message: success ? null : "OneSignal delivery failed",
          })
          .eq("id", notification.id);

        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error);
        
        await supabase
          .from("push_notification_queue")
          .update({
            status: "failed",
            sent_at: now,
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", notification.id);
        
        failCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingNotifications.length,
        sent: successCount,
        failed: failCount,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in send-push-notifications:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
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
