import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    console.log(`Processing check-in alerts at ${now.toISOString()}`);

    // Get all sectors with check-in enabled
    const { data: sectors, error: sectorsError } = await supabase
      .from("sectors")
      .select("id, tenant_id, name, checkin_enabled, checkin_tolerance_minutes")
      .eq("checkin_enabled", true);

    if (sectorsError) {
      console.error("Error fetching sectors:", sectorsError);
      throw sectorsError;
    }

    if (!sectors || sectors.length === 0) {
      console.log("No sectors with check-in enabled");
      return new Response(JSON.stringify({ message: "No sectors to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sectorIds = sectors.map((s) => s.id);
    const sectorMap = new Map(sectors.map((s) => [s.id, s]));

    // Get today's shifts for enabled sectors
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select("id, sector_id, tenant_id, shift_date, start_time, title")
      .eq("shift_date", todayStr)
      .in("sector_id", sectorIds);

    if (shiftsError) {
      console.error("Error fetching shifts:", shiftsError);
      throw shiftsError;
    }

    if (!shifts || shifts.length === 0) {
      console.log("No shifts today for enabled sectors");
      return new Response(JSON.stringify({ message: "No shifts today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shiftIds = shifts.map((s) => s.id);
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));

    // Get assignments for today's shifts
    const { data: assignments, error: assignmentsError } = await supabase
      .from("shift_assignments")
      .select("id, user_id, shift_id, tenant_id, checkin_at, status")
      .in("shift_id", shiftIds);

    if (assignmentsError) {
      console.error("Error fetching assignments:", assignmentsError);
      throw assignmentsError;
    }

    if (!assignments || assignments.length === 0) {
      console.log("No assignments for today's shifts");
      return new Response(JSON.stringify({ message: "No assignments" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing notifications for today to avoid duplicates
    const { data: existingNotifications } = await supabase
      .from("notifications")
      .select("shift_assignment_id, type")
      .in("shift_assignment_id", assignments.map((a) => a.id))
      .gte("created_at", `${todayStr}T00:00:00`);

    const notifiedSet = new Set(
      existingNotifications?.map((n) => `${n.shift_assignment_id}-${n.type}`) || []
    );

    const notificationsToCreate: any[] = [];
    const assignmentsToMarkAbsent: string[] = [];

    for (const assignment of assignments) {
      const shift = shiftMap.get(assignment.shift_id);
      if (!shift) continue;

      const sector = sectorMap.get(shift.sector_id);
      if (!sector) continue;

      // Parse shift start time
      const [startHour, startMinute] = shift.start_time.split(":").map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(startHour, startMinute, 0, 0);

      const diffMinutes = Math.round((now.getTime() - shiftStart.getTime()) / (1000 * 60));

      // Skip if already checked in
      if (assignment.checkin_at) continue;

      const tenantId = assignment.tenant_id || shift.tenant_id;

      // 15 minutes before (-15 to -14 minutes window)
      if (diffMinutes >= -15 && diffMinutes < -14) {
        const key = `${assignment.id}-checkin_reminder_15min`;
        if (!notifiedSet.has(key)) {
          notificationsToCreate.push({
            tenant_id: tenantId,
            user_id: assignment.user_id,
            type: "checkin_reminder_15min",
            title: "Lembrete de Check-in",
            message: `Seu plantão "${shift.title}" começa em 15 minutos. Não esqueça de fazer o check-in!`,
            shift_assignment_id: assignment.id,
          });
          console.log(`Creating 15min reminder for assignment ${assignment.id}`);
        }
      }

      // At shift start time (0 to 1 minute window)
      if (diffMinutes >= 0 && diffMinutes < 1) {
        const key = `${assignment.id}-checkin_reminder_now`;
        if (!notifiedSet.has(key)) {
          notificationsToCreate.push({
            tenant_id: tenantId,
            user_id: assignment.user_id,
            type: "checkin_reminder_now",
            title: "Hora do Check-in!",
            message: `Seu plantão "${shift.title}" começou agora. Faça o check-in imediatamente!`,
            shift_assignment_id: assignment.id,
          });
          console.log(`Creating now reminder for assignment ${assignment.id}`);
        }
      }

      // 15 minutes late (15 to 16 minutes window)
      if (diffMinutes >= 15 && diffMinutes < 16) {
        const key = `${assignment.id}-checkin_reminder_late`;
        if (!notifiedSet.has(key)) {
          notificationsToCreate.push({
            tenant_id: tenantId,
            user_id: assignment.user_id,
            type: "checkin_reminder_late",
            title: "Check-in Atrasado!",
            message: `Você está 15 minutos atrasado para o plantão "${shift.title}". Faça o check-in urgente!`,
            shift_assignment_id: assignment.id,
          });
          console.log(`Creating late reminder for assignment ${assignment.id}`);
        }
      }

      // After tolerance period - mark as absent
      const toleranceMinutes = sector.checkin_tolerance_minutes || 30;
      if (diffMinutes >= toleranceMinutes && assignment.status !== "absent") {
        const key = `${assignment.id}-marked_absent`;
        if (!notifiedSet.has(key)) {
          notificationsToCreate.push({
            tenant_id: tenantId,
            user_id: assignment.user_id,
            type: "marked_absent",
            title: "Marcado como Ausente",
            message: `Você foi marcado como ausente no plantão "${shift.title}" por não realizar o check-in dentro do prazo de ${toleranceMinutes} minutos.`,
            shift_assignment_id: assignment.id,
          });
          assignmentsToMarkAbsent.push(assignment.id);
          console.log(`Marking assignment ${assignment.id} as absent`);
        }
      }
    }

    // Create notifications
    if (notificationsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notificationsToCreate);

      if (insertError) {
        console.error("Error creating notifications:", insertError);
      } else {
        console.log(`Created ${notificationsToCreate.length} notifications`);
      }
    }

    // Mark assignments as absent
    if (assignmentsToMarkAbsent.length > 0) {
      const { error: updateError } = await supabase
        .from("shift_assignments")
        .update({ status: "absent" })
        .in("id", assignmentsToMarkAbsent);

      if (updateError) {
        console.error("Error marking absent:", updateError);
      } else {
        console.log(`Marked ${assignmentsToMarkAbsent.length} assignments as absent`);
      }
    }

    return new Response(
      JSON.stringify({
        processed: assignments.length,
        notifications_created: notificationsToCreate.length,
        marked_absent: assignmentsToMarkAbsent.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in process-checkin-alerts:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
