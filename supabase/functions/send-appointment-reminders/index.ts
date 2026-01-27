import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReminderResult {
  appointment_id: string;
  status: "sent" | "failed" | "skipped";
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results: ReminderResult[] = [];
  const errors: string[] = [];

  try {
    console.log("[send-appointment-reminders] Starting reminder check...");

    // Find appointments 24 hours from now (with 15-minute window)
    const now = new Date();
    const reminderWindowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000); // 23h45m
    const reminderWindowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 15 * 60 * 1000); // 24h15m

    console.log("[send-appointment-reminders] Checking window:", {
      start: reminderWindowStart.toISOString(),
      end: reminderWindowEnd.toISOString(),
    });

    // Get appointments in the 24-hour reminder window
    const { data: appointments, error: appointmentsError } = await supabase
      .from("appointments")
      .select(`
        id,
        customer_name,
        customer_phone,
        start_datetime,
        notes,
        status,
        company_id,
        services (name, duration_minutes),
        companies (name, twilio_number, timezone)
      `)
      .eq("status", "confirmed")
      .gte("start_datetime", reminderWindowStart.toISOString())
      .lte("start_datetime", reminderWindowEnd.toISOString());

    if (appointmentsError) {
      console.error("[send-appointment-reminders] Error fetching appointments:", appointmentsError);
      throw appointmentsError;
    }

    console.log(`[send-appointment-reminders] Found ${appointments?.length || 0} appointments to remind`);

    if (!appointments || appointments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No appointments need reminders", results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each appointment
    for (const appointment of appointments) {
      try {
        // Check if reminder was already sent (stored in notes or a separate tracking table)
        if (appointment.notes?.includes("[REMINDER_SENT]")) {
          results.push({
            appointment_id: appointment.id,
            status: "skipped",
            message: "Reminder already sent",
          });
          continue;
        }
        const companyData = appointment.companies as unknown as { name: string; twilio_number: string; timezone: string } | null;
        const serviceData = appointment.services as unknown as { name: string; duration_minutes: number } | null;

        if (!companyData?.twilio_number) {
          results.push({
            appointment_id: appointment.id,
            status: "skipped",
            message: "Company has no Twilio number configured",
          });
          continue;
        }

        if (!appointment.customer_phone) {
          results.push({
            appointment_id: appointment.id,
            status: "skipped",
            message: "No customer phone number",
          });
          continue;
        }

        // Get Twilio credentials for this company
        const { data: integration } = await supabase
          .from("integrations")
          .select("config_json, status")
          .eq("company_id", appointment.company_id)
          .eq("provider", "twilio")
          .eq("status", "connected")
          .single();

        if (!integration) {
          results.push({
            appointment_id: appointment.id,
            status: "skipped",
            message: "Twilio integration not configured",
          });
          continue;
        }

        const config = integration.config_json as { account_sid: string; auth_token: string };
        if (!config.account_sid || !config.auth_token) {
          results.push({
            appointment_id: appointment.id,
            status: "skipped",
            message: "Missing Twilio credentials",
          });
          continue;
        }

        // Format the appointment time
        const appointmentTime = new Date(appointment.start_datetime);
        const formattedTime = appointmentTime.toLocaleString("en-US", {
          timeZone: companyData.timezone || "America/New_York",
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        const message = `Reminder: You have an appointment at ${companyData.name} tomorrow, ${formattedTime}${serviceData ? ` for ${serviceData.name}` : ""}. Reply CONFIRM to confirm or CANCEL to cancel.`;

        // Send SMS via Twilio
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
        const authHeader = btoa(`${config.account_sid}:${config.auth_token}`);

        const formData = new URLSearchParams();
        formData.append("To", appointment.customer_phone);
        formData.append("From", companyData.twilio_number);
        formData.append("Body", message);

        console.log(`[send-appointment-reminders] Sending reminder for appointment ${appointment.id}`);

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        const twilioResult = await twilioResponse.json();

        if (!twilioResponse.ok) {
          console.error(`[send-appointment-reminders] Twilio error:`, twilioResult);
          results.push({
            appointment_id: appointment.id,
            status: "failed",
            message: twilioResult.message || "Twilio API error",
          });
          continue;
        }

        // Mark appointment as reminded (update notes)
        const updatedNotes = `${appointment.notes || ""}\n[REMINDER_SENT] ${new Date().toISOString()} - SID: ${twilioResult.sid}`.trim();
        await supabase
          .from("appointments")
          .update({ notes: updatedNotes })
          .eq("id", appointment.id);

        // Log system event
        await supabase.from("system_events").insert({
          company_id: appointment.company_id,
          event_type: "reminder_sent",
          source: "send-appointment-reminders",
          message: `24-hour reminder sent for appointment with ${appointment.customer_name}`,
          metadata: {
            appointment_id: appointment.id,
            customer_phone: appointment.customer_phone.substring(0, 6) + "...",
            message_sid: twilioResult.sid,
          },
        });

        results.push({
          appointment_id: appointment.id,
          status: "sent",
        });

        console.log(`[send-appointment-reminders] Reminder sent for ${appointment.id}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[send-appointment-reminders] Error processing ${appointment.id}:`, errorMessage);
        errors.push(`${appointment.id}: ${errorMessage}`);
        results.push({
          appointment_id: appointment.id,
          status: "failed",
          message: errorMessage,
        });
      }
    }

    const summary = {
      total: appointments.length,
      sent: results.filter(r => r.status === "sent").length,
      skipped: results.filter(r => r.status === "skipped").length,
      failed: results.filter(r => r.status === "failed").length,
    };

    console.log("[send-appointment-reminders] Completed:", summary);

    return new Response(
      JSON.stringify({ summary, results, errors: errors.length > 0 ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[send-appointment-reminders] Fatal error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, results, errors }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
